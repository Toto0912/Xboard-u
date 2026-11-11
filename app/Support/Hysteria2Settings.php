<?php

namespace App\Support;

use Illuminate\Validation\Validator;

final class Hysteria2Settings
{
    public static function normalize(array $settings): array
    {
        if ((int) ($settings['version'] ?? 2) !== 2) {
            $settings['hy2_settings'] = null;
            return $settings;
        }
        $extra = is_array($settings['hy2_settings'] ?? null) ? $settings['hy2_settings'] : [];
        $extra['bandwidth_mode'] = 'auto';
        if (empty($extra['masquerade'])) { unset($extra['masquerade']); }
        $settings['hy2_settings'] = $extra;
        return $settings;
    }

    public static function validate(Validator $validator, array $data): void
    {
        if (($data['type'] ?? null) !== 'hysteria') { return; }
        $separated = (bool) data_get($data, 'cdn_settings.enabled');
        foreach (['protocol_settings', 'cdn_settings.server.protocol_settings'] as $path) {
            $settings = data_get($data, $path);
            if (!is_array($settings)) { continue; }
            if ((int) ($settings['version'] ?? 2) !== 2) { continue; }
            foreach (['up','down'] as $direction) {
                $n = data_get($settings, 'bandwidth.'.$direction);
                if ($n !== null && $n !== '' && (!is_numeric($n) || (float) $n != (int) $n || $n < 0 || $n > 1000000)) {
                    $validator->errors()->add("$path.bandwidth.$direction", 'Bandwidth must be between 0 and 1000000 Mbps.');
                }
            }
            if (data_get($settings, 'obfs.open')) {
                if (!in_array(data_get($settings, 'obfs.type', 'salamander'), ['salamander','gecko'], true) || !is_string(data_get($settings, 'obfs.password')) || data_get($settings, 'obfs.password') === '') {
                    $validator->errors()->add("$path.obfs", 'HY2 obfs requires salamander or gecko and a non-empty password.');
                }
            }
            if ($separated && $path === 'protocol_settings') { continue; }
            if ($message = self::error($settings)) { $validator->errors()->add("$path.hy2_settings", $message); }
        }
    }

    public static function error(array $settings): ?string
    {
        if ($settings['hy2_draft_invalid'] ?? false) { return 'Invalid Masquerade JSON draft.'; }
        $extra = $settings['hy2_settings'] ?? null;
        if ($extra === null || $extra === []) { return null; }
        if (!is_array($extra) || array_is_list($extra)) { return 'hy2_settings must be an object.'; }
        if (array_diff(array_keys($extra), ['kernel','bandwidth_mode','masquerade'])) { return 'Unsupported HY2 setting; custom QUIC parameters are not supported.'; }
        if (isset($extra['bandwidth_mode']) && $extra['bandwidth_mode'] !== 'auto') { return 'bandwidth_mode must be auto.'; }
        $m = $extra['masquerade'] ?? null;
        if ($m === null || $m === []) { return null; }
        if (!is_array($m) || array_is_list($m)) { return 'Masquerade must be a JSON object.'; }
        $kernel = $settings['target_kernel'] ?? 'singbox';
        if (!in_array($kernel, ['singbox','xray'], true) || ($extra['kernel'] ?? null) !== $kernel) { return 'Masquerade kernel does not match the server target core.'; }
        $type = $m['type'] ?? null;
        $dir = $kernel === 'xray' ? 'dir' : 'directory';
        $host = $kernel === 'xray' ? 'rewriteHost' : 'rewrite_host';
        $status = $kernel === 'xray' ? 'statusCode' : 'status_code';
        $keys = match ($type) {
            'file' => ['type',$dir],
            'proxy' => array_merge(['type','url',$host], $kernel === 'xray' ? ['insecure','xForwarded'] : []),
            'string' => ['type',$status,'headers','content'],
            default => [],
        };
        if (!$keys) { return 'Masquerade type must be file, proxy or string.'; }
        if (array_diff(array_keys($m), $keys)) { return 'Unsupported Masquerade field for this core and type.'; }
        $required = match ($type) { 'file' => $dir, 'proxy' => 'url', default => 'content' };
        if (!is_string($m[$required] ?? null) || ($type !== 'string' && trim($m[$required]) === '')) { return "Masquerade $required is required."; }
        if ($type === 'proxy') {
            $url = parse_url($m['url']);
            if (!$url || !in_array($url['scheme'] ?? '', ['http','https'], true) || empty($url['host']) || isset($url['user']) || isset($url['pass']) || isset($url['fragment'])) { return 'Masquerade URL must be HTTP(S), without credentials or fragment.'; }
        }
        foreach ([$host,'insecure','xForwarded'] as $key) { if (array_key_exists($key, $m) && !is_bool($m[$key])) { return "Masquerade $key must be boolean."; } }
        if (array_key_exists($status, $m) && (!is_int($m[$status]) || $m[$status] < 200 || $m[$status] > 599)) { return 'Masquerade status code must be an integer between 200 and 599.'; }
        if (array_key_exists('headers', $m)) {
            if (!is_array($m['headers']) || ($m['headers'] !== [] && array_is_list($m['headers']))) { return 'Masquerade headers must be an object.'; }
            foreach ($m['headers'] as $key => $value) {
                if (!is_string($key) || !preg_match('/^[!#$%&\x27*+.^_`|~0-9A-Za-z-]+$/D', $key)) { return 'Invalid Masquerade header name.'; }
                $values = $kernel === 'singbox' && is_array($value) && array_is_list($value) ? $value : [$value];
                foreach ($values as $item) { if (!is_string($item) || strpbrk($item, "\r\n") !== false) { return 'Invalid Masquerade header value.'; } }
            }
        }
        return null;
    }

    public static function server(array $settings): ?array
    {
        if ((int) ($settings['version'] ?? 2) !== 2) { return null; }
        $settings = self::normalize($settings);
        $extra = $settings['hy2_settings'];
        if (isset($extra['masquerade']['headers']) && $extra['masquerade']['headers'] === []) {
            $extra['masquerade']['headers'] = (object) [];
        }
        return $extra;
    }
}
