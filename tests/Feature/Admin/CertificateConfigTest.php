<?php

namespace Tests\Feature\Admin;

use App\Models\Server;
use App\Models\User;
use App\Services\ServerService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CertificateConfigTest extends TestCase
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
            'uuid' => '7f894d8b-0d1c-4612-a901-b1475c06f513', 'token' => str_repeat('a', 32),
            'email' => 'admin@example.test', 'password' => bcrypt('test-password'), 'is_admin' => true,
        ]));
        admin_setting(['server_ws_enable' => 0]);
    }

    private function node(array $extra = []): Server
    {
        return Server::create(array_merge([
            'name' => 'local-hy2', 'type' => 'hysteria', 'host' => '127.0.0.1',
            'port' => 18443, 'server_port' => 18443, 'rate' => 1, 'group_ids' => [],
            'protocol_settings' => ['version' => 2, 'tls' => ['server_name' => 'localhost'], 'bandwidth' => ['up' => 100, 'down' => 100], 'obfs' => ['open' => false, 'type' => 'salamander', 'password' => '']],
        ], $extra));
    }

    public function test_empty_legacy_certificate_values_are_objects_without_database_writes(): void
    {
        foreach (['[]', '{}', null] as $raw) {
            $node = $this->node();
            DB::table('v2_server')->where('id', $node->id)->update(['cert_config' => $raw]);
        }
        $before = DB::table('v2_server')->orderBy('id')->get()->toJson();
        $result = $this->getJson($this->adminPath() . '/getNodes')->assertOk();
        $data = json_decode($result->getContent())->data;
        $this->assertCount(3, $data);
        foreach ($data as $item) {
            $this->assertInstanceOf(\stdClass::class, $item->cert_config);
            $this->assertSame([], get_object_vars($item->cert_config));
        }
        $this->assertSame($before, DB::table('v2_server')->orderBy('id')->get()->toJson());
    }

    public function test_certificate_save_reopen_and_node_delivery_preserve_all_content(): void
    {
        $node = $this->node(['cert_config' => []]);
        $payload = $this->getJson($this->adminPath() . '/getNodes')->assertOk()->json('data.0');
        $payload['cert_config'] = [
            'cert_mode' => 'content', 'cert_domain' => 'localhost',
            'cert_content' => "LOCAL_TEST_CERTIFICATE\nsecond line",
            'key_content' => "LOCAL_TEST_PRIVATE_KEY\nsecond line",
            'future_extension' => ['preserve' => true],
        ];
        $this->postJson($this->adminPath() . '/save', $payload)->assertOk()->assertJson(['data' => true]);
        $this->assertJsonStringEqualsJsonString(json_encode($payload['cert_config']), json_encode($node->fresh()->cert_config));
        $reopened = $this->getJson($this->adminPath() . '/getNodes')->assertOk()->json('data.0.cert_config');
        $this->assertJsonStringEqualsJsonString(json_encode($payload['cert_config']), json_encode($reopened));
        $this->assertJsonStringEqualsJsonString(json_encode($payload['cert_config']), json_encode(ServerService::buildNodeConfig($node->fresh())['cert_config']));
    }

    public function test_existing_certificate_modes_and_unknown_fields_remain_unchanged(): void
    {
        foreach (['content', 'dns', 'http', 'self', 'none'] as $mode) {
            $cert = ['cert_mode' => $mode, 'custom_option' => 'retain-me'];
            $node = $this->node(['cert_config' => $cert]);
            $data = $this->getJson($this->adminPath() . '/getNodes')->assertOk()->json('data');
            $item = collect($data)->firstWhere('id', $node->id);
            $this->assertSame($cert, $item['cert_config']);
            $this->assertSame($cert, $node->fresh()->cert_config);
        }
    }

    public function test_certificate_fix_covers_all_tls_protocols(): void
    {
        foreach (['hysteria', 'vless', 'trojan', 'tuic', 'anytls', 'vmess', 'shadowsocks'] as $type) {
            $node = $this->node(['cert_config' => []]);
            DB::table('v2_server')->where('id', $node->id)->update(['type' => $type, 'protocol_settings' => '{}']);
        }
        $data = json_decode($this->getJson($this->adminPath() . '/getNodes')->assertOk()->getContent())->data;
        $this->assertCount(7, $data);
        foreach ($data as $node) {
            $this->assertInstanceOf(\stdClass::class, $node->cert_config);
        }
    }

    public function test_anonymous_requests_cannot_read_certificate_material(): void
    {
        $this->app['auth']->forgetGuards();
        $this->node(['cert_config' => ['cert_mode' => 'content', 'key_content' => 'LOCAL_TEST_PRIVATE_KEY']]);
        $this->getJson($this->adminPath() . '/getNodes')->assertStatus(403);
    }
}
