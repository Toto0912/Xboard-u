<?php

namespace Tests\Feature\Admin;

use App\Models\Server;
use App\Models\ServerMachine;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class NativeCustomConfigTest extends TestCase
{
    use RefreshDatabase;

    private function adminPath(): string
    {
        return '/api/v2/' . hash('crc32b', config('app.key')) . '/server/manage';
    }

    protected function setUp(): void
    {
        parent::setUp();
        Sanctum::actingAs(User::create([
            'uuid' => '7f894d8b-0d1c-4612-a901-b1475c06f513', 'token' => str_repeat('b', 32),
            'email' => 'native-admin@example.test', 'password' => bcrypt('local-test'), 'is_admin' => true,
            'u' => 0, 'd' => 0, 'transfer_enable' => 1073741824,
        ]));
        admin_setting(['server_ws_enable' => 0, 'server_token' => 'local-server-token']);
    }

    private function payload(array $outbounds, array $routes): array
    {
        return ['name' => 'native-local', 'type' => 'vless', 'host' => '127.0.0.1', 'port' => 18443,
            'server_port' => 18443, 'rate' => 1, 'show' => true, 'enabled' => true,
            'protocol_settings' => ['tls' => 0, 'network' => 'tcp', 'utls' => ['enabled' => true, 'fingerprint' => 'chrome']],
            'custom_outbounds' => $outbounds, 'custom_routes' => $routes];
    }

    public function test_native_and_legacy_arrays_round_trip_and_reach_both_node_modes_without_field_loss(): void
    {
        $machine = ServerMachine::create(['name' => 'native-machine', 'token' => 'local-machine-token', 'is_active' => true]);
        $examples = [
            [[['tag' => 'proxy', 'type' => 'socks', 'server' => '127.0.0.1', 'server_port' => 1080,
                'version' => '5', 'detour' => 'direct', 'udp_over_tcp' => (object) [], 'future_field' => (object) ['keep' => false]]],
                [['action' => 'route', 'outbound' => 'proxy']]],
            [[['tag' => 'proxy', 'protocol' => 'socks', 'settings' => ['servers' => [['address' => '127.0.0.1', 'port' => 1080]]],
                'streamSettings' => ['network' => 'tcp', 'sockopt' => ['mark' => 123]], 'mux' => (object) ['enabled' => false]]],
                [['localPort' => '443', 'outboundTag' => 'proxy']]],
            [[['tag' => 'proxy', 'protocol' => 'socks', 'settings' => ['server' => '127.0.0.1', 'server_port' => 1080], 'proxy_tag' => 'direct']],
                [['action' => 'route', 'outbound' => 'proxy']]],
            [[['tag' => 'proxy', 'protocol' => 'freedom', 'settings' => (object) []]],
                [['outboundTag' => 'proxy', 'network' => 'tcp,udp']]],
        ];
        foreach ($examples as [$outbounds, $routes]) {
            $payload = $this->payload($outbounds, $routes);
            $payload['machine_id'] = $machine->id;
            $this->postJson($this->adminPath() . '/save', $payload)->assertOk()->assertJson(['data' => true]);
            $node = Server::latest('id')->firstOrFail();
            $expectedOut = json_encode($outbounds);
            $expectedRoute = json_encode($routes);
            $this->assertJsonStringEqualsJsonString($expectedOut, json_encode($node->fresh()->custom_outbounds));
            $rows = $this->getJson($this->adminPath() . '/getNodes')->assertOk()->json('data');
            $saved = collect($rows)->firstWhere('id', $node->id);
            // JSON response decoding in test helpers uses arrays; inspect the
            // raw response too so an empty {} changing to [] cannot pass.
            $raw = $this->getJson($this->adminPath() . '/getNodes')->getContent();
            $entry = collect(json_decode($raw)->data)->firstWhere('id', $node->id);
            $this->assertJsonStringEqualsJsonString($expectedOut, json_encode($entry->custom_outbounds));
            $saved['custom_outbounds'] = $entry->custom_outbounds;
            $this->postJson($this->adminPath() . '/save', $saved)->assertOk();
            foreach (['token=local-server-token', 'token=local-machine-token&machine_id=' . $machine->id] as $query) {
                $response = $this->getJson('/api/v2/server/config?' . $query . '&node_id=' . $node->id)->assertOk();
                $json = json_decode($response->getContent());
                $this->assertJsonStringEqualsJsonString($expectedOut, json_encode($json->custom_outbounds));
                $this->assertJsonStringEqualsJsonString($expectedRoute, json_encode($json->custom_routes));
            }
        }
    }

    public function test_bad_shapes_mixed_formats_and_duplicate_tags_are_rejected_without_saving(): void
    {
        foreach ([
            ['tag' => 'proxy', 'type' => 'socks'],
            [null],
            [['tag' => 'proxy', 'type' => 'socks', 'protocol' => 'socks']],
            [['tag' => 'proxy', 'type' => 'socks', 'settings' => []]],
            [['tag' => 'proxy', 'type' => 'socks'], ['tag' => 'proxy', 'type' => 'direct']],
            [['tag' => 'proxy', 'type' => 'socks', 'detour' => 'proxy']],
        ] as $bad) {
            $this->postJson($this->adminPath() . '/save', $this->payload($bad, []))->assertStatus(422);
        }
        foreach ([[null], [['action' => 'route', 'outbound' => 'proxy', 'outboundTag' => 'proxy']], [['action' => ['type' => 'route']]]] as $bad) {
            $this->postJson($this->adminPath() . '/save', $this->payload([], $bad))->assertStatus(422);
        }
        $this->assertSame(0, Server::count());
    }

    public function test_native_logical_rules_and_nonrouting_actions_are_preserved(): void
    {
        $routes = [['type' => 'logical', 'mode' => 'or', 'rules' => [['domain_suffix' => ['example.com']], ['port' => 443]],
            'action' => 'reject'], ['action' => 'sniff', 'timeout' => '100ms']];
        $this->postJson($this->adminPath() . '/save', $this->payload([], $routes))->assertOk();
        $this->assertJsonStringEqualsJsonString(json_encode($routes), json_encode(Server::firstOrFail()->custom_routes));
    }
    public function test_server_only_configuration_does_not_enter_client_subscriptions(): void
    {
        $user = User::firstOrFail();
        $node = Server::create($this->payload([], []));
        foreach ([\App\Protocols\SingBox::class, \App\Protocols\ClashMeta::class, \App\Protocols\Stash::class, \App\Protocols\General::class] as $protocol) {
            $render = function () use ($protocol, $node, $user) {
                $row = $node->fresh()->toArray();
                $row['password'] = $user->uuid;
                $response = (new $protocol($user->toArray(), [$row], 'sing-box', '1.14.4'))->handle();
                return is_object($response) && method_exists($response, 'getContent') ? $response->getContent() : (string) $response;
            };
            $before = $render();
            $node->update(['custom_outbounds' => [['type' => 'socks', 'tag' => 'server-only-proxy', 'server' => '127.0.0.1', 'server_port' => 1080, 'password' => 'server-only-secret']],
                'custom_routes' => [['action' => 'route', 'outbound' => 'server-only-proxy']]]);
            $this->assertSame($before, $render());
            $this->assertStringNotContainsString('server-only-secret', $render());
            $node->update(['custom_outbounds' => [], 'custom_routes' => []]);
        }
    }

}
