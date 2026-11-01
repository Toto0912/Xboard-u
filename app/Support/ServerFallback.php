<?php

namespace App\Support;

final class ServerFallback
{
    public static function target(mixed $value): string
    {
        if (!is_string($value)) {
            return '';
        }
        $value = trim($value);
        if (strlen($value) > 320) {
            return '';
        }
        if (preg_match('/\A\[([^\]]+)\]:([0-9]{1,5})\z/D', $value, $match)) {
            $host = $match[1];
            if (!filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
                return '';
            }
            $host = '[' . strtolower($host) . ']';
        } elseif (preg_match('/\A([A-Za-z0-9.-]+):([0-9]{1,5})\z/D', $value, $match)) {
            $host = strtolower($match[1]);
            if (!filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
                if (preg_match('/\A[0-9.]+\z/D', $host) || strlen($host) > 253 ||
                    !filter_var($host, FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME)) {
                    return '';
                }
            }
        } else {
            return '';
        }
        $port = (int) $match[2];
        return $port >= 1 && $port <= 65535 ? $host . ':' . $port : '';
    }

    public static function forNode(?string $type, array $settings): string
    {
        $tls = (int) ($settings['tls'] ?? ($type === 'trojan' ? 1 : 0));
        $network = $settings['network'] ?? 'tcp';
        if (!in_array($type, ['vless', 'trojan'], true) || !in_array($tls, [1, 2], true) ||
            !in_array($network, ['', null, 'tcp', 'raw'], true)) {
            return '';
        }
        // Xray rejects protocol-layer fallbacks together with VLESS Encryption.
        // Reality uses its separate handshake target and has no such conflict.
        if ($type === 'vless' && $tls === 1 && data_get($settings, 'encryption.enabled') &&
            !in_array(data_get($settings, 'encryption.decryption'), [null, '', 'none'], true)) {
            return '';
        }
        return self::target($settings['xray_fallback'] ?? null);
    }
}
