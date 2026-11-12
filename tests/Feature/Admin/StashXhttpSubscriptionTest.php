<?php

namespace Tests\Feature\Admin;

use App\Http\Controllers\V1\Client\ClientController;
use App\Models\User;
use App\Protocols\Stash;
use App\Support\StashXhttp;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\Yaml\Yaml;
use Tests\TestCase;

class StashXhttpSubscriptionTest extends TestCase
{
    use RefreshDatabase;

    private function node(array $extra = []): array
    {
        return ['id' => 1, 'name' => 'stash-xhttp', 'type' => 'vless', 'host' => 'upload.example.test',
            'port' => 443, 'password' => '7f894d8b-0d1c-4612-a901-b1475c06f513',
            'protocol_settings' => ['network' => 'xhttp', 'network_settings' => [
                'path' => '/upload', 'host' => 'upload.example.test', 'mode' => 'packet-up', 'extra' => $extra],
                'tls' => 1, 'tls_settings' => ['server_name' => 'upload.example.test'], 'flow' => '']];
    }

    private function user(): User
    {
        return new User(['u' => 0, 'd' => 0, 'transfer_enable' => 1000, 'expired_at' => null]);
    }

    private function subscription(array $nodes, ?string $version = '3.6.0', ?string $ua = null): array
    {
        return Yaml::parse((new Stash($this->user(), $nodes, 'stash', $version, $ua))->handle()->getContent());
    }

    public function test_controller_exports_xhttp_padding_and_cdn_client_configuration_without_secrets(): void
    {
        $node = $this->node(['headers' => ['X-Test' => 'public'], 'noGRPCHeader' => false,
            'xPaddingBytes' => '100-200', 'xPaddingPlacement' => 'header', 'xPaddingMethod' => 'tokenish',
            'xPaddingKey' => 'padding', 'xPaddingHeader' => 'X-Padding', 'xPaddingObfsMode' => true,
            'scMaxEachPostBytes' => 1000000, 'scMinPostsIntervalMs' => 30,
            'xmux' => ['maxConcurrency' => 16], 'noSSEHeader' => true]);
        $node['cdn_settings'] = ['enabled' => true, 'server' => ['host' => 'origin-private.test', 'server_port' => 60443]];
        $node['protocol_settings']['reality_settings']['private_key'] = 'private-test-key';
        $before = $node;
        $request = Request::create('/api/v1/client/subscribe', 'GET', [], [], [], ['HTTP_USER_AGENT' => 'Stash/3.6.0 (iOS)']);
        $response = (new ClientController())->doSubscribe($request, $this->user(), [$node]);
        $config = Yaml::parse($response->getContent());
        $proxy = $config['proxies'][0];
        $this->assertSame('xhttp', $proxy['network']);
        $this->assertSame('upload.example.test', $proxy['server']);
        $this->assertSame(443, $proxy['port']);
        $this->assertSame('upload.example.test', $proxy['sni']);
        $this->assertSame(false, $proxy['skip-cert-verify']);
        $this->assertSame('100-200', $proxy['xhttp-opts']['x-padding-bytes']);
        $this->assertSame('tokenish', $proxy['xhttp-opts']['x-padding-method']);
        $this->assertSame(false, $proxy['xhttp-opts']['no-grpc-header']);
        $this->assertSame(true, $proxy['xhttp-opts']['x-padding-obfs-mode']);
        $this->assertSame('1000000', $proxy['xhttp-opts']['sc-max-each-post-bytes']);
        $this->assertArrayNotHasKey('reuse-settings', $proxy['xhttp-opts']);
        $this->assertArrayNotHasKey('noSSEHeader', $proxy['xhttp-opts']);
        $this->assertStringNotContainsString('private-test-key', $response->getContent());
        $this->assertStringNotContainsString('origin-private.test', $response->getContent());
        $this->assertSame($before, $node);
        $this->assertSame('text/yaml', $response->headers->get('content-type'));
    }

    public static function versions(): array
    {
        return [['3.5.9', 'Stash/3.5.9 (iOS)', false], ['3.6.0', 'Stash/3.6.0 (iOS)', true],
            ['4.2.9', 'Stash/4.2.9 (macOS)', false], ['4.3.0', 'Stash/4.3.0 (macOS)', true],
            ['4.2', 'Stash/4.2', false], ['4.3', 'Stash/4.3', true],
            ['4.0', 'Stash/4.0 (iOS)', true], [null, null, true]];
    }

    #[DataProvider('versions')]
    public function test_version_gating_preserves_other_nodes_and_group_references(?string $version, ?string $ua, bool $supported): void
    {
        $ss = $this->node();
        $ss['name'] = 'legacy-ss'; $ss['type'] = 'shadowsocks';
        $ss['protocol_settings'] = ['cipher' => 'chacha20-ietf-poly1305'];
        $config = $this->subscription([$this->node(), $ss], $version, $ua);
        $names = array_column($config['proxies'], 'name');
        $this->assertContains('legacy-ss', $names);
        $this->assertSame($supported, in_array('stash-xhttp', $names, true));
        foreach ($config['proxy-groups'] as $group) {
            $this->assertSame($supported, in_array('stash-xhttp', $group['proxies'], true));
        }
    }

    public static function securityModes(): array
    {
        return [['none'], ['tls'], ['reality']];
    }

    #[DataProvider('securityModes')]
    public function test_download_connection_has_independent_security_and_http_defaults(string $security): void
    {
        $node = $this->node(['headers' => ['Authorization' => 'uplink-only'], 'downloadSettings' => [
            'address' => 'download.example.test', 'port' => 8443, 'network' => 'xhttp', 'security' => $security,
            'tlsSettings' => ['serverName' => 'down-tls.example.test'],
            'realitySettings' => ['serverName' => 'down-reality.example.test', 'publicKey' => str_repeat('A', 43), 'shortId' => '0123'],
        ]]);
        $node['protocol_settings']['tls'] = 2;
        $node['protocol_settings']['reality_settings'] = ['server_name' => 'up-reality.example.test',
            'public_key' => str_repeat('B', 43), 'short_id' => 'abcd'];
        $proxy = $this->subscription([$node])['proxies'][0];
        $down = $proxy['xhttp-opts']['download-settings'];
        $this->assertSame('download.example.test', $down['server']);
        $this->assertSame(8443, $down['port']);
        $this->assertSame('/', $down['path']);
        $this->assertSame('', $down['host']);
        $this->assertSame([], $down['headers']);
        $this->assertSame($security !== 'none', $down['tls']);
        $this->assertSame(match ($security) {'none' => '', 'tls' => 'down-tls.example.test', default => 'down-reality.example.test'}, $down['sni']);
        $this->assertSame($security === 'none' ? ['http/1.1'] : ['h2', 'http/1.1'], $down['alpn']);
        $this->assertSame($security === 'reality' ? str_repeat('A', 43) : '', $down['reality-opts']['public-key']);
        $this->assertArrayNotHasKey('servername', $down);
        $this->assertArrayNotHasKey('ech-opts', $down);
        $this->assertArrayNotHasKey('reuse-settings', $down);
        $this->assertSame(str_repeat('B', 43), $proxy['reality-opts']['public-key']);
    }

    public function test_empty_xhttp_and_download_headers_are_yaml_maps(): void
    {
        $node = $this->node(['downloadSettings' => ['address' => 'down.example.test', 'port' => 8080, 'network' => 'xhttp']]);
        $raw = (new Stash($this->user(), [$node], 'stash', '3.6.0'))->handle()->getContent();
        $this->assertMatchesRegularExpression('/headers: \{\s*\}/', $raw);
        $node['protocol_settings']['network_settings'] = [];
        $raw = (new Stash($this->user(), [$node], 'stash', '3.6.0'))->handle()->getContent();
        $this->assertMatchesRegularExpression('/xhttp-opts: \{\s*\}/', $raw);
    }

    public function test_invalid_xhttp_is_omitted_instead_of_downgraded_to_tcp(): void
    {
        $nodes = [];
        foreach ([['mode' => 'invalid'], ['mode' => 'stream-one', 'extra' => ['downloadSettings' => []]],
            ['extra' => ['sessionIDPlacement' => 'header']], ['extra' => ['xPaddingMethod' => 'unknown']],
            ['extra' => ['downloadSettings' => ['address' => 'bad.test', 'port' => 443, 'network' => 'tcp']]]] as $settings) {
            $node = $this->node(); $node['protocol_settings']['network_settings'] = $settings; $nodes[] = $node;
        }
        $nodes[] = array_replace_recursive($this->node(), ['protocol_settings' => ['flow' => 'xtls-rprx-vision']]);
        $config = $this->subscription($nodes);
        $this->assertSame([], $config['proxies']);
        foreach ($config['proxy-groups'] as $group) {
            $this->assertNotContains('stash-xhttp', $group['proxies']);
        }
    }

    public function test_vless_encryption_and_vision_are_preserved_and_vmess_xhttp_is_filtered(): void
    {
        $node = $this->node();
        $node['protocol_settings']['flow'] = 'xtls-rprx-vision';
        $node['protocol_settings']['encryption'] = ['enabled' => true, 'encryption' => 'mlkem768x25519plus.native.1rtt.example-public-key', 'decryption' => 'private-decryption'];
        $vmess = $this->node(); $vmess['type'] = 'vmess'; $vmess['name'] = 'vmess-xhttp';
        $config = $this->subscription([$node, $vmess]);
        $this->assertCount(1, $config['proxies']);
        $this->assertSame($node['protocol_settings']['encryption']['encryption'], $config['proxies'][0]['encryption']);
        $this->assertSame('xtls-rprx-vision', $config['proxies'][0]['flow']);
        $this->assertStringNotContainsString('private-decryption', json_encode($config));
    }

    public function test_versionless_reality_export_uses_current_xhttp_schema(): void
    {
        $node = $this->node();
        $node['protocol_settings']['tls'] = 2;
        $node['protocol_settings']['reality_settings'] = ['server_name' => 'reality.example.test',
            'public_key' => str_repeat('A', 43), 'short_id' => '0123'];
        $proxy = $this->subscription([$node], null)['proxies'][0];
        $this->assertSame('xhttp', $proxy['network']);
        $this->assertSame('reality.example.test', $proxy['sni']);
        $this->assertTrue($proxy['reality-opts']['support-x25519mlkem768']);
    }
}
