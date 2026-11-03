<?php

namespace App\Support;

use Illuminate\Validation\Validator;

final class CustomKernelConfig
{
    // No kernel is guessed here: existing panels do not store the effective
    // machine/instance kernel. The node validates against its actual core.
    public static function validate(Validator $validator, array $data): void
    {
        $outbounds = $data['custom_outbounds'] ?? [];
        $routes = $data['custom_routes'] ?? [];
        $seen = [];
        if (!is_array($outbounds) || !array_is_list($outbounds)) {
            $validator->errors()->add('custom_outbounds', '自定义出站必须是 JSON 数组。');
            return;
        }
        foreach ($outbounds as $i => $item) {
            $path = "custom_outbounds.$i";
            if (!is_array($item) || array_is_list($item)) {
                $validator->errors()->add($path, '出站必须是 JSON 对象。');
                continue;
            }
            $tag = $item['tag'] ?? null;
            if (!is_string($tag) || trim($tag) === '') {
                $validator->errors()->add("$path.tag", '出站标签不能为空。');
            } elseif (isset($seen[strtolower($tag)])) {
                $validator->errors()->add("$path.tag", '出站标签重复。');
            } else {
                $seen[strtolower($tag)] = true;
            }
            if (array_key_exists('type', $item)) {
                if (!is_string($item['type']) || trim($item['type']) === '') {
                    $validator->errors()->add("$path.type", 'Sing-box 原生出站需要非空 type。');
                }
                foreach (['protocol', 'settings', 'proxy_tag'] as $key) {
                    if (array_key_exists($key, $item)) {
                        $validator->errors()->add($path, '不能在同一出站中混用 type 和 protocol/settings/proxy_tag。');
                    }
                }
            } else {
                if (!is_string($item['protocol'] ?? null) || trim($item['protocol']) === '') {
                    $validator->errors()->add("$path.protocol", '出站需要 protocol 或 Sing-box 原生 type。');
                }
                if (isset($item['settings']) && (!is_array($item['settings']) || ($item['settings'] !== [] && array_is_list($item['settings'])))) {
                    $validator->errors()->add("$path.settings", 'settings 必须是 JSON 对象。');
                }
                if (isset($item['proxy_tag'], $item['proxySettings'])) {
                    $validator->errors()->add($path, 'proxy_tag 与 proxySettings 不能同时填写。');
                }
            }
        }
        // Only references to panel-defined tags can be checked at save time;
        // nodes may also define local outbounds. Unknown targets are checked on
        // the node, with its complete tag set, instead of breaking old configs.
        foreach ($outbounds as $i => $item) {
            if (!is_array($item)) { continue; }
            foreach (['detour', 'proxy_tag'] as $field) {
                if (array_key_exists($field, $item) && (!is_string($item[$field]) || ($item[$field] !== '' && ($item[$field] === ($item['tag'] ?? null) || trim($item[$field]) === '')))) {
                    $validator->errors()->add("custom_outbounds.$i.$field", '出站引用必须是非空标签，不能引用自身。');
                }
            }
        }
        if (!is_array($routes) || !array_is_list($routes)) {
            $validator->errors()->add('custom_routes', '自定义路由必须是 JSON 数组。');
            return;
        }
        foreach ($routes as $i => $item) {
            if (!is_array($item) || array_is_list($item)) {
                $validator->errors()->add("custom_routes.$i", '路由必须是 JSON 对象。');
                continue;
            }
            $xray = array_key_exists('outboundTag', $item) || array_key_exists('balancerTag', $item);
            $singbox = array_key_exists('action', $item) || array_key_exists('outbound', $item);
            if ($xray && $singbox) {
                $validator->errors()->add("custom_routes.$i", '不能在同一条路由中混用 Xray 与 Sing-box 的动作字段。');
            }
            foreach (['outboundTag', 'balancerTag', 'outbound'] as $field) {
                if (array_key_exists($field, $item) && (!is_string($item[$field]) || trim($item[$field]) === '')) {
                    $validator->errors()->add("custom_routes.$i.$field", '路由引用必须是非空字符串。');
                }
            }
            if (isset($item['action']) && !is_string($item['action'])) {
                $validator->errors()->add("custom_routes.$i.action", '原生路由 action 必须是字符串。');
            }
        }
    }

    // Laravel's associative JSON input otherwise turns empty native objects
    // into [], e.g. Xray settings:{} or sing-box transport.headers:{}.
    public static function preserveObjects(array $params, string $json): array
    {
        $raw = json_decode($json);
        if (!is_object($raw)) { return $params; }
        foreach (['custom_outbounds', 'custom_routes'] as $field) {
            if (array_key_exists($field, $params) && isset($raw->$field) && is_array($raw->$field)) {
                $params[$field] = array_map(static fn ($item) => is_object($item) ? (array) $item : $item, $raw->$field);
            }
        }
        return $params;
    }
}
