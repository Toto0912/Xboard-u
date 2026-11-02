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
        $patched = AdminAssetPatcher::patch($source, file_get_contents($root . '/resources/js/admin-fallback.js'));
        $this->assertSame(2, substr_count($patched, 'xray_fallback:cy().optional().default("")'));
        foreach (['vless', 'trojan'] as $protocol) {
            $field = strpos($patched, 'Q.jsx(XboardFallbackInput,{form:e,protocol:"' . $protocol . '"})');
            $network = strpos($patched, 'dynamic_form.' . $protocol . '.network.label');
            $this->assertNotFalse($field);
            $this->assertGreaterThan($field, $network);
            $this->assertLessThan(350, $network - $field);
        }
        $this->assertSame($source, file_get_contents($path));
        $this->assertStringContainsString('sing-box', $patched);
        $this->assertStringContainsString('不覆盖 Reality 目标站', $patched);
        $this->assertStringNotContainsString('Reality 目标站，例如', $patched);
    }

    public function test_changed_upstream_assets_fail_explicitly(): void
    {
        $this->expectException(\RuntimeException::class);
        AdminAssetPatcher::patch('different upstream version', '');
    }
}
