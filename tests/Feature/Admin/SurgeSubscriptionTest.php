<?php

namespace Tests\Feature\Admin;

use App\Http\Controllers\V1\Client\ClientController;
use App\Models\User;
use App\Models\SubscribeTemplate;
use App\Protocols\Surge;
use App\Support\SurgeXhttp;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class SurgeSubscriptionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        SubscribeTemplate::flushCache('surge');
    }

    private function node(array $settings = [], string $type = 'vless', string $name = 'example'): array
    {
        return ['id' => 1, 'name' => $name, 'type' => $type, 'host' => 'upload.example.test',
            'port' => 443, 'password' => '7f894d8b-0d1c-4612-a901-b1475c06f513',
            'protocol_settings' => array_replace_recursive(['network' => 'tcp', 'tls' => 1,
                'tls_settings' => ['server_name' => 'tls.example.test']], $settings)];
    }

    private function user(): User
    {
        return new User(['uuid' => '7f894d8b-0d1c-4612-a901-b1475c06f513', 'token' => str_repeat('a', 32),
            'u' => 0, 'd' => 0, 'transfer_enable' => 1000, 'expired_at' => null]);
    }

    private function subscribe(array $nodes, string $agent = 'Surge/6.0.0 (iOS)', array $query = []): string
    {
        $request = Request::create('https://panel.example.test/api/v1/client/subscribe', 'GET', $query, [], [], ['HTTP_USER_AGENT' => $agent]);
        $this->app->instance('request', $request);
        return (new ClientController())->doSubscribe($request, $this->user(), $nodes)->getContent();
    }

    private function proxyLines(string $config): array
    {
        preg_match('/\[Proxy\]([\s\S]*?)(?=\n\[|$)/', $config, $matches);
        return array_values(array_filter(array_map('trim', explode("\n", $matches[1] ?? '')), fn ($line) => $line !== '' && !str_starts_with($line, '#')));
    }

    public function test_reality_vision_and_encryption_are_exported_without_server_secrets(): void
    {
        $node = $this->node(['tls' => 2, 'flow' => 'xtls-rprx-vision',
            'reality_settings' => ['server_name' => 'reality.example.test', 'public_key' => str_repeat('A', 43),
                'short_id' => '0123', 'private_key' => 'secret-private-key', 'dest' => 'secret-target:443'],
            'encryption' => ['enabled' => true, 'encryption' => 'mlkem768x25519plus.native.1rtt.example-client-key', 'decryption' => 'secret-decryption'],
            'xray_fallback' => '127.0.0.1:8080']);
        $node['cdn_settings'] = ['enabled' => true, 'secret' => 'secret-cdn-draft'];
        $config = $this->subscribe([$node]);
        $line = $this->proxyLines($config)[0];
        foreach ([' = vless,', 'username=' . $node['password'], 'reality-public-key=' . str_repeat('A', 43),
            'reality-short-id=0123', 'sni=reality.example.test', 'flow=xtls-rprx-vision',
            'encryption=mlkem768x25519plus.native.1rtt.example-client-key'] as $part) {
            $this->assertStringContainsString($part, $line);
        }
        foreach (['secret-private-key', 'secret-target', 'secret-decryption', 'secret-cdn-draft', '127.0.0.1:8080', 'client-fingerprint'] as $secret) {
            $this->assertStringNotContainsString($secret, $config);
        }
    }

    public static function versions(): array
    {
        return [
            ['Surge/5.22.0 (iOS)', false], ['Surge/6.0.0 (iOS)', true],
            ['Surge Mac/6.11.0', false], ['Surge Mac/6.12.0', true],
            ['Surge/6.11.0 (macOS)', false], ['Surge/6.12.0 (macOS)', true],
            ['Surge/12800', false], ['Surge/12840', true], ['Surge', true],
        ];
    }

    #[DataProvider('versions')]
    public function test_versions_and_explicit_format_keep_legacy_clients_compatible(string $agent, bool $hasVless): void
    {
        foreach ([[], ['flag' => 'surge']] as $query) {
            $lines = $this->proxyLines($this->subscribe([$this->node()], $agent, $query));
            $this->assertCount($hasVless ? 1 : 0, $lines, $agent . ' ' . json_encode($query));
        }
    }

    public function test_websocket_and_grpc_parameters_are_preserved(): void
    {
        $ws = $this->node(['network' => 'ws', 'network_settings' => ['path' => '/ws', 'host' => 'cdn.example.test',
            'headers' => ['X-Token' => 'example']]], 'vless', 'websocket');
        $grpc = $this->node(['network' => 'grpc', 'network_settings' => ['service_name' => 'my-service'] ], 'vless', 'grpc');
        $lines = $this->proxyLines($this->subscribe([$ws, $grpc]));
        $this->assertCount(2, $lines);
        $this->assertStringContainsString('ws-path=/ws', $lines[0]);
        $this->assertStringContainsString('Host:cdn.example.test', $lines[0]);
        $this->assertStringContainsString('X-Token:example', $lines[0]);
        $this->assertStringContainsString('grpc-service-name=my-service', $lines[1]);
    }

    public function test_xhttp_keeps_primary_endpoint_and_ignores_every_independent_downlink(): void
    {
        foreach ([[], ['address' => 'private-download.test', 'port' => 8443, 'network' => 'xhttp',
            'security' => 'reality', 'realitySettings' => ['publicKey' => 'downstream-only']], 'unused-draft'] as $download) {
            $node = $this->node(['network' => 'xhttp', 'network_settings' => ['mode' => 'packet-up',
                'path' => '/up', 'host' => 'cdn.example.test', 'extra' => ['downloadSettings' => $download,
                    'xPaddingBytes' => '200-500', 'noGRPCHeader' => true, 'headers' => ['X-Token' => 'uplink'],
                    'xmux' => ['maxConcurrency' => '8-16']]]]);
            $config = $this->subscribe([$node]);
            $lines = $this->proxyLines($config);
            $this->assertCount(1, $lines);
            foreach (['upload.example.test, 443', 'xhttp=true', 'xhttp-mode=packet-up', 'xhttp-path=/up',
                'xhttp-host=cdn.example.test', 'xhttp-padding-bytes=200-500', 'xhttp-no-grpc-header=true',
                'xhttp-headers=X-Token:uplink', 'xhttp-xmux-max-concurrency=8-16'] as $part) {
                $this->assertStringContainsString($part, $lines[0]);
            }
            foreach (['private-download', 'downstream-only', 'downloadSettings', 'unused-draft', 'xhttp-xmux-max-connections'] as $absent) {
                $this->assertStringNotContainsString($absent, $config);
            }
        }
        $this->assertSame(['xhttp' => true], SurgeXhttp::convert([]));
    }

    public function test_xhttp_reality_and_http3_alpn(): void
    {
        $tls = $this->node(['network' => 'xhttp', 'tls_settings' => ['alpn' => ['h3']]], 'vless', 'http3');
        $reality = $this->node(['network' => 'xhttp', 'tls' => 2, 'network_settings' => ['mode' => 'stream-one'],
            'reality_settings' => ['server_name' => 'reality.example.test', 'public_key' => str_repeat('A', 43), 'short_id' => '']], 'vless', 'reality');
        $lines = $this->proxyLines($this->subscribe([$tls, $reality]));
        $this->assertCount(2, $lines);
        $this->assertStringContainsString('alpn=h3', $lines[0]);
        $this->assertStringContainsString('xhttp-mode=stream-one', $lines[1]);
        $this->assertStringContainsString('reality-short-id=""', $lines[1]);
    }

    public function test_unsupported_combinations_are_not_silently_downgraded(): void
    {
        $nodes = [];
        foreach (['httpupgrade', 'h2', 'quic'] as $network) {
            $nodes[] = $this->node(['network' => $network]);
        }
        $nodes[] = $this->node(['network' => 'grpc', 'tls' => 0]);
        $nodes[] = $this->node(['network' => 'xhttp', 'flow' => 'xtls-rprx-vision']);
        $nodes[] = $this->node(['network' => 'ws', 'tls' => 2]);
        $nodes[] = $this->node(['network' => 'grpc'], 'vmess');
        $nodes[] = $this->node(['tls' => 2], 'trojan');
        $nodes[] = $this->node(['tls_settings' => ['ech' => ['enabled' => true]]]);
        $nodes[] = $this->node(['network' => 'xhttp', 'network_settings' => ['mode' => 'bad']]);
        $nodes[] = $this->node(['network' => 'xhttp', 'network_settings' => ['extra' => ['h2Params' => ['unknown' => 1]]]]);
        $config = $this->subscribe($nodes);
        $this->assertSame([], $this->proxyLines($config));
        $this->assertStringContainsString('auto = url-test, DIRECT,', $config);
        $this->assertStringNotContainsString('$proxy_group', $config);
    }

    public function test_hysteria2_and_tuic_credentials_obfuscation_and_port_hopping(): void
    {
        $hy = $this->node(['version' => 2, 'bandwidth' => ['up' => 50, 'down' => 100],
            'tls' => ['server_name' => 'hy.example.test', 'allow_insecure' => true],
            'obfs' => ['open' => true, 'type' => 'salamander', 'password' => 'obfs-example'], 'hop_interval' => 15], 'hysteria', 'hy');
        $hy['ports'] = '443,8443,9000-9010';
        $tuic = $this->node(['version' => 5, 'alpn' => ['h3'], 'tls' => ['server_name' => 'tuic.example.test']], 'tuic', 'tuic');
        $lines = $this->proxyLines($this->subscribe([$hy, $tuic]));
        $this->assertCount(2, $lines);
        foreach (['download-bandwidth=100', 'salamander-password=obfs-example', 'port-hopping="443;8443;9000-9010"',
            'port-hopping-interval=15', 'sni=hy.example.test', 'skip-cert-verify=true'] as $part) {
            $this->assertStringContainsString($part, $lines[0]);
        }
        $this->assertStringNotContainsString('upload-bandwidth', $lines[0]);
        $this->assertStringContainsString(' = tuic-v5,', $lines[1]);
        $this->assertStringContainsString('uuid=' . $tuic['password'], $lines[1]);
        $this->assertStringContainsString('password=' . $tuic['password'], $lines[1]);
        $tuic['protocol_settings']['version'] = 4;
        $this->assertStringContainsString('token=' . $tuic['password'], Surge::buildTuic($tuic['password'], $tuic));
    }

    public function test_existing_protocols_work_and_failed_nodes_leave_no_group_references(): void
    {
        $nodes = [$this->node([], 'trojan', 'trojan'), $this->node([], 'vmess', 'vmess'),
            $this->node(['cipher' => 'chacha20-ietf-poly1305'], 'shadowsocks', 'ss'),
            $this->node(['tls' => ['server_name' => 'anytls.example.test']], 'anytls', 'anytls'),
            $this->node([], 'socks', 'socks'), $this->node([], 'http', 'http'),
            $this->node(['cipher' => 'invalid'], 'shadowsocks', 'must-not-appear')];
        $nodes[0]['protocol_settings']['network'] = 'ws';
        $nodes[0]['protocol_settings']['network_settings'] = ['path' => '/trojan'];
        $config = $this->subscribe($nodes);
        $this->assertCount(6, $this->proxyLines($config));
        $this->assertStringContainsString('ws-path=/trojan', $config);
        $this->assertStringNotContainsString('must-not-appear', $config);
        $this->assertStringContainsString('/s/' . str_repeat('a', 32) . '?flag=surge', $config);
    }

    public function test_commas_quotes_and_alpn_are_escaped_and_multiline_nodes_are_rejected(): void
    {
        $node = $this->node(['tls_settings' => ['alpn' => ['h2', 'http/1.1']]], 'vless', 'name, "quoted"');
        $node['password'] = 'test,pass';
        $config = $this->subscribe([$node]);
        $this->assertStringContainsString('username="test,pass"', $config);
        $this->assertStringContainsString('alpn="h2,http/1.1"', $config);
        $this->assertStringContainsString('"name, \\"quoted\\""', $config);
        $node['host'] = "host.test\n[General]\nmalicious=true";
        $this->assertSame([], $this->proxyLines($this->subscribe([$node])));
    }

    public function test_obfuscation_versions_and_original_hysteria_traffic_are_preserved(): void
    {
        $hy = $this->node(['version' => 2, 'tls' => ['server_name' => 'hy.example.test'],
            'obfs' => ['open' => true, 'type' => 'salamander', 'password' => 'example']], 'hysteria');
        $this->assertSame([], $this->proxyLines($this->subscribe([$hy], 'Surge/5.8.0 (iOS)')));
        $this->assertCount(1, $this->proxyLines($this->subscribe([$hy], 'Surge/5.17.0 (iOS)')));
        $hy['protocol_settings']['obfs']['type'] = 'gecko';
        $this->assertSame([], $this->proxyLines($this->subscribe([$hy], 'Surge Mac/6.6.0')));
        $this->assertStringContainsString('gecko-password=example', $this->subscribe([$hy], 'Surge/11730'));
        $hy['protocol_settings']['obfs']['open'] = false;
        $this->assertCount(1, $this->proxyLines($this->subscribe([$hy], 'Surge/2398')));
    }

    public function test_colliding_names_are_unique_in_both_nodes_and_groups(): void
    {
        $nodes = [$this->node([], 'vless', 'Proxy'), $this->node([], 'vless', 'Proxy'),
            $this->node([], 'vless', 'DIRECT')];
        $config = $this->subscribe($nodes);
        $lines = $this->proxyLines($config);
        $this->assertCount(3, $lines);
        $this->assertStringStartsWith('"Proxy (2)" = vless,', $lines[0]);
        $this->assertStringStartsWith('"Proxy (3)" = vless,', $lines[1]);
        $this->assertStringStartsWith('"DIRECT (2)" = vless,', $lines[2]);
        $this->assertStringContainsString('DIRECT, "Proxy (2)", "Proxy (3)", "DIRECT (2)"', $config);
    }
}
