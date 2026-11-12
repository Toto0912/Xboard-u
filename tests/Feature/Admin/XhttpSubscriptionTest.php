<?php

namespace Tests\Feature\Admin;

use App\Models\Server;
use App\Models\User;
use App\Protocols\ClashMeta;
use App\Protocols\General;
use App\Protocols\SingBox;
use App\Protocols\Stash;
use App\Services\ServerService;
use App\Support\MihomoXhttp;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\Yaml\Yaml;
use Tests\TestCase;

class XhttpSubscriptionTest extends TestCase
{
    use RefreshDatabase;

    private const UUID = '7f894d8b-0d1c-4612-a901-b1475c06f513';

    private function settings(array $extra = []): array
    {
        return ['path' => '/split', 'host' => 'upload.example.test', 'mode' => 'packet-up', 'extra' => $extra];
    }

    private function down(array $overrides = []): array
    {
        return array_replace_recursive([
            'address' => 'download.example.test', 'port' => 443, 'network' => 'xhttp', 'security' => 'tls',
            'tlsSettings' => ['serverName' => 'download.example.test', 'fingerprint' => 'chrome', 'alpn' => ['h2']],
            'xhttpSettings' => ['path' => '/split', 'host' => 'download.example.test'],
        ], $overrides);
    }

    private function node(array $settings): array
    {
        return ['id' => 1, 'name' => 'split-test', 'type' => 'vless', 'host' => 'upload.example.test',
            'port' => 443, 'password' => self::UUID,
            'protocol_settings' => ['network' => 'xhttp', 'network_settings' => $settings, 'tls' => 1,
                'tls_settings' => ['server_name' => 'upload.example.test'], 'flow' => '']];
    }

    public function test_basic_xhttp_stays_compatible_and_source_settings_are_unchanged(): void
    {
        $settings = $this->settings();
        $before = $settings;
        $opts = MihomoXhttp::convert($settings);
        $this->assertSame(['path' => '/split', 'host' => 'upload.example.test', 'mode' => 'packet-up'], $opts);
        $this->assertSame($before, $settings);
    }

    public function test_extra_fields_ranges_booleans_and_xmux_are_translated(): void
    {
        $opts = MihomoXhttp::convert($this->settings([
            'headers' => ['X-Test' => 'local'], 'noGRPCHeader' => false, 'xPaddingObfsMode' => true,
            'xPaddingBytes' => '100-200', 'sessionIDLength' => 24, 'scMinPostsIntervalMs' => 0,
            'sessionIDPlacement' => 'header', 'sessionIDKey' => 'X-Session',
            'xmux' => ['maxConcurrency' => '8-16', 'maxConnections' => 0, 'hKeepAlivePeriod' => -1],
            'noSSEHeader' => true, 'scMaxBufferedPosts' => 20,
        ]));
        $this->assertSame(false, $opts['no-grpc-header']);
        $this->assertSame(true, $opts['x-padding-obfs-mode']);
        $this->assertSame('100-200', $opts['x-padding-bytes']);
        $this->assertSame('24', $opts['session-length']);
        $this->assertSame('0', $opts['sc-min-posts-interval-ms']);
        $this->assertSame('header', $opts['session-placement']);
        $this->assertSame('8-16', $opts['reuse-settings']['max-concurrency']);
        $this->assertSame(-1, $opts['reuse-settings']['h-keep-alive-period']);
        $this->assertArrayNotHasKey('noSSEHeader', $opts);
        $this->assertArrayNotHasKey('scMaxBufferedPosts', $opts);
    }

    public function test_download_defaults_do_not_inherit_uplink_security_path_headers_or_xmux(): void
    {
        $opts = MihomoXhttp::convert($this->settings([
            'headers' => ['Authorization' => 'uplink-only'], 'xmux' => ['maxConcurrency' => 10],
            'downloadSettings' => ['address' => '2001:db8::1', 'port' => 8080, 'network' => 'xhttp'],
        ]))['download-settings'];
        $this->assertSame('2001:db8::1', $opts['server']);
        $this->assertSame(false, $opts['tls']);
        $this->assertSame('', $opts['servername']);
        $this->assertSame('', $opts['client-fingerprint']);
        $this->assertSame(['http/1.1'], $opts['alpn']);
        $this->assertSame('/', $opts['path']);
        $this->assertSame('', $opts['host']);
        $this->assertSame('0', $opts['reuse-settings']['max-concurrency']);
        $this->assertSame('', $opts['reality-opts']['public-key']);
        $this->assertSame(false, $opts['ech-opts']['enable']);
        $yaml = Yaml::dump($opts, 8, 2, Yaml::DUMP_EMPTY_ARRAY_AS_SEQUENCE | Yaml::DUMP_OBJECT_AS_MAP);
        $this->assertStringContainsString('headers: {  }', $yaml);
        $this->assertStringNotContainsString('uplink-only', $yaml);
    }

    public function test_tls_and_reality_downloads_have_independent_security(): void
    {
        $tls = MihomoXhttp::convert($this->settings(['downloadSettings' => $this->down()]))['download-settings'];
        $this->assertSame(true, $tls['tls']);
        $this->assertSame(['h2'], $tls['alpn']);
        $this->assertSame('download.example.test', $tls['servername']);
        $this->assertSame('', $tls['reality-opts']['public-key']);
        $reality = MihomoXhttp::convert($this->settings(['downloadSettings' => $this->down([
            'security' => 'reality', 'realitySettings' => ['serverName' => 'reality.example.test',
                'password' => str_repeat('A', 43), 'shortId' => '0123', 'privateKey' => ''],
        ])]))['download-settings'];
        $this->assertSame(str_repeat('A', 43), $reality['reality-opts']['public-key']);
        $this->assertSame('chrome', $reality['client-fingerprint']);
        $this->assertArrayNotHasKey('private-key', $reality);
    }

    public function test_plain_download_ignores_inactive_tls_settings_and_preserves_xray_http11_default(): void
    {
        $opts = MihomoXhttp::convert($this->settings(['downloadSettings' => $this->down(['security' => 'none'])]))['download-settings'];
        $this->assertFalse($opts['tls']);
        $this->assertSame('', $opts['servername']);
        $this->assertSame('', $opts['client-fingerprint']);
        $this->assertSame(['http/1.1'], $opts['alpn']);
    }

    public static function invalidSettings(): array
    {
        $down = ['address' => 'download.test', 'port' => 443, 'network' => 'xhttp'];
        return [
            'extra string' => [['extra' => '{broken}']],
            'extra list' => [['extra' => ['unexpected', 'list']]],
            'stream-one split' => [['mode' => 'stream-one', 'extra' => ['downloadSettings' => $down]]],
            'bad port' => [['extra' => ['downloadSettings' => array_replace($down, ['port' => 65536])]]],
            'bad network' => [['extra' => ['downloadSettings' => array_replace($down, ['network' => 'ws'])]]],
            'missing address' => [['extra' => ['downloadSettings' => ['port' => 443, 'network' => 'xhttp']]]],
            'bad range' => [['extra' => ['xPaddingBytes' => []]]],
            'Host header' => [['extra' => ['headers' => ['Host' => 'bad.test']]]],
            'different padding' => [['extra' => ['xPaddingBytes' => '100-200', 'downloadSettings' => $down]]],
            'unsupported h2 tuning' => [['extra' => ['h2Params' => ['initialWindowSize' => 123]]]],
            'nested split' => [['extra' => ['downloadSettings' => $down + ['xhttpSettings' => ['extra' => ['downloadSettings' => $down]]]]]],
            'invalid ALPN' => [['extra' => ['downloadSettings' => $down + ['security' => 'tls', 'tlsSettings' => ['alpn' => 'h2']]]]],
            'invalid Reality key' => [['extra' => ['downloadSettings' => $down + ['security' => 'reality', 'realitySettings' => ['publicKey' => 'invalid']]]]],
        ];
    }

    #[DataProvider('invalidSettings')]
    public function test_incompatible_xhttp_is_skipped_instead_of_silently_losing_split_settings(array $settings): void
    {
        $node = $this->node(array_replace($this->settings(), $settings));
        $this->assertNull(ClashMeta::buildVless(self::UUID, $node));
    }

    public function test_subscription_keeps_other_nodes_and_does_not_leave_dangling_group_references(): void
    {
        $user = ['u' => 0, 'd' => 0, 'transfer_enable' => 1000, 'expired_at' => null];
        $bad = $this->node($this->settings(['downloadSettings' => ['port' => 0]]));
        $bad['name'] = 'incompatible-node';
        $good = $this->node($this->settings(['downloadSettings' => $this->down()]));
        $response = (new ClashMeta($user, [$bad, $good], 'meta', '1.19.33'))->handle();
        $config = Yaml::parse($response->getContent());
        $this->assertCount(1, $config['proxies']);
        $this->assertSame('download.example.test', $config['proxies'][0]['xhttp-opts']['download-settings']['server']);
        $this->assertStringNotContainsString('incompatible-node', $response->getContent());
        $this->assertStringNotContainsString('downloadSettings', $response->getContent());
    }

    public function test_admin_roundtrip_and_node_api_keep_original_xray_schema(): void
    {
        $admin = User::create(['uuid' => self::UUID, 'token' => str_repeat('a', 32), 'email' => 'xhttp@example.test',
            'password' => bcrypt('local-test'), 'is_admin' => true, 'u' => 0, 'd' => 0, 'transfer_enable' => 1000]);
        Sanctum::actingAs($admin);
        $payload = $this->node($this->settings(['downloadSettings' => $this->down()]));
        unset($payload['id'], $payload['password']);
        $payload += ['server_port' => 443, 'rate' => 1, 'group_ids' => [], 'show' => true, 'enabled' => true];
        $path = '/api/v2/' . hash('crc32b', config('app.key')) . '/server/manage';
        $this->postJson($path . '/save', $payload)->assertOk()->assertJson(['data' => true]);
        $server = Server::latest('id')->firstOrFail();
        $this->assertEquals($payload['protocol_settings']['network_settings'], $server->protocol_settings['network_settings']);
        $saved = collect($this->getJson($path . '/getNodes')->assertOk()->json('data'))->firstWhere('id', $server->id);
        $this->assertEquals($payload['protocol_settings']['network_settings'], $saved['protocol_settings']['network_settings']);
        $node = ServerService::buildNodeConfig($server);
        $this->assertEquals($this->down(), $node['networkSettings']['extra']['downloadSettings']);
    }

    public function test_general_links_preserve_extra_and_other_clients_do_not_receive_mihomo_fields(): void
    {
        $server = $this->node($this->settings(['downloadSettings' => $this->down()]));
        $user = ['u' => 0, 'd' => 0, 'transfer_enable' => 1000, 'expired_at' => null];
        $general = (new General($user, [$server]))->handle();
        $link = base64_decode(is_object($general) ? $general->getContent() : $general);
        $this->assertStringContainsString('extra=', $link);
        $this->assertStringNotContainsString('download-settings', $link);
        foreach ([SingBox::class] as $class) {
            $result = (new $class($user, [$server]))->handle();
            $content = is_object($result) ? $result->getContent() : (string) $result;
            $this->assertStringNotContainsString('download-settings', $content);
            $this->assertStringNotContainsString('downloadSettings', $content);
        }
    }
}
