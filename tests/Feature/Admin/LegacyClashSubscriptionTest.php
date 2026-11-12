<?php

namespace Tests\Feature\Admin;

use App\Http\Controllers\V1\Client\ClientController;
use App\Models\User;
use App\Models\SubscribeTemplate;
use App\Protocols\Clash;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Symfony\Component\Yaml\Yaml;
use Tests\TestCase;

class LegacyClashSubscriptionTest extends TestCase
{
    use RefreshDatabase;

    public function test_legacy_client_receives_supported_nodes_and_credentials_through_controller(): void
    {
        $nodes = [];
        foreach (['shadowsocks', 'vmess', 'trojan', 'socks', 'http', 'vless', 'hysteria', 'tuic'] as $type) {
            $nodes[] = ['id' => count($nodes) + 1, 'type' => $type, 'name' => 'example-' . $type,
                'host' => 'proxy.example.test', 'port' => 443, 'password' => 'local-test-password',
                'protocol_settings' => ['network' => 'ws', 'tls' => 1, 'version' => 2,
                    'cipher' => 'chacha20-ietf-poly1305', 'network_settings' => ['host' => 'cdn.example.test', 'path' => '/ws'],
                    'tls_settings' => ['server_name' => 'cdn.example.test']]];
        }
        $user = new User(['u' => 0, 'd' => 0, 'transfer_enable' => 1000, 'expired_at' => null]);
        foreach ([[], ['flag' => 'clash']] as $query) {
            $request = Request::create('/api/v1/client/subscribe', 'GET', $query, [], [], ['HTTP_USER_AGENT' => 'Clash/v1.18.0']);
            $response = (new ClientController())->doSubscribe($request, $user, $nodes);
            $config = Yaml::parse($response->getContent());
            $this->assertSame(['ss', 'vmess', 'trojan', 'socks5', 'http'], array_column($config['proxies'], 'type'));
            $this->assertSame('local-test-password', $config['proxies'][0]['password']);
            $this->assertSame('local-test-password', $config['proxies'][1]['uuid']);
            $this->assertSame('cdn.example.test', $config['proxies'][1]['ws-opts']['headers']['Host']);
            $this->assertContains('example-shadowsocks', $config['proxy-groups'][0]['proxies']);
            $this->assertStringNotContainsString('example-vless', $response->getContent());
        }
    }

    public function test_unsupported_protocols_do_not_become_fake_legacy_nodes(): void
    {
        $node = ['type' => 'vless', 'name' => 'new-protocol', 'protocol_settings' => ['network' => 'xhttp']];
        $user = ['u' => 0, 'd' => 0, 'transfer_enable' => 1000, 'expired_at' => null];
        $config = Yaml::parse((new Clash($user, [$node]))->handle()->getContent());
        $this->assertSame([], $config['proxies']);
        $names = array_column($config['proxy-groups'], 'name');
        foreach ($config['proxy-groups'] as $group) {
            $this->assertNotEmpty($group['proxies']);
            foreach ($group['proxies'] as $member) {
                $this->assertContains($member, [...$names, 'DIRECT', 'REJECT']);
            }
        }
    }

    public function test_unsupported_vmess_and_trojan_transports_are_not_silently_changed_to_tcp(): void
    {
        $nodes = [];
        foreach (['vmess', 'trojan'] as $type) {
            foreach (['xhttp', 'httpupgrade'] as $network) {
                $nodes[] = ['type' => $type, 'name' => 'unsupported', 'protocol_settings' => ['network' => $network]];
            }
            $nodes[] = ['type' => $type, 'name' => 'reality', 'protocol_settings' => ['network' => 'tcp', 'tls' => 2]];
        }
        $user = ['u' => 0, 'd' => 0, 'transfer_enable' => 1000, 'expired_at' => null];
        $config = Yaml::parse((new Clash($user, $nodes))->handle()->getContent());
        $this->assertSame([], $config['proxies']);
    }

    public function test_empty_pattern_groups_are_valid_when_no_compatible_node_remains(): void
    {
        $template = ['proxies' => [], 'proxy-groups' => [
            ['name' => 'selection', 'type' => 'select', 'proxies' => ['filtered']],
            ['name' => 'filtered', 'type' => 'select', 'proxies' => ['/example/']],
        ], 'rules' => ['MATCH,selection']];
        SubscribeTemplate::setContent('clash', Yaml::dump($template));
        $user = ['u' => 0, 'd' => 0, 'transfer_enable' => 1000, 'expired_at' => null];
        $config = Yaml::parse((new Clash($user, []))->handle()->getContent());
        $this->assertSame(['DIRECT'], $config['proxy-groups'][1]['proxies']);
        $this->assertSame(['filtered'], $config['proxy-groups'][0]['proxies']);
    }

    public function test_upgrade_replaces_only_known_broken_default_and_ignores_old_cache(): void
    {
        $legacy = file_get_contents(base_path('tests/Fixtures/legacy-clash-default.yaml'));
        $this->assertSame('f76765bcbf2213c1c52c2c85ef504cbc51b52278f370220724ff5fe80fa7eb7d', hash('sha256', trim(str_replace("\r\n", "\n", $legacy))));
        $otherTemplates = DB::table('v2_subscribe_templates')->where('name', '!=', 'clash')->pluck('content', 'name')->all();
        $migration = require database_path('migrations/2026_11_12_000001_fix_legacy_clash_subscription_template.php');
        foreach ([$legacy, str_replace("\n", "\r\n", $legacy)] as $input) {
            SubscribeTemplate::setContent('clash', $input);
            $migration->up(); SubscribeTemplate::flushCache('clash');
            $this->assertSame(file_get_contents(base_path('resources/rules/default.clash.yaml')), subscribe_template('clash'));
        }
        SubscribeTemplate::setContent('clash', 'admin custom template');
        $migration->up();
        $this->assertSame('admin custom template', subscribe_template('clash'));
        $this->assertSame($otherTemplates, DB::table('v2_subscribe_templates')->where('name', '!=', 'clash')->pluck('content', 'name')->all());
        Cache::store('redis')->put('subscribe_template:v20261101:clash', 'stale template', 60);
        try {
            $this->assertSame('admin custom template', subscribe_template('clash'));
        } finally {
            Cache::store('redis')->forget('subscribe_template:v20261101:clash');
        }
    }
}
