<?php

namespace Tests\Feature\Admin;

use App\Models\Server;
use App\Models\ServerMachine;
use App\Models\User;
use App\Protocols\ClashMeta;
use App\Protocols\Clash;
use App\Protocols\Stash;
use App\Protocols\General;
use App\Protocols\SingBox;
use App\Services\ServerService;
use App\Support\ServerFallback;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class FallbackConfigTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = User::create([
            'uuid' => '7f894d8b-0d1c-4612-a901-b1475c06f513', 'token' => str_repeat('b', 32),
            'email' => 'fallback-admin@example.test', 'password' => bcrypt('local-test'), 'is_admin' => true,
            'u' => 0, 'd' => 0, 'transfer_enable' => 1073741824,
        ]);
        Sanctum::actingAs($this->admin);
        admin_setting(['server_ws_enable' => 0, 'server_token' => 'local-server-token']);
    }

    private function adminPath(): string
    {
        return '/api/v2/' . hash('crc32b', config('app.key')) . '/server/manage';
    }

    private function payload(string $type = 'vless', int $tls = 1, mixed $fallback = ''): array
    {
        return [
            'name' => 'local-fallback', 'type' => $type, 'host' => '127.0.0.1',
            'port' => 18443, 'server_port' => 18443, 'rate' => 1, 'group_ids' => [],
            'show' => true, 'enabled' => true,
            'protocol_settings' => [
                'tls' => $tls, 'network' => 'tcp', 'xray_fallback' => $fallback,
                'tls_settings' => ['server_name' => 'fallback.example.test'],
                'reality_settings' => ['server_name' => 'fallback.example.test', 'server_port' => 443,
                    'public_key' => 'local-public-key', 'private_key' => 'local-private-key', 'short_id' => '0123456789abcdef'],
                'flow' => '',
                'utls' => ['enabled' => true, 'fingerprint' => 'chrome'],
            ],
        ];
    }

    public function test_admin_create_update_and_reopen_preserve_valid_targets(): void
    {
        foreach (['vless', 'trojan'] as $type) {
            foreach ([1, 2] as $tls) {
                $this->postJson($this->adminPath() . '/save', $this->payload($type, $tls, ' Example.COM:08443 '))
                    ->assertOk()->assertJson(['data' => true]);
                $node = Server::latest('id')->firstOrFail();
                $this->assertSame('example.com:8443', $node->protocol_settings['xray_fallback']);
                $rows = $this->getJson($this->adminPath() . '/getNodes')->assertOk()->json('data');
                $saved = collect($rows)->firstWhere('id', $node->id);
                $this->assertSame('example.com:8443', $saved['protocol_settings']['xray_fallback']);
                $saved['protocol_settings']['xray_fallback'] = '[::1]:8443';
                $this->postJson($this->adminPath() . '/save', $saved)->assertOk();
                $this->assertSame('[::1]:8443', $node->fresh()->protocol_settings['xray_fallback']);
            }
        }
    }

    public function test_invalid_values_clear_the_previous_setting_without_rejecting_save(): void
    {
        $node = Server::create($this->payload('vless', 1, '127.0.0.1:8080'));
        foreach (['', null, [], ['dest' => '127.0.0.1:8080'], 8080, 'https://site.test:443', 'host:0', 'host:65536',
            '999.0.0.1:80', 'host:80/path', 'a b:80', '::1:443', 'site.test', '/run/site.sock'] as $bad) {
            $payload = $this->payload('vless', 1, $bad);
            $payload['id'] = $node->id;
            $this->postJson($this->adminPath() . '/save', $payload)->assertOk()->assertJson(['data' => true]);
            $this->assertSame('', $node->fresh()->protocol_settings['xray_fallback']);
            $this->assertArrayNotHasKey('xray_fallback', ServerService::buildNodeConfig($node->fresh()));
        }
    }

    public function test_ineligible_transport_and_security_are_cleared(): void
    {
        foreach (['ws', 'grpc', 'xhttp'] as $network) {
            $payload = $this->payload('vless', 1, '127.0.0.1:8080');
            $payload['protocol_settings']['network'] = $network;
            $node = Server::create($payload);
            $this->assertSame('', $node->protocol_settings['xray_fallback']);
        }
        $node = Server::create($this->payload('vless', 0, '127.0.0.1:8080'));
        $this->assertSame('', $node->protocol_settings['xray_fallback']);
        $payload = $this->payload('vless', 1, '127.0.0.1:8080');
        $payload['protocol_settings']['encryption'] = ['enabled' => true, 'decryption' => 'mlkem-test'];
        $node = Server::create($payload);
        $this->assertSame('', $node->protocol_settings['xray_fallback']);
        $payload['protocol_settings']['tls'] = 2;
        $node = Server::create($payload);
        $this->assertSame('127.0.0.1:8080', $node->protocol_settings['xray_fallback']);
    }

    public function test_node_and_machine_tokens_receive_the_same_server_only_field(): void
    {
        $machine = ServerMachine::create(['name' => 'local-machine', 'token' => 'local-machine-token', 'is_active' => true]);
        $payload = $this->payload('vless', 2, '127.0.0.1:8443');
        $payload['machine_id'] = $machine->id;
        $node = Server::create($payload);
        $this->getJson('/api/v2/server/config?token=local-server-token&node_id=' . $node->id)
            ->assertOk()->assertJsonPath('xray_fallback', '127.0.0.1:8443');
        $this->getJson('/api/v2/server/config?token=local-machine-token&machine_id=' . $machine->id . '&node_id=' . $node->id)
            ->assertOk()->assertJsonPath('xray_fallback', '127.0.0.1:8443');
        $this->assertSame('fallback.example.test', ServerService::buildNodeConfig($node)['tls_settings']['server_name']);
    }

    public function test_client_subscriptions_do_not_change_or_expose_the_server_target(): void
    {
        foreach (['vless', 'trojan'] as $type) {
            foreach ([1, 2] as $tls) {
                $node = Server::create($this->payload($type, $tls));
                foreach ([SingBox::class, Clash::class, ClashMeta::class, Stash::class, General::class] as $protocol) {
                    $render = function () use ($protocol, $node) {
                        $server = $node->fresh()->toArray();
                        $server['password'] = $this->admin->uuid;
                        $instance = new $protocol($this->admin->toArray(), [$server], 'sing-box', '1.14.4');
                        $response = $instance->handle();
                        return is_object($response) && method_exists($response, 'getContent') ? $response->getContent() : (string) $response;
                    };
                    $node->protocol_settings = array_replace($node->protocol_settings, ['xray_fallback' => '']);
                    $node->save();
                    $before = $render();
                    $node->protocol_settings = array_replace($node->protocol_settings, ['xray_fallback' => '127.0.0.1:18444']);
                    $node->save();
                    $after = $render();
                    $this->assertSame($before, $after, $protocol . ' client output changed');
                    $this->assertStringNotContainsString('xray_fallback', $after);
                    $this->assertStringNotContainsString('18444', $after);
                }
            }
        }
    }

    public function test_target_parser_accepts_only_explicit_host_and_port(): void
    {
        foreach (['127.0.0.1:8080', 'localhost:8443', 'site.example:443', '[2001:db8::1]:8443'] as $target) {
            $this->assertSame($target, ServerFallback::target($target));
        }
    }
}
