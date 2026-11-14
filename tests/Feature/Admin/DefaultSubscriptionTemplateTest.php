<?php

namespace Tests\Feature\Admin;

use App\Models\SubscribeTemplate;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Yaml\Yaml;
use Tests\TestCase;

class DefaultSubscriptionTemplateTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        foreach (['singbox', 'clash', 'clashmeta', 'stash', 'surge'] as $name) {
            SubscribeTemplate::flushCache($name);
        }
    }

    protected function tearDown(): void
    {
        foreach (['singbox', 'clash', 'clashmeta', 'stash', 'surge'] as $name) {
            SubscribeTemplate::flushCache($name);
        }
        parent::tearDown();
    }

    private function defaults(): array
    {
        return ['singbox' => 'default.sing-box.json', 'clash' => 'default.clash.yaml',
            'clashmeta' => 'default.clashmeta.yaml', 'stash' => 'default.clashmeta.yaml'];
    }

    public function test_fresh_install_has_the_new_defaults_for_all_four_clients(): void
    {
        foreach ($this->defaults() as $name => $file) {
            $expected = file_get_contents(base_path('resources/rules/' . $file));
            $this->assertSame($expected, DB::table('v2_subscribe_templates')->where('name', $name)->value('content'));
            if ($name === 'singbox') {
                $config = json_decode($expected, true, flags: JSON_THROW_ON_ERROR);
                $this->assertSame('default-http', $config['route']['default_http_client']);
                $this->assertSame('fakeip', $config['dns']['servers'][0]['type']);
            } else {
                $config = Yaml::parse($expected);
                $this->assertSame(33333, $config['mixed-port']);
                $this->assertArrayHasKey('节点选择', array_column($config['proxy-groups'], null, 'name'));
            }
        }
    }

    public function test_upgrading_preserves_administrator_templates_and_other_template_types(): void
    {
        $before = DB::table('v2_subscribe_templates')->pluck('content', 'name')->all();
        foreach ($this->defaults() as $name => $file) {
            SubscribeTemplate::setContent($name, 'administrator custom template: ' . $name);
        }
        $migration = require database_path('migrations/2026_11_01_000001_update_default_subscription_templates.php');
        $migration->up();
        foreach ($before as $name => $original) {
            $want = isset($this->defaults()[$name]) ? 'administrator custom template: ' . $name : $original;
            $this->assertSame($want, DB::table('v2_subscribe_templates')->where('name', $name)->value('content'));
        }
    }

    public function test_old_redis_cache_does_not_hide_new_defaults(): void
    {
        Cache::store('redis')->put('subscribe_template:singbox', 'old cached template', 60);
        try {
            $this->assertSame(file_get_contents(base_path('resources/rules/default.sing-box.json')), SubscribeTemplate::getContent('singbox'));
        } finally {
            Cache::store('redis')->forget('subscribe_template:singbox');
        }
    }

    public function test_refresh_migration_replaces_only_known_defaults_and_clears_previous_cache_generation(): void
    {
        $defaults = ['surge' => 'default.surge.conf'] + $this->defaults();
        $migration = require database_path('migrations/2026_11_14_000001_refresh_subscription_defaults.php');
        foreach ($defaults as $name => $file) {
            $legacy = file_get_contents(base_path('tests/Fixtures/subscription-defaults-20261112/' . $file));
            foreach ([$legacy, str_replace("\n", "\r\n", str_replace("\r\n", "\n", $legacy))] as $content) {
                SubscribeTemplate::setContent($name, $content);
                $migration->up();
                SubscribeTemplate::flushCache($name);
                $this->assertSame(file_get_contents(base_path('resources/rules/' . $file)), SubscribeTemplate::getContent($name));
            }
            SubscribeTemplate::setContent($name, 'custom administrator template: ' . $name);
            $migration->up();
            $this->assertSame('custom administrator template: ' . $name, SubscribeTemplate::getContent($name));
        }
        Cache::store('redis')->put('subscribe_template:v20261112:surge', 'old cached surge template', 60);
        try {
            $this->assertSame('custom administrator template: surge', SubscribeTemplate::getContent('surge'));
        } finally {
            Cache::store('redis')->forget('subscribe_template:v20261112:surge');
        }
    }

    public function test_premium_clash_quic_shortcut_is_defined_and_shared_stash_template_is_identical(): void
    {
        $clash = Yaml::parse(SubscribeTemplate::getContent('clash'));
        $this->assertSame('normal', $clash['dns']['enhanced-mode']);
        $this->assertSame("network == 'udp' and dst_port == 443", $clash['script']['shortcuts']['quic']);
        $this->assertContains('SCRIPT,quic,REJECT,no-resolve', $clash['rules']);
        $this->assertSame(SubscribeTemplate::getContent('clashmeta'), SubscribeTemplate::getContent('stash'));
        $singbox = json_decode(SubscribeTemplate::getContent('singbox'), true, flags: JSON_THROW_ON_ERROR);
        $this->assertSame('127.0.0.1', $singbox['inbounds'][0]['listen']);
        $this->assertSame('2001:2::1/126', $singbox['inbounds'][1]['address'][1]);
    }
}
