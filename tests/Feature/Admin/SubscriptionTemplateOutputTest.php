<?php

namespace Tests\Feature\Admin;

use App\Models\SubscribeTemplate;
use App\Protocols\Clash;
use App\Protocols\ClashMeta;
use App\Protocols\SingBox;
use App\Protocols\Stash;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Symfony\Component\Yaml\Yaml;
use Tests\TestCase;

class SubscriptionTemplateOutputTest extends TestCase
{
    use RefreshDatabase;

    private function user(): array
    {
        return ['uuid' => '7f894d8b-0d1c-4612-a901-b1475c06f513', 'u' => 0, 'd' => 0,
            'transfer_enable' => 1000, 'expired_at' => null];
    }

    public function test_empty_yaml_subscriptions_keep_all_group_references_valid(): void
    {
        foreach (['clash' => Clash::class, 'clashmeta' => ClashMeta::class, 'stash' => Stash::class] as $name => $class) {
            SubscribeTemplate::flushCache($name);
            $config = Yaml::parse((new $class($this->user(), []))->handle()->getContent());
            $this->assertSame([], $config['proxies']);
            $valid = [...array_column($config['proxy-groups'], 'name'), 'DIRECT', 'REJECT'];
            foreach ($config['proxy-groups'] as $group) {
                $this->assertNotEmpty($group['proxies']);
                foreach ($group['proxies'] as $member) {
                    $this->assertContains($member, $valid);
                }
            }
        }
    }

    public function test_empty_singbox_groups_use_existing_direct_without_losing_references(): void
    {
        SubscribeTemplate::flushCache('singbox');
        $config = json_decode((new SingBox($this->user(), [], 'sing-box', '1.14.4'))->handle()->getContent(), true, flags: JSON_THROW_ON_ERROR);
        $tags = array_column($config['outbounds'], 'tag');
        foreach ($config['outbounds'] as $outbound) {
            if (in_array($outbound['type'], ['selector', 'urltest'], true)) {
                $this->assertNotEmpty($outbound['outbounds']);
                foreach ($outbound['outbounds'] as $member) {
                    $this->assertContains($member, $tags);
                }
            }
        }
        $this->assertSame(['direct'], $config['outbounds'][1]['outbounds']);
        $this->assertCount(1, array_filter($config['outbounds'], fn ($outbound) => $outbound['type'] === 'direct'));
    }

    public function test_custom_singbox_template_without_direct_gets_one_unique_fallback_outbound(): void
    {
        $template = ['outbounds' => [
            ['type' => 'selector', 'tag' => 'xboard-empty-direct', 'outbounds' => []],
            ['type' => 'urltest', 'tag' => 'auto', 'outbounds' => []],
        ], 'route' => ['rules' => [], 'final' => 'xboard-empty-direct']];
        try {
            SubscribeTemplate::setContent('singbox', json_encode($template));
            $config = json_decode((new SingBox($this->user(), []))->handle()->getContent(), true, flags: JSON_THROW_ON_ERROR);
            $this->assertSame('xboard-empty-direct-fallback', $config['outbounds'][2]['tag']);
            $this->assertSame('direct', $config['outbounds'][2]['type']);
            $this->assertSame(['xboard-empty-direct-fallback'], $config['outbounds'][0]['outbounds']);
            $this->assertSame(['xboard-empty-direct-fallback'], $config['outbounds'][1]['outbounds']);
        } finally {
            SubscribeTemplate::flushCache('singbox');
        }
    }
}
