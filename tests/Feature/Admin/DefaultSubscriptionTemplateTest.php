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
}
