<?php

namespace Tests\Feature\Admin;

use App\Models\Server;
use App\Models\ServerMachine;
use App\Models\User;
use App\Protocols\General;
use App\Services\ServerService;
use App\Support\ServerTransport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Redis;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

final class CdnSettingsTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = User::create([
            'uuid' => '7f894d8b-0d1c-4612-a901-b1475c06f513',
            'token' => str_repeat('a', 32), 'email' => 'cdn@example.test',
            'password' => bcrypt('temporary'), 'is_admin' => true,
            'u' => 0, 'd' => 0, 'transfer_enable' => 1073741824,
        ]);
        Sanctum::actingAs($this->admin);
        admin_setting(['server_ws_enable' => 0, 'server_token' => 'cdn-server-token']);
    }

    private function adminPath(): string
    {
        return '/api/v2/' . hash('crc32b', config('app.key')) . '/server/manage';
    }

    private function payload(): array
    {
        return [
            'type' => 'vless', 'name' => 'isolated-cdn', 'host' => 'edge.example.test', 'port' => 443,
            'server_port' => 8443, 'rate' => 1, 'enabled' => true, 'show' => true,
            'protocol_settings' => [
                'tls' => 1, 'network' => 'xhttp', 'target_kernel' => 'xray',
                'network_settings' => ['path' => '/edge', 'mode' => 'packet-up'],
            ],
            'cdn_settings' => ['enabled' => true, 'type' => 'vless', 'server' => [
                'host' => 'origin.example.test', 'port' => 443, 'server_port' => 9443,
                'protocol_settings' => [
                    'tls' => 0, 'network' => 'xhttp', 'target_kernel' => 'xray',
                    'network_settings' => ['path' => '/origin', 'extra' => []],
                ],
            ]],
        ];
    }

    public function test_http_credentials_share_origin_config_and_subscription_uses_outer_connection(): void
    {
        $machine = ServerMachine::create(['name' => 'cdn-test', 'token' => 'cdn-machine-token', 'is_active' => true]);
        $payload = $this->payload();
        $payload['machine_id'] = $machine->id;
        $this->postJson($this->adminPath() . '/save', $payload)->assertOk();
        $node = Server::latest('id')->firstOrFail();
        $this->getJson($this->adminPath() . '/getNodes')->assertOk()
            ->assertJsonPath('data.0.cdn_settings.server.host', 'origin.example.test');
        $base = '/api/v2/server/config?node_id=' . $node->id;
        $single = $this->getJson($base . '&token=cdn-server-token')->assertOk();
        $single->assertJsonPath('server_port', 9443)
            ->assertJsonPath('tls', 0)->assertJsonPath('networkSettings.path', '/origin');
        $this->assertStringContainsString('"extra":{}', $single->getContent());
        $machineResponse = $this->getJson($base . '&token=cdn-machine-token&machine_id=' . $machine->id)->assertOk();
        $this->assertSame($single->json(), $machineResponse->json());

        $client = ServerTransport::clientPayload([
            ...$node->makeVisible('cdn_settings')->toArray(),
            'password' => $this->admin->uuid,
        ]);
        $this->assertArrayNotHasKey('cdn_settings', $client);
        $this->assertArrayNotHasKey('server_port', $client);
        $link = General::buildVless($this->admin->uuid, $client);
        $this->assertStringContainsString('edge.example.test:443', $link);
        $this->assertStringContainsString('path=%2Fedge', $link);
        $this->assertStringNotContainsString('origin', $link);
    }

    public function test_outer_changes_keep_etag_and_do_not_publish_a_config_push(): void
    {
        $payload = $this->payload();
        $node = Server::create($payload);
        $url = '/api/v2/server/config?token=cdn-server-token&node_id=' . $node->id;
        $etag = $this->getJson($url)->assertOk()->headers->get('ETag');
        Cache::put("node_ws_alive:{$node->id}", true);
        $pushes = [];
        Redis::shouldReceive('publish')->withArgs(function ($channel, $body) use (&$pushes) {
            $this->assertSame('node:push', $channel);
            $pushes[] = json_decode($body, true, flags: JSON_THROW_ON_ERROR);
            return true;
        })->andReturn(1);
        $payload['id'] = $node->id;
        $payload['host'] = 'other-edge.example.test';
        $payload['protocol_settings']['network_settings']['path'] = '/changed';
        $this->postJson($this->adminPath() . '/save', $payload)->assertOk();
        $this->getJson($url, ['If-None-Match' => $etag])->assertStatus(304);
        $this->assertSame([], $pushes);

        $payload['cdn_settings']['server']['server_port'] = 9444;
        $this->postJson($this->adminPath() . '/save', $payload)->assertOk();
        $this->assertCount(1, $pushes);
        $this->assertSame('sync.config', $pushes[0]['event']);
        $response = $this->getJson($url, ['If-None-Match' => $etag])->assertOk();
        $this->assertSame(9444, $response->json('server_port'));
        $this->assertSame($response->json('networkSettings'), $pushes[0]['data']['config']['networkSettings']);
    }

    public function test_missing_origin_is_rejected_and_disable_preserves_draft(): void
    {
        $payload = $this->payload();
        $node = Server::create($payload);
        $payload['id'] = $node->id;
        $invalid = $payload;
        unset($invalid['cdn_settings']['server']['server_port']);
        $this->postJson($this->adminPath() . '/save', $invalid)->assertStatus(422);
        $this->assertSame(9443, ServerService::buildNodeConfig($node->fresh())['server_port']);

        $payload['cdn_settings']['enabled'] = false;
        $this->postJson($this->adminPath() . '/save', $payload)->assertOk();
        $fresh = $node->fresh();
        $this->assertFalse($fresh->cdn_settings['enabled']);
        $this->assertSame(8443, ServerService::buildNodeConfig($fresh)['server_port']);
        $this->assertSame(9443, $fresh->cdn_settings['server']['server_port']);
    }

    public function test_switch_moves_fallback_to_the_active_configuration(): void
    {
        $payload = $this->payload();
        $payload['protocol_settings'] = ['tls' => 1, 'network' => 'tcp', 'xray_fallback' => '127.0.0.1:8080'];
        $payload['cdn_settings']['server']['protocol_settings'] = ['tls' => 1, 'network' => 'tcp'];
        $this->postJson($this->adminPath() . '/save', $payload)->assertOk();
        $node = Server::latest('id')->firstOrFail();
        $this->assertSame('', $node->protocol_settings['xray_fallback']);
        $this->assertSame('127.0.0.1:8080', ServerService::buildNodeConfig($node)['xray_fallback']);

        $payload['id'] = $node->id;
        $payload['cdn_settings']['enabled'] = false;
        $payload['cdn_settings']['server']['protocol_settings']['xray_fallback'] = '127.0.0.1:8081';
        $this->postJson($this->adminPath() . '/save', $payload)->assertOk();
        $this->assertSame('127.0.0.1:8081', $node->fresh()->protocol_settings['xray_fallback']);
    }
}
