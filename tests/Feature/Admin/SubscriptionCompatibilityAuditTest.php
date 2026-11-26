<?php

namespace Tests\Feature\Admin;

use App\Http\Controllers\V1\Client\ClientController;
use App\Models\Server;
use App\Models\SubscribeTemplate;
use App\Protocols\Clash;
use App\Protocols\ClashMeta;
use App\Protocols\General;
use App\Protocols\Loon;
use App\Protocols\QuantumultX;
use App\Protocols\Shadowrocket;
use App\Protocols\SingBox;
use App\Protocols\Stash;
use App\Support\ServerTransport;
use App\Utils\Helper;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Symfony\Component\Yaml\Yaml;
use Tests\TestCase;

class SubscriptionCompatibilityAuditTest extends TestCase
{
    use RefreshDatabase;

    private array $user = ['uuid' => '7f894d8b-0d1c-4612-a901-b1475c06f513', 'u' => 0, 'd' => 0,
        'transfer_enable' => 1000, 'expired_at' => null];

    private function node(string $type, array $settings = []): array
    {
        return ['id' => 1, 'name' => $type, 'type' => $type, 'host' => 'example.test', 'port' => 443,
            'password' => 'node-password', 'protocol_settings' => $settings];
    }

    private function query(string $uri): array
    {
        parse_str(parse_url(trim($uri), PHP_URL_QUERY), $params);
        return $params;
    }

    public function test_base_versions_and_unknown_version_policy_keep_absolute_transport_limits(): void
    {
        $node = $this->node('anytls', ['tls' => []]);
        $never = $this->node('trojan', ['network' => 'tcp', 'tls' => 2]);
        foreach ([['3.2.9', 0], ['3.3.0', 1], [null, 1], ['unavailable', 1]] as [$version, $count]) {
            $yaml = (new Stash($this->user, [$node, $never], 'stash', $version))->handle()->getContent();
            $this->assertCount($count, Yaml::parse($yaml)['proxies']);
        }
        $request = Request::create('/', 'GET', [], [], [], ['HTTP_USER_AGENT' => 'Agent/1.0 Stash/3.3.1']);
        $extract = new \ReflectionMethod(ClientController::class, 'getClientInfo');
        $this->assertSame('3.3.1', $extract->invoke(app(ClientController::class), $request)['version']);
    }

    public function test_ws_host_aliases_do_not_mark_ordinary_nodes_as_extended_transport(): void
    {
        foreach ([['headers' => ['host' => 'x.test']], ['headers' => ['Host' => 'x.test']], ['host' => 'x.test'],
            ['headers' => ['HOST' => 'x.test'], 'host' => 'x.test']] as $params) {
            $node = ServerTransport::clientPayload($this->node('vmess', ['network' => 'ws', 'network_settings' => $params]));
            $this->assertSame(['Host' => 'x.test'], $node['protocol_settings']['network_settings']['headers']);
            $this->assertFalse(ServerTransport::requiresNativeSingBoxTransport($node));
        }
        $node = ServerTransport::clientPayload($this->node('vmess', ['network' => 'ws',
            'network_settings' => ['headers' => ['host' => 'x.test', 'X-Extra' => 'value']]]));
        $this->assertTrue(ServerTransport::requiresNativeSingBoxTransport($node));
    }

    public function test_singbox_auth_alpn_version_and_unrepresentable_transports(): void
    {
        $nodes = [$this->node('anytls'), $this->node('tuic', ['version' => 5, 'tls' => []]),
            $this->node('trojan', ['network' => 'tcp', 'tls' => 1, 'tls_settings' => []]),
            $this->node('hysteria', ['version' => '2', 'tls' => []]), $this->node('socks'), $this->node('http')];
        $configured = $this->node('anytls', Server::normalizeProtocolSettings('anytls', ['alpn' => 'http/1.1,h2']));
        $configured['name'] = 'configured';
        $nodes[] = $configured;
        foreach (['vless', 'vmess', 'trojan'] as $type) {
            $xhttp = $this->node($type, ['network' => 'xhttp']);
            $xhttp['name'] = $type.'-unsupported';
            $nodes[] = $xhttp;
        }
        foreach ([['sing-box', '1.13.0'], ['hiddify', null]] as [$name, $version]) {
            $json = (new SingBox($this->user, $nodes, $name, $version))->handle()->getContent();
            $out = array_column(json_decode($json, true, flags: JSON_THROW_ON_ERROR)['outbounds'], null, 'tag');
            $this->assertArrayNotHasKey('alpn', $out['anytls']['tls']);
            $this->assertSame(['http/1.1', 'h2'], $out['configured']['tls']['alpn']);
            $this->assertSame(['h3'], $out['tuic']['tls']['alpn']);
            $this->assertSame($this->user['uuid'], $out['tuic']['uuid']);
            $this->assertSame($this->user['uuid'], $out['socks']['username']);
            $this->assertSame('hysteria2', $out['hysteria']['type']);
            foreach (['anytls', 'tuic', 'trojan', 'hysteria', 'socks', 'http'] as $tag) {
                $this->assertSame('node-password', $out[$tag]['password']);
            }
            foreach (['vless', 'vmess', 'trojan'] as $type) {
                $this->assertArrayNotHasKey($type.'-unsupported', $out);
            }
        }
    }

    public function test_quantumult_trojan_and_loon_transports_follow_their_documented_wire_fields(): void
    {
        $tls = ['tls_settings' => ['server_name' => 'tls.test']];
        $tcp = QuantumultX::buildTrojan('pw', $this->node('trojan', $tls));
        $this->assertStringContainsString('over-tls=true', $tcp);
        $this->assertStringContainsString('tls-host=tls.test', $tcp);
        $ws = QuantumultX::buildTrojan('pw', $this->node('trojan', ['network' => 'ws'] + $tls));
        $this->assertStringContainsString('obfs=wss', $ws);
        $this->assertStringContainsString('obfs-host=tls.test', $ws);
        $this->assertSame('', QuantumultX::buildTrojan('pw', $this->node('trojan', [
            'network' => 'ws', 'network_settings' => ['headers' => ['Host' => 'another.test']],
        ] + $tls)));
        $this->assertStringNotContainsString('over-tls=true', QuantumultX::buildHttp('pw', $this->node('http')));
        $this->assertStringNotContainsString('over-tls=true', QuantumultX::buildSocks5('pw', $this->node('socks')));
        $this->assertSame('', QuantumultX::buildTrojan('pw', $this->node('trojan', ['network' => 'grpc'] + $tls)));
        $this->assertSame('', QuantumultX::buildTrojan('pw', $this->node('trojan', ['network' => 'ws', 'tls' => 0])));
        foreach (['none' => 'tcp', 'http' => 'http'] as $header => $transport) {
            $line = Loon::buildVmess('uuid', $this->node('vmess', ['network' => 'tcp', 'network_settings' => ['header' => ['type' => $header]]]));
            $this->assertStringContainsString('transport='.$transport, $line);
        }
        $hy = $this->node('hysteria', ['version' => 2, 'tls' => []]);
        $this->assertStringNotContainsString('(null)', Loon::buildHysteria('pw', $hy, $this->user));
        $hy['protocol_settings']['tls']['server_name'] = 'sni.test';
        $this->assertStringContainsString('sni=sni.test', Loon::buildHysteria('pw', $hy, $this->user));
    }

    public function test_general_query_keeps_kcp_grpc_tls_and_hy2_settings_separate(): void
    {
        $mk = fn ($network, $settings) => $this->query(General::buildVless($this->user['uuid'],
            $this->node('vless', ['network' => $network, 'network_settings' => $settings])));
        $kcp = $mk('kcp', ['header' => ['type' => 'utp'], 'seed' => 'test']);
        $this->assertSame('kcp', $kcp['type']);
        $this->assertSame('utp', $kcp['headerType']);
        $this->assertSame('test', $kcp['seed']);
        $this->assertArrayNotHasKey('mode', $kcp);
        $this->assertArrayNotHasKey('mode', $mk('tcp', []));
        $this->assertSame('gun', $mk('grpc', ['multiMode' => false])['mode']);
        foreach (['salamander', 'gecko'] as $type) {
            $uri = General::buildHysteria('pw', $this->node('hysteria', ['version' => '2',
                'obfs' => ['open' => true, 'type' => $type, 'password' => 'secret']]));
            $this->assertSame($type, $this->query($uri)['obfs']);
        }
    }

    public function test_yaml_templates_round_trip_site_name_and_hostname_without_port(): void
    {
        $site = "Site: \"Demo\" # plans";
        admin_setting(['app_name' => $site]);
        $this->app->instance('request', Request::create('https://subs.example.test:8443/api'));
        foreach (['clash' => Clash::class, 'clashmeta' => ClashMeta::class, 'stash' => Stash::class] as $name => $class) {
            SubscribeTemplate::setContent($name, "proxies: []\nproxy-groups: []\nrules: []\nlabel: '\$app_name'\n");
            $conf = Yaml::parse((new $class($this->user, []))->handle()->getContent());
            $this->assertSame($site, $conf['label']);
            $this->assertContains('DOMAIN,subs.example.test,DIRECT', $conf['rules']);
            SubscribeTemplate::flushCache($name);
        }
    }

    public function test_utls_requires_explicit_enablement_and_random_choice(): void
    {
        for ($i = 0; $i < 8; $i++) {
            $this->assertNull(Helper::getTlsFingerprint(null));
            $this->assertNull(Helper::getTlsFingerprint(['enabled' => false, 'fingerprint' => 'random']));
            $this->assertSame('safari', Helper::getTlsFingerprint(['enabled' => true, 'fingerprint' => 'safari']));
            $this->assertContains(Helper::getTlsFingerprint(['enabled' => true, 'fingerprint' => 'random']),
                ['chrome', 'firefox', 'safari', 'ios', 'edge', 'qq']);
        }
    }

    public function test_shadowrocket_serializes_host_alpn_and_uri_fragment_as_scalars(): void
    {
        foreach (['ws.test', ['ws.test', 'alt.test']] as $host) {
            $uri = Shadowrocket::buildVmess('uuid', $this->node('vmess', ['network' => 'h2', 'network_settings' => ['host' => $host]]));
            $this->assertSame('ws.test', $this->query($uri)['obfsParam']);
        }
        foreach ([1, 2] as $version) {
            $hy = $this->node('hysteria', ['version' => $version, 'tls' => []]);
            $hy['name'] = "香港 #1/? & edge";
            $fragment = parse_url(trim(Shadowrocket::buildHysteria('pw', $hy)), PHP_URL_FRAGMENT);
            $this->assertSame(rawurlencode($hy['name']), $fragment);
        }
        $uri = Shadowrocket::buildTuic('pw', $this->node('tuic', ['version' => 5, 'alpn' => ['h3', 'h2']]));
        $this->assertSame('h3,h2', $this->query($uri)['alpn']);
    }
}
