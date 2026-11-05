<?php

namespace Tests\Unit\Services;

use App\Support\AdminAssetPatcher;
use PHPUnit\Framework\TestCase;

class AdminAssetPatcherTest extends TestCase
{
    public function test_pinned_admin_extension_preserves_original_and_places_fields_before_transport(): void
    {
        $root = dirname(__DIR__, 3);
        $manifest = json_decode(file_get_contents($root . '/public/assets/admin/manifest.json'), true);
        $path = $root . '/public/assets/admin/' . $manifest['index.html']['file'];
        $source = file_get_contents($path);
        $patched = AdminAssetPatcher::patch($source, AdminAssetPatcher::readComponents($root));
        $this->assertSame(2, substr_count($patched, 'xray_fallback:cy().optional().default("")'));
        foreach (['vless', 'trojan'] as $protocol) {
            $field = strpos($patched, 'Q.jsx(XboardFallbackInput,{form:e,protocol:"' . $protocol . '"})');
            $network = strpos($patched, 'Q.jsx(XboardTransportEditor,{form:e,protocol:"' . $protocol . '"})');
            $this->assertNotFalse($field);
            $this->assertGreaterThan($field, $network);
            $this->assertLessThan(350, $network - $field);
        }
        $this->assertStringContainsString('value:"cdn",children:Q.jsx(XboardEditorTab', $patched);
        $this->assertSame(3, substr_count($patched, 'Q.jsx(XboardTransportEditor,'));
        $this->assertSame($source, file_get_contents($path));
        $this->assertStringContainsString('sing-box', $patched);
        $this->assertStringContainsString('支持 Sing-box 原生 type 配置', $patched);
        $this->assertStringContainsString('无匹配条件的规则可能接管全部流量', $patched);
        $this->assertStringContainsString('不覆盖 Reality 目标站', $patched);
        $this->assertStringNotContainsString('Reality 目标站，例如', $patched);
        $this->assertStringContainsString('flowOptions:["none","xtls-rprx-vision"]', $patched);
        $this->assertStringNotContainsString('flowOptions:["none","xtls-rprx-direct"', $patched);
        $this->assertStringContainsString('Q.jsx(XboardFlowInput,{form:e,t})', $patched);
    }

    public function test_changed_upstream_assets_fail_explicitly(): void
    {
        $this->expectException(\RuntimeException::class);
        AdminAssetPatcher::patch('different upstream version', '');
    }

    public function test_extension_messages_have_english_and_russian_translations(): void
    {
        $root = dirname(__DIR__, 3);
        $source = file_get_contents($root . '/resources/js/admin-i18n.js');
        preg_match('/const XboardTranslations = (.*?);\Rfor /s', $source, $match);
        $translations = json_decode($match[1], true, flags: JSON_THROW_ON_ERROR);
        $this->assertSame(array_keys($translations['en-US']), array_keys($translations['ru-RU']));
        $this->assertGreaterThan(100, count($translations['en-US']));
        foreach ($translations as $language => $messages) {
            foreach ($messages as $key => $translation) {
                $this->assertNotSame('', $translation, $language . ': ' . $key);
                $this->assertDoesNotMatchRegularExpression('/[\x{4e00}-\x{9fff}]/u', $translation);
            }
        }
        $components = AdminAssetPatcher::readComponents($root);
        preg_match_all('/XboardT\(([\'"])(.*?)\1\)/u', $components, $calls);
        foreach ($calls[2] as $message) {
            $this->assertArrayHasKey($message, $translations['en-US'], $message);
        }
        $this->assertStringContainsString("lL.addResourceBundle('ru-RU', 'server'", $source);
        $this->assertStringContainsString("jy('xboard-u')", $components);
        $this->assertStringContainsString('Port hopping interval (seconds)', $source);
        $this->assertStringContainsString('Интервал смены портов (секунды)', $source);
    }
}
