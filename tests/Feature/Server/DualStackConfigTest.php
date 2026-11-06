<?php

namespace Tests\Feature\Server;

use App\Models\Server;
use App\Models\ServerMachine;
use App\Services\NodeRegistry;
use App\WebSocket\NodeEventHandlers;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Mockery;
use Tests\TestCase;
use Workerman\Connection\TcpConnection;

class DualStackConfigTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Bus::fake();
        admin_setting(['server_token' => 'dual-stack-test-token']);
    }

    private function nodes(ServerMachine $machine): array
    {
        $nodes = [];
        foreach (['vless', 'shadowsocks', 'hysteria'] as $type) {
            $nodes[] = Server::create([
                'name' => "dual-stack-{$type}", 'type' => $type, 'machine_id' => $machine->id,
                'host' => 'node.example.test', 'port' => 443, 'server_port' => 8443,
                'rate' => 1, 'enabled' => true,
                'protocol_settings' => match ($type) {
                    'shadowsocks' => ['cipher' => 'chacha20-ietf-poly1305'],
                    'hysteria' => ['version' => 2, 'tls' => ['server_name' => 'node.example.test'],
                        'bandwidth' => ['up' => 100, 'down' => 100], 'obfs' => ['open' => false]],
                    default => ['network' => 'tcp', 'tls' => 0],
                },
            ]);
        }
        $nodes[] = Server::create([
            'name' => 'dual-stack-cdn', 'type' => 'vless', 'machine_id' => $machine->id,
            'host' => 'edge.example.test', 'port' => 443, 'server_port' => 8443,
            'rate' => 1, 'enabled' => true, 'protocol_settings' => ['network' => 'xhttp', 'tls' => 1],
            'cdn_settings' => ['enabled' => true, 'type' => 'vless', 'server' => [
                'host' => 'origin.example.test', 'port' => 443, 'server_port' => 9443,
                'protocol_settings' => ['network' => 'xhttp', 'tls' => 0, 'target_kernel' => 'xray'],
            ]],
        ]);
        return $nodes;
    }

    public function test_node_and_machine_rest_configs_use_dual_stack_including_cdn_origin(): void
    {
        $machine = ServerMachine::create(['name' => 'dual-stack', 'token' => 'dual-stack-machine-token', 'is_active' => true]);
        foreach ($this->nodes($machine) as $node) {
            foreach (['token=dual-stack-test-token', 'token=dual-stack-machine-token&machine_id=' . $machine->id] as $auth) {
                $this->getJson('/api/v2/server/config?' . $auth . '&node_id=' . $node->id)
                    ->assertOk()->assertJsonPath('listen_ip', '::')
                    ->assertJsonPath('server_port', $node->name === 'dual-stack-cdn' ? 9443 : 8443);
            }
        }
    }

    public function test_node_and_machine_websocket_full_sync_use_dual_stack(): void
    {
        $machine = ServerMachine::create(['name' => 'dual-stack-ws', 'token' => 'dual-stack-ws-token', 'is_active' => true]);
        foreach ($this->nodes($machine) as $node) {
            foreach ([false, true] as $machineMode) {
                $messages = [];
                $conn = Mockery::mock(TcpConnection::class);
                if ($machineMode) $conn->machineNodeIds = [$node->id];
                $conn->shouldReceive('send')->twice()->andReturnUsing(function ($payload) use (&$messages) {
                    $messages[] = json_decode($payload, true, flags: JSON_THROW_ON_ERROR);
                    return true;
                });
                NodeRegistry::add($node->id, $conn);
                try {
                    NodeEventHandlers::pushFullSync($conn, $node);
                    $this->assertSame('sync.config', $messages[0]['event']);
                    $this->assertSame('::', $messages[0]['data']['config']['listen_ip']);
                    $this->assertSame($node->name === 'dual-stack-cdn' ? 9443 : 8443, $messages[0]['data']['config']['server_port']);
                    if ($machineMode) $this->assertSame($node->id, $messages[0]['data']['node_id']);
                } finally {
                    NodeRegistry::remove($node->id, $conn);
                }
            }
        }
    }
}
