<?php

namespace App\Support;

use Illuminate\Support\Arr;

final class ServerTransport
{
    private const XHTTP_CLIENT_ONLY = ['noGRPCHeader', 'scMinPostsIntervalMs', 'xmux', 'downloadSettings'];

    private const XHTTP_SERVER_ONLY = ['noSSEHeader', 'scMaxBufferedPosts', 'scStreamUpServerSecs', 'serverMaxHeaderBytes'];

    private const TRANSPORTS = [
        'xray' => [
            'tcp' => ['acceptProxyProtocol'],
            'ws' => ['path', 'host', 'headers', 'acceptProxyProtocol'],
            'grpc' => ['serviceName'],
            'httpupgrade' => ['path', 'host', 'acceptProxyProtocol'],
            'xhttp' => ['mode', 'path', 'host', 'extra', 'acceptProxyProtocol'],
        ],
        'singbox' => [
            'tcp' => ['acceptProxyProtocol'],
            'ws' => ['path', 'headers', 'host', 'max_early_data', 'early_data_header_name', 'acceptProxyProtocol'],
            'grpc' => ['service_name', 'idle_timeout', 'ping_timeout', 'permit_without_stream'],
            'httpupgrade' => ['path', 'host', 'headers', 'acceptProxyProtocol'],
            'http' => ['path', 'host', 'method', 'headers', 'idle_timeout', 'ping_timeout'],
            'quic' => [],
        ],
    ];

    public static function canonicalNetwork(string $network, string $kernel): string
    {
        return match ($network) {
            'raw' => 'tcp',
            'splithttp' => 'xhttp',
            'websocket' => 'ws',
            'h2' => $kernel === 'singbox' ? 'http' : 'h2',
            default => $network,
        };
    }

    public static function normalize(array $settings): array
    {
        $kernel = $settings['target_kernel'] ?? null;
        if (!is_string($kernel) || !isset(self::TRANSPORTS[$kernel]) || !is_string($settings['network'] ?? null)) {
            return $settings;
        }

        $settings['network'] = self::canonicalNetwork($settings['network'], $kernel);
        $params = $settings['network_settings'] ?? null;
        if (!is_array($params)) {
            return $settings;
        }

        if ($settings['network'] === 'grpc') {
            $key = $kernel === 'xray' ? 'serviceName' : 'service_name';
            $alias = $kernel === 'xray' ? 'service_name' : 'serviceName';
            if (array_key_exists($alias, $params) && !array_key_exists($key, $params)) {
                $params[$key] = $params[$alias];
                unset($params[$alias]);
            }
        }

        if ($settings['network'] === 'ws' && $kernel === 'singbox'
            && (!isset($params['headers']) || is_array($params['headers']))) {
            $headers = $params['headers'] ?? [];
            foreach ($headers as $name => $value) {
                if (strcasecmp($name, 'host') === 0 && (!isset($headers['Host']) || $headers['Host'] === $value)) {
                    unset($headers[$name]);
                    $headers['Host'] = $value;
                }
            }
            if (isset($params['host']) && (!isset($headers['Host']) || $headers['Host'] === $params['host'])) {
                $headers['Host'] = $params['host'];
                unset($params['host']);
            }
            if ($headers || array_key_exists('headers', $params)) {
                $params['headers'] = $headers;
            }
        }
        if ($settings['network'] === 'http' && $kernel === 'singbox' && is_string($params['host'] ?? null)) {
            $params['host'] = [$params['host']];
        }
        if ($settings['network'] === 'ws' && $kernel === 'xray' && is_array($params['headers'] ?? null)) {
            foreach ($params['headers'] as $name => $value) {
                if (strcasecmp($name, 'Host') !== 0) {
                    continue;
                }
                if (!isset($params['host']) && is_string($value)) {
                    $params['host'] = $value;
                }
                if ($value === ($params['host'] ?? null)) {
                    unset($params['headers'][$name]);
                }
            }
        }

        $settings['network_settings'] = $params;
        return $settings;
    }

    public static function error(array $settings, bool $server, bool $shared = false): ?string
    {
        if ($settings['transport_draft_invalid'] ?? false) {
            return '传输 JSON 草稿存在结构错误。';
        }

        $settings = self::normalize($settings);
        $network = $settings['network'] ?? null;
        $kernel = $settings['target_kernel'] ?? null;
        if (($kernel === 'xray' || in_array($network, ['xhttp', 'splithttp'], true))
            && (int) ($settings['tls'] ?? 0) === 1
            && !empty($settings['tls_settings']['allow_insecure'])) {
            return 'Xray 已移除 TLS allowInsecure。请关闭该选项并配置可验证的 TLS 证书。';
        }
        if (!is_string($network) || !is_string($kernel) || !isset(self::TRANSPORTS[$kernel])) {
            return null;
        }

        $allowed = self::TRANSPORTS[$kernel][$network] ?? null;
        if ($allowed === null) {
            return '当前内核与传输组合未适配或已移除，请手动迁移。旧 HTTP/H2 不能自动转换为 XHTTP。';
        }
        if ($network === 'quic' && (int) ($settings['tls'] ?? 0) !== 1) {
            return '旧 V2Ray QUIC 必须启用 TLS。';
        }

        if ($network === 'ws' && isset($settings['network_settings']['host'], $settings['network_settings']['headers']['Host'])) {
            return 'WebSocket Host 与 headers.Host 冲突。请保留一个值。';
        }

        foreach ($settings['network_settings'] ?? [] as $field => $value) {
            if (!in_array($field, $allowed, true)) {
                return '当前内核的面板适配器尚未支持传输字段 ' . $field . '。';
            }

            $valid = match ($field) {
                'acceptProxyProtocol' => $server && is_bool($value),
                'max_early_data' => is_int($value) && $value >= 0 && $value <= 4294967295,
                'permit_without_stream' => (!$server || $shared) && is_bool($value),
                'idle_timeout', 'ping_timeout' => is_string($value)
                    && preg_match('/^(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h))+$/uD', $value) === 1,
                'headers' => is_array($value) && ($value === [] || !array_is_list($value))
                    && (!$server || $shared || $kernel !== 'xray' || $value === [])
                    && array_filter($value, 'is_string') === $value,
                'extra' => is_array($value) && ($value === [] || !array_is_list($value))
                    && (!$server || $shared || !array_key_exists('downloadSettings', $value)),
                'mode' => in_array($value, ['', 'auto', 'packet-up', 'stream-up', 'stream-one'], true),
                'host' => is_string($value) || ($network === 'http' && is_array($value)
                    && array_is_list($value) && array_filter($value, 'is_string') === $value),
                default => is_string($value),
            };
            if (!$valid) {
                return '传输字段 ' . $field . ' 的类型错误或不适用于当前配置侧。';
            }
        }
        if ($network === 'httpupgrade' && is_array($settings['network_settings']['headers'] ?? null)
            && array_key_exists('host', array_change_key_case($settings['network_settings']['headers']))) {
            return 'HTTPUpgrade 的 Host 应填在独立字段。';
        }
        if ($network === 'xhttp' && !empty($settings['network_settings']['extra'])) {
            return self::xhttpError($settings['network_settings'], $server, $shared);
        }
        return null;
    }

    private static function xhttpError(array $params, bool $server, bool $shared): ?string
    {
        $extra = $params['extra'];
        $common = [
            'headers', 'xPaddingBytes', 'xPaddingObfsMode', 'xPaddingKey', 'xPaddingHeader',
            'xPaddingPlacement', 'xPaddingMethod', 'uplinkHTTPMethod', 'sessionIDPlacement',
            'sessionIDKey', 'sessionIDTable', 'sessionIDLength', 'seqPlacement', 'seqKey',
            'uplinkDataPlacement', 'uplinkDataKey', 'uplinkChunkSize', 'scMaxEachPostBytes',
        ];
        $allowed = [
            ...$common,
            ...($server || $shared ? self::XHTTP_SERVER_ONLY : []),
            ...(!$server || $shared ? self::XHTTP_CLIENT_ONLY : []),
        ];
        foreach ($extra as $field => $value) {
            if (!in_array($field, $allowed, true)) {
                return 'XHTTP Extra 字段 ' . $field . ' 尚未适配或不适用于当前配置侧。';
            }
            $valid = match ($field) {
                'headers' => is_array($value) && ($value === [] || !array_is_list($value))
                    && !array_key_exists('host', array_change_key_case($value))
                    && array_filter($value, 'is_string') === $value,
                'xmux', 'downloadSettings' => is_array($value) && ($value === [] || !array_is_list($value)),
                'noSSEHeader', 'noGRPCHeader', 'xPaddingObfsMode' => is_bool($value),
                'scMaxBufferedPosts', 'serverMaxHeaderBytes' => is_int($value) && $value >= 0,
                'xPaddingBytes', 'sessionIDLength', 'uplinkChunkSize', 'scMaxEachPostBytes',
                'scMinPostsIntervalMs', 'scStreamUpServerSecs' => self::validRange($value),
                default => is_string($value),
            };
            if (!$valid) {
                return 'XHTTP Extra 字段 ' . $field . ' 的类型或结构不正确。';
            }
        }
        foreach ($extra['xmux'] ?? [] as $field => $value) {
            if (!in_array($field, ['maxConcurrency', 'maxConnections', 'cMaxReuseTimes',
                'hMaxRequestTimes', 'hMaxReusableSecs', 'hKeepAlivePeriod'], true)
                || ($field === 'hKeepAlivePeriod' ? !is_int($value) : !self::validRange($value))) {
                return 'XHTTP XMUX 字段 ' . $field . ' 未适配或类型错误。';
            }
        }
        if (isset($extra['downloadSettings'])) {
            if (($params['mode'] ?? 'auto') === 'stream-one') {
                return 'XHTTP stream-one 无法分离上下行。';
            }
            $download = $extra['downloadSettings'];
            if (!is_string($download['address'] ?? null) || trim($download['address']) === ''
                || !is_int($download['port'] ?? null) || $download['port'] < 1 || $download['port'] > 65535
                || !in_array($download['network'] ?? null, ['xhttp', 'splithttp'], true)
                || !in_array($download['security'] ?? 'none', ['none', 'tls', 'reality'], true)) {
                return 'XHTTP 下行需要独立地址、有效端口、XHTTP 传输和明确的安全性。';
            }
            if (self::stripPrivateTransportFields($download) !== $download) {
                return '客户端下行参数不能包含私钥或服务端证书。';
            }
            $security = $download['security'] ?? 'none';
            $tls = $download[$security . 'Settings'] ?? [];
            if (!is_array($tls) || ($tls !== [] && array_is_list($tls))
                || ($security === 'reality' && !is_string($tls['publicKey'] ?? $tls['password'] ?? null))) {
                return '请检查 XHTTP 下行 TLS/Reality 对象与公钥。';
            }
            if ($security === 'tls' && !empty($tls['allowInsecure'])) {
                return 'Xray 下行 TLS 已移除 allowInsecure。请使用有效证书。';
            }
            foreach (['tlsSettings', 'realitySettings', 'xhttpSettings', 'splithttpSettings', 'sockopt'] as $key) {
                if (array_key_exists($key, $download) && (!is_array($download[$key])
                    || ($download[$key] !== [] && array_is_list($download[$key])))) {
                    return 'XHTTP 下行字段 ' . $key . ' 必须是 JSON 对象。';
                }
            }
            if (array_diff(array_keys($download), [
                'address', 'port', 'network', 'security', 'tlsSettings',
                'realitySettings', 'xhttpSettings', 'splithttpSettings', 'sockopt',
            ])) {
                return 'XHTTP 下行含有面板尚未适配的连接字段。';
            }
        }
        return null;
    }

    private static function validRange(mixed $value): bool
    {
        return (is_int($value) && $value >= 0)
            || (is_string($value) && preg_match('/^\d+(?:-\d+)?$/D', $value) === 1);
    }

    public static function clientPayload(array $server): array
    {
        Arr::forget($server, [
            'cdn_settings', 'server_port', 'cert_config', 'custom_outbounds', 'custom_routes',
            'protocol_settings.xray_fallback',
            'protocol_settings.target_kernel',
            'protocol_settings.reality_settings.private_key',
            'protocol_settings.reality_settings.dest',
            'protocol_settings.reality_settings.server_port',
            'protocol_settings.encryption.decryption',
            'protocol_settings.tls_settings.ech.key',
            'protocol_settings.tls_settings.ech.key_path',
            'protocol_settings.tls_settings.ech.config_path',
            'protocol_settings.tls.ech.key',
            'protocol_settings.tls.ech.key_path',
            'protocol_settings.tls.ech.config_path',
        ]);
        if (is_array($server['protocol_settings'] ?? null)) {
            $server['protocol_settings'] = self::subscriptionSettings($server['protocol_settings']);
        }
        return $server;
    }

    public static function subscriptionSettings(array $settings): array
    {
        if (!array_key_exists('network', $settings)) {
            return $settings;
        }
        $settings['network'] = match ($settings['network'] ?? null) {
            'http' => 'h2',
            'raw' => 'tcp',
            'splithttp' => 'xhttp',
            'websocket' => 'ws',
            default => $settings['network'] ?? null,
        };
        if (!is_array($settings['network_settings'] ?? null)) {
            return $settings;
        }
        $params = &$settings['network_settings'];
        if (($settings['network'] ?? null) === 'ws' && !empty($params['host'])
            && (!isset($params['headers']) || is_array($params['headers'])) && !isset($params['headers']['Host'])) {
            $params['headers']['Host'] = $params['host'];
        }
        if (($settings['network'] ?? null) === 'grpc' && !isset($params['serviceName']) && isset($params['service_name'])) {
            $params['serviceName'] = $params['service_name'];
        }
        unset($params['acceptProxyProtocol']);
        if ($settings['network'] === 'xhttp' && is_array($params['extra'] ?? null)) {
            $params['extra'] = array_diff_key($params['extra'], array_flip(self::XHTTP_SERVER_ONLY));
        }
        $params = self::stripPrivateTransportFields($params);
        return $settings;
    }

    private static function stripPrivateTransportFields(array $params): array
    {
        foreach ($params as $key => $value) {
            $name = strtolower(str_replace(['_', '-'], '', (string) $key));
            if (in_array($name, ['privatekey', 'certificates', 'certificate', 'certificatefile', 'certcontent', 'keyfile', 'keycontent', 'echserverkeys'], true)) {
                unset($params[$key]);
            } elseif (is_array($value)) {
                $params[$key] = self::stripPrivateTransportFields($value);
            }
        }
        return $params;
    }

    public static function requiresNativeSingBoxTransport(array $server): bool
    {
        $settings = $server['protocol_settings'] ?? [];
        $params = $settings['network_settings'] ?? [];
        return match ($settings['network'] ?? null) {
            'ws' => (int) ($params['max_early_data'] ?? 0) > 0
                || !empty($params['early_data_header_name'])
                || (is_array($params['headers'] ?? null) && (bool) array_diff_key($params['headers'], ['Host' => true])),
            'grpc' => !empty($params['idle_timeout']) || !empty($params['ping_timeout']) || !empty($params['permit_without_stream']),
            'http', 'h2' => !empty($params['headers']) || !empty($params['method'])
                || !empty($params['idle_timeout']) || !empty($params['ping_timeout']),
            'httpupgrade' => !empty($params['headers']),
            default => false,
        };
    }

    public static function nodeParameters(array $settings, bool $separated): ?array
    {
        $params = $settings['network_settings'] ?? null;
        if ($separated && in_array($settings['network'] ?? null, ['xhttp', 'splithttp'], true)
            && is_array($params['extra'] ?? null)) {
            $params['extra'] = array_diff_key($params['extra'], array_flip(self::XHTTP_CLIENT_ONLY));
            if (!$params['extra'] && !empty($settings['network_settings']['extra'])) {
                unset($params['extra']);
            }
        }
        return $params ? self::restoreTransportObjects($params) : null;
    }

    public static function forEditor(array $settings): array
    {
        if (array_key_exists('network_settings', $settings)) {
            $settings['network_settings'] = (object) self::restoreTransportObjects($settings['network_settings'] ?? []);
        }
        return $settings;
    }

    private static function restoreTransportObjects(array $params): array
    {
        foreach ($params as $key => $value) {
            if (!is_array($value)) {
                continue;
            }
            if ($value === [] && in_array($key, ['headers', 'extra', 'xmux', 'sockopt', 'tlsSettings',
                'realitySettings', 'xhttpSettings', 'splithttpSettings', 'downloadSettings'], true)) {
                $params[$key] = (object) [];
            } else {
                $params[$key] = self::restoreTransportObjects($value);
            }
        }
        return $params;
    }
}
