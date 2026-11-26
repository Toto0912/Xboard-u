<?php

namespace Tests\Feature\Server;

use App\Http\Controllers\V1\Client\ClientController;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Tests\TestCase;

class NaiveSubscriptionTest extends TestCase
{
    use RefreshDatabase;

    private const UUID = '09ecaf10-ae91-4340-957e-28512cd79a87';

    private function subscribe(string $agent, array $settings = [], array $query = []): string
    {
        $user = ['id' => 41, 'uuid' => self::UUID, 'token' => str_repeat('a', 32),
            'u' => 0, 'd' => 0, 'expired_at' => null, 'transfer_enable' => 12345];
        $server = ['name' => '测试 #1', 'host' => '[2001:db8::1]', 'port' => '8443', 'type' => 'naive',
            'password' => 'unused-node-password', 'protocol_settings' => array_replace_recursive([
                'tls' => 1, 'tls_settings' => ['server_name' => 'cert.example'],
            ], $settings)];
        $request = Request::create('/api/v1/client/subscribe', 'GET', $query, [], [], ['HTTP_USER_AGENT' => $agent]);
        $this->app->instance('request', $request);
        return (new ClientController())->doSubscribe($request, $user, [$server])->getContent();
    }

    public function test_official_clients_receive_the_account_outbound_and_stock_114_template(): void
    {
        foreach (['sing-box/1.14.0', 'SFI (sing-box 1.14.4; language zh_CN)',
            'SFA (sing-box 1.14.4; language en_US)', 'HiddifyNext/5.5.5 (android) like ClashMeta v2ray sing-box',
            'HiddifyNext/5.9.15 (ios) like ClashMeta v2ray sing-box'] as $agent) {
            $config = json_decode($this->subscribe($agent), true, flags: JSON_THROW_ON_ERROR);
            $proxies = array_column($config['outbounds'], null, 'type');
            $this->assertSame(['type' => 'naive', 'tag' => '测试 #1', 'server' => '2001:db8::1', 'server_port' => 8443,
                'username' => '41', 'password' => self::UUID, 'tls' => ['enabled' => true, 'server_name' => 'cert.example']],
                $proxies['naive'], $agent);
            $this->assertSame('default-http', $config['route']['default_http_client']);
            $this->assertContains('测试 #1', $proxies['urltest']['outbounds']);
        }
    }

    public function test_clients_without_a_native_export_keep_their_normal_subscription_format(): void
    {
        foreach (['Clash/v1.18.0', 'ClashMetaForAndroid/2.11.0', 'Stash/3.3.1', 'Surge/6.0', 'Surfboard/2.26'] as $agent) {
            $profile = $this->subscribe($agent);
            $this->assertNotSame('', $profile, $agent);
            $this->assertStringNotContainsString('测试 #1', $profile, $agent);
            $this->assertStringNotContainsString(self::UUID, $profile, $agent);
        }
    }

    public function test_old_and_unknown_clients_and_unusable_tls_do_not_receive_a_naive_outbound(): void
    {
        foreach (['sing-box/1.13.0', 'sing-box', 'sing-box/1.14.0-alpha.2',
            'HiddifyNext/5.5.6 (ios) like ClashMeta v2ray sing-box', 'HiddifyNext (ios) like ClashMeta v2ray sing-box'] as $agent) {
            $config = json_decode($this->subscribe($agent), true, flags: JSON_THROW_ON_ERROR);
            $this->assertNotContains('naive', array_column($config['outbounds'], 'type'), $agent);
        }
        foreach ([['tls' => 0], ['tls' => 2], ['tls_settings' => ['allow_insecure' => true]]] as $settings) {
            $config = json_decode($this->subscribe('sing-box/1.14.4', $settings), true, flags: JSON_THROW_ON_ERROR);
            $this->assertNotContains('naive', array_column($config['outbounds'], 'type'));
        }
    }

    public function test_only_public_ech_settings_are_exported_to_the_native_outbound(): void
    {
        $settings = ['tls_settings' => ['ech' => ['enabled' => true, 'config' => 'Y29uZmln',
            'query_server_name' => 'ech.example', 'key' => 'private-key-sentinel']]];
        $profile = $this->subscribe('sing-box/1.14.4', $settings);
        $out = array_column(json_decode($profile, true, flags: JSON_THROW_ON_ERROR)['outbounds'], null, 'type')['naive'];
        $this->assertSame(['enabled' => true, 'config' => ["-----BEGIN ECH CONFIGS-----\nY29uZmln\n-----END ECH CONFIGS-----"],
            'query_server_name' => 'ech.example'], $out['tls']['ech']);
        $this->assertStringNotContainsString('private-key-sentinel', $profile);
        $settings['tls_settings']['ech']['config'] = '%%%';
        $this->assertStringNotContainsString('"type":"naive"', $this->subscribe('sing-box/1.14.4', $settings));
    }

    public function test_v2rayn_share_link_preserves_ipv6_credentials_sni_and_name(): void
    {
        $line = trim(base64_decode($this->subscribe('v2rayN/7.20.4'), true));
        $this->assertSame('naive+https://41:' . self::UUID . '@[2001:db8::1]:8443?security=tls&sni=cert.example#'
            . rawurlencode('测试 #1'), $line);
        foreach (['v2rayN/6.0', 'v2rayNG/1.9.5', 'curl/8.0'] as $agent) {
            $this->assertSame('', base64_decode($this->subscribe($agent), true));
        }
        $this->assertSame('', base64_decode($this->subscribe('v2rayN/7.20.4', ['tls_settings' => ['ech' => ['enabled' => true]]]), true));
    }
}
