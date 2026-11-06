<?php

namespace Tests\Feature\Server;

use App\Models\Server;
use App\Models\User;
use App\Services\DeviceStateService;
use App\WebSocket\NodeEventHandlers;
use App\WebSocket\NodeWorker;
use App\Services\NodeRegistry;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;
use Workerman\Connection\TcpConnection;

class DeviceStateTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Bus::fake();
        // phpunit.xml reserves Redis database 14 for these integration tests.
        $this->assertSame(14, (int) config('database.redis.default.database'));
        Redis::flushdb();
        admin_setting(['server_token' => 'device-test-token']);
    }

    private function user(int $id): User
    {
        return User::forceCreate([
            'id' => $id, 'email' => "device-{$id}@example.test", 'password' => 'test-hash',
            'uuid' => sprintf('00000000-0000-4000-8000-%012d', $id),
            'token' => sprintf('%032d', $id), 'online_count' => 0,
        ]);
    }

    public function test_complete_snapshots_deduplicate_ips_and_remove_only_the_target_node(): void
    {
        $user = $this->user(1);
        $service = app(DeviceStateService::class);
        $service->setDevices($user->id, 10, ['192.0.2.1:1234', '192.0.2.1']);
        $service->setDevices($user->id, 20, ['[2001:db8::1]:443']);
        $this->assertSame(2, $service->getDeviceCount($user->id));
        $service->replaceNodeDevices(10, []);
        $this->assertSame(1, $service->getDeviceCount($user->id));
        $this->assertSame(1, $user->fresh()->online_count);
        $this->assertSame([], $service->getNodeDevices(10));
        $this->assertSame([1 => ['2001:db8::1']], $service->getNodeDevices(20));
    }

    public function test_unchanged_heartbeat_refreshes_the_expiring_device_state(): void
    {
        $this->user(1);
        $service = app(DeviceStateService::class);
        $service->replaceNodeDevices(10, [1 => ['192.0.2.1']]);
        Redis::hset('user_devices:1', '10:192.0.2.1', time() - 301);
        Redis::expire('user_devices:1', 1);
        $this->assertSame(0, $service->getDeviceCount(1));
        $service->replaceNodeDevices(10, [1 => ['192.0.2.1']]);
        $this->assertSame(1, $service->getDeviceCount(1));
        $this->assertGreaterThan(290, Redis::ttl('user_devices:1'));
    }

    public function test_http_empty_snapshot_clears_devices_but_an_absent_field_does_not(): void
    {
        $this->user(1);
        $node = Server::create(['name' => 'devices', 'type' => 'vless', 'host' => 'example.test',
            'port' => 443, 'server_port' => 443, 'rate' => 1, 'enabled' => true]);
        $auth = ['token' => 'device-test-token', 'node_id' => $node->id];
        $this->postJson('/api/v2/server/report', $auth + ['alive' => [1 => ['192.0.2.1']]])->assertOk();
        $this->postJson('/api/v2/server/report', $auth)->assertOk();
        $service = app(DeviceStateService::class);
        $this->assertSame(1, $service->getDeviceCount(1));
        $this->postJson('/api/v2/server/report', $auth + ['alive' => (object) []])->assertOk();
        $this->assertSame(0, $service->getDeviceCount(1));
        $this->assertSame(0, User::find(1)->online_count);
    }

    public function test_websocket_machine_and_single_node_snapshots_share_the_same_contract(): void
    {
        $this->user(1);
        $conn = (new \ReflectionClass(TcpConnection::class))->newInstanceWithoutConstructor();
        NodeEventHandlers::handleDeviceReport($conn, 10, ['devices' => [1 => ['192.0.2.1']]]);
        $this->assertSame(1, app(DeviceStateService::class)->getDeviceCount(1));
        NodeEventHandlers::handleDeviceReport($conn, 10, []);
        $this->assertSame(0, User::find(1)->online_count);
    }

    public function test_pre_index_state_is_imported_and_only_target_members_are_read(): void
    {
        $this->user(1);
        Redis::hmset('user_devices:1', ['10:192.0.2.1' => time(), '20:192.0.2.2' => time()]);
        for ($id = 2; $id <= 1000; $id++) Redis::hset('user_devices:' . $id, '20:192.0.2.2', time());
        $service = app(DeviceStateService::class);
        $this->assertSame([1 => ['192.0.2.1']], $service->getNodeDevices(10));
        $this->assertSame(1, Redis::zcard('node_devices:10'));
        // This fresh unrelated legacy key must not be scanned by warmed reads.
        Redis::hset('user_devices:1001', '10:192.0.2.3', time());
        $this->assertSame([1 => ['192.0.2.1']], $service->getNodeDevices(10));
        $service->replaceNodeDevices(10, []);
        $other = $service->getNodeDevices(20);
        $this->assertCount(1000, $other);
        $this->assertSame(['192.0.2.2'], $other[1]);
    }

    public function test_unchanged_reports_do_not_rewrite_rows_and_changes_bypass_the_throttle(): void
    {
        $user = $this->user(1);
        $service = app(DeviceStateService::class);
        $service->replaceNodeDevices(10, [1 => ['192.0.2.1']]);
        $marker = now()->addDay();
        User::whereKey(1)->update(['updated_at' => $marker->timestamp]);
        for ($i = 0; $i < 5; $i++) $service->replaceNodeDevices(10, [1 => ['192.0.2.1']]);
        $this->assertSame($marker->timestamp, $user->fresh()->updated_at);
        $service->replaceNodeDevices(10, []);
        $this->assertSame(0, $user->fresh()->online_count);
    }

    public function test_failed_sql_write_remains_pending_even_after_a_complete_clear(): void
    {
        $this->user(1);
        $service = app(DeviceStateService::class);
        $service->replaceNodeDevices(10, [1 => ['192.0.2.1']]);
        $db = DB::getFacadeRoot();
        DB::shouldReceive('transaction')->once()->andThrow(new \RuntimeException('simulated SQL outage'));
        try {
            $service->replaceNodeDevices(10, []);
            $this->fail('Expected the SQL failure');
        } catch (\RuntimeException $e) {
            $this->assertSame('simulated SQL outage', $e->getMessage());
        } finally { DB::swap($db); }
        $this->assertTrue((bool) Redis::hexists('node_devices:pending:10', '1'));
        $service->replaceNodeDevices(10, []);
        $this->assertSame(0, User::find(1)->online_count);
        $this->assertSame(0, Redis::hlen('node_devices:pending:10'));
    }

    public function test_a_replaced_websocket_cannot_clear_the_new_connections_state(): void
    {
        $this->user(1);
        $service = app(DeviceStateService::class);
        $service->replaceNodeDevices(10, [1 => ['192.0.2.1']]);
        $reflection = new \ReflectionClass(TcpConnection::class);
        $old = $reflection->newInstanceWithoutConstructor(); $old->nodeId = 10;
        $new = $reflection->newInstanceWithoutConstructor();
        NodeRegistry::add(10, $new);
        try {
            $worker = (new \ReflectionClass(NodeWorker::class))->newInstanceWithoutConstructor();
            $worker->onClose($old);
            $this->assertSame(1, $service->getDeviceCount(1));
            $this->assertSame($new, NodeRegistry::get(10));
        } finally { NodeRegistry::remove(10, $new); }
    }
}
