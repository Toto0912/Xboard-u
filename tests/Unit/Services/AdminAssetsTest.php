<?php

namespace Tests\Unit\Services;

use PHPUnit\Framework\TestCase;

class AdminAssetsTest extends TestCase
{
    public function test_open_source_admin_manifest_and_entry_assets_exist(): void
    {
        $root = dirname(__DIR__, 3);
        $adminDir = $root . '/public/assets/admin';
        $this->assertFileExists($adminDir . '/index.html');
        $this->assertFileExists($adminDir . '/manifest.json');

        $manifest = json_decode(file_get_contents($adminDir . '/manifest.json'), true, flags: JSON_THROW_ON_ERROR);
        $this->assertArrayHasKey('index.html', $manifest);

        $entry = $manifest['index.html'];
        $this->assertNotEmpty($entry['file'] ?? '');
        $this->assertFileExists($adminDir . '/' . $entry['file']);

        foreach ($entry['css'] ?? [] as $cssFile) {
            $this->assertFileExists($adminDir . '/' . $cssFile);
        }
    }

    public function test_admin_frontend_locales_have_consistent_top_level_keys(): void
    {
        $root = dirname(__DIR__, 3);
        $localeFiles = ['zh-CN.json', 'en-US.json', 'ru-RU.json'];
        $expectedKeys = null;

        foreach ($localeFiles as $file) {
            $path = $root . '/admin-frontend/src/i18n/locales/' . $file;
            $this->assertFileExists($path);
            $decoded = json_decode(file_get_contents($path), true, flags: JSON_THROW_ON_ERROR);
            $this->assertIsArray($decoded);
            $keys = array_keys($decoded);
            sort($keys);
            if ($expectedKeys === null) {
                $expectedKeys = $keys;
            } else {
                $this->assertSame($expectedKeys, $keys, "Top-level keys mismatch in {$file}");
            }
        }
    }

    public function test_admin_blade_uses_manifest_and_has_no_legacy_patcher_refs(): void
    {
        $root = dirname(__DIR__, 3);
        $blade = file_get_contents($root . '/resources/views/admin.blade.php');
        $this->assertStringContainsString("assets/admin/manifest.json", $blade);
        $this->assertStringContainsString("window.settings", $blade);
        $this->assertStringNotContainsString("admin-entry.json", $blade);
        $this->assertStringNotContainsString("assets/xboard-u/admin.js", $blade);
    }
}
