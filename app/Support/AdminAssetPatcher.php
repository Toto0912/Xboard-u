<?php

namespace App\Support;

use RuntimeException;

final class AdminAssetPatcher
{
    // The upstream distributes compiled admin assets. Keep the submodule
    // untouched and generate a small, reproducible extension during builds.
    private const UPSTREAM_SHA256 = 'f04f09a95bfdb04fa5132e336bf87c364d4e360cb95774872ff18eb69e9bcd77';

    public static function patch(string $source, string $component): string
    {
        if (hash('sha256', $source) !== self::UPSTREAM_SHA256) {
            throw new RuntimeException('Admin bundle changed: review the fallback extension before building.');
        }
        foreach (['A4t' => 'vless', 'W4t' => 'trojan'] as $schema => $protocol) {
            $old = $schema . '=(e,t)=>py({tls:';
            $new = $schema . '=(e,t)=>py({xray_fallback:cy().optional().default(""),tls:';
            if (substr_count($source, $old) !== 1) {
                throw new RuntimeException('Unexpected admin schema anchor: ' . $protocol);
            }
            $source = str_replace($old, $new, $source);
            $marker = 'dynamic_form.' . $protocol . '.network.label';
            if (substr_count($source, $marker) !== 1) {
                throw new RuntimeException('Unexpected admin transport anchor: ' . $protocol);
            }
            $position = strpos($source, $marker);
            $prefix = substr($source, 0, $position);
            $field = 'Q.jsx($y,{control:e.control,name:"network",';
            $insert = strrpos($prefix, $field);
            if ($insert === false || $position - $insert > 300) {
                throw new RuntimeException('Cannot locate the transport field: ' . $protocol);
            }
            $source = substr_replace($source, 'Q.jsx(XboardFallbackInput,{form:e,protocol:"' . $protocol . '"}),', $insert, 0);
        }
        return $source . "\n;" . $component . "\n";
    }

    public static function prepare(string $root): array
    {
        $admin = $root . '/public/assets/admin';
        $manifest = json_decode(file_get_contents($admin . '/manifest.json'), true, flags: JSON_THROW_ON_ERROR);
        $entry = $manifest['index.html']['file'] ?? '';
        if (!preg_match('/\Aassets\/[a-zA-Z0-9_-]+\.js\z/D', $entry)) {
            throw new RuntimeException('Missing pinned admin entry. Initialize the admin submodule.');
        }
        $source = file_get_contents($admin . '/' . $entry);
        $component = file_get_contents($root . '/resources/js/admin-fallback.js');
        $patched = self::patch($source, $component);
        $output = substr($entry, 0, -3) . '.xboard-u-' . substr(hash('sha256', $patched), 0, 12) . '.js';
        if (file_put_contents($admin . '/' . $output, $patched) === false) {
            throw new RuntimeException('Cannot write generated admin entry.');
        }
        $metadata = [$entry => $output];
        $directory = $root . '/public/assets/xboard-u';
        if (!is_dir($directory) && !mkdir($directory, 0755, true)) {
            throw new RuntimeException('Cannot create admin metadata directory.');
        }
        if (file_put_contents($directory . '/admin-entry.json', json_encode($metadata, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR)) === false) {
            throw new RuntimeException('Cannot write generated admin metadata.');
        }
        return $metadata;
    }
}
