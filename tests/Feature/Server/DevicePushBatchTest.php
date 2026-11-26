<?php

namespace Tests\Feature\Server;

use App\Models\Server;
use App\Services\DeviceStateService;
use App\Services\NodeRegistry;
use App\Services\Plugin\HookManager;
use App\WebSocket\NodeEventHandlers;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Mockery;
use Tests\TestCase;
use Workerman\Connection\TcpConnection;

class DevicePushBatchTest extends TestCase
{
    use RefreshDatabase;

    public function test_reuses_matching_groups_and_keeps_each_nodes_authorized_devices(): void
    {
        $this->verifyDelivery(false);
    }

    public function test_node_specific_filter_is_evaluated_for_each_node_on_every_push(): void
    {
        $this->verifyDelivery(true);
    }

    public function test_pending_node_can_be_delivered_by_another_worker(): void
    {
        $node = Server::withoutEvents(fn () => Server::create([
            'name' => 'remote owner', 'group_ids' => [], 'type' => 'vless',
            'rate' => 1, 'host' => '127.0.0.1', 'port' => 443, 'server_port' => 443,
        ]));
        $this->assertNull(NodeRegistry::get($node->id));
        $service = $this->mock(DeviceStateService::class);
        $service->shouldReceive('getUsersDevices')->once()->with([])->andReturn([]);
        $deliveries = [];
        NodeEventHandlers::pushDeviceStateToNodes([$node->id], $service, static function (int $id, array $devices) use (&$deliveries) {
            $deliveries[$id] = $devices;
        });
        $this->assertSame([$node->id => []], $deliveries);
    }

    private function verifyDelivery(bool $withFilter): void
    {
        foreach ([1, 2, 3] as $id) {
            DB::table('v2_user')->insert(['id' => $id, 'email' => "$id@example.test", 'password' => 'fixture',
                'uuid' => str_pad($id, 36, '0', STR_PAD_LEFT), 'token' => str_repeat((string) $id, 32),
                'plan_id' => 1, 'group_id' => $id, 'transfer_enable' => 100, 'expired_at' => null,
                'created_at' => time(), 'updated_at' => time()]);
        }
        $ids = [];
        foreach ([[1, 2], [2, 1], [2, 3], [3], []] as $groups) {
            $node = Server::withoutEvents(fn () => Server::create(['name' => 'test', 'group_ids' => $groups,
                'type' => 'vless', 'rate' => 1, 'host' => '127.0.0.1', 'port' => 443, 'server_port' => 443]));
            $ids[] = $node->id;
        }
        [$a, $b, $c, $offline, $empty] = $ids;
        $conn = Mockery::mock(TcpConnection::class);
        $conn->machineNodeIds = [$a, $b, $c, $empty];
        $messages = [];
        $conn->shouldReceive('send')->andReturnUsing(function ($json) use (&$messages) {
            $event = json_decode($json, true);
            $this->assertSame('sync.devices', $event['event']);
            $messages[$event['data']['node_id']][] = array_keys($event['data']['users']);
            return true;
        });
        $service = $this->mock(DeviceStateService::class);
        $service->shouldReceive('getUsersDevices')->times($withFilter ? 8 : 6)
            ->andReturnUsing(static fn ($users) => array_fill_keys($users, ['192.0.2.5']));
        foreach ($conn->machineNodeIds as $id) NodeRegistry::add($id, $conn);
        if ($withFilter) {
            HookManager::registerFilter('server.users.get', static fn ($users, $node) =>
                $node->id === $b ? $users->where('id', 2) : $users);
        }
        try {
            NodeEventHandlers::pushDeviceStateToNodes($ids, $service);
            DB::table('v2_user')->where('id', 1)->update(['banned' => 1]);
            NodeEventHandlers::pushDeviceStateToNodes($ids, $service);
            $this->assertSame([[1, 2], [2]], $messages[$a]);
            $this->assertSame([$withFilter ? [2] : [1, 2], [2]], $messages[$b]);
            $this->assertSame([[2, 3], [2, 3]], $messages[$c]);
            $this->assertSame([[], []], $messages[$empty]);
            $this->assertArrayNotHasKey($offline, $messages);
        } finally {
            if ($withFilter) HookManager::remove('server.users.get');
            foreach ($conn->machineNodeIds as $id) NodeRegistry::remove($id, $conn);
        }
    }
}
