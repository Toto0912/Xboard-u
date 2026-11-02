<?php

namespace App\Support;

use App\Utils\Helper;
use InvalidArgumentException;

/** Translate Xray's XHTTP schema; downloadSettings does not inherit its uplink. */
final class MihomoXhttp
{
    private const STRINGS = [
        'xPaddingKey' => 'x-padding-key', 'xPaddingHeader' => 'x-padding-header',
        'xPaddingPlacement' => 'x-padding-placement', 'xPaddingMethod' => 'x-padding-method',
        'uplinkHTTPMethod' => 'uplink-http-method', 'sessionIDPlacement' => 'session-placement',
        'sessionIDKey' => 'session-key', 'sessionIDTable' => 'session-table',
        'seqPlacement' => 'seq-placement', 'seqKey' => 'seq-key',
        'uplinkDataPlacement' => 'uplink-data-placement', 'uplinkDataKey' => 'uplink-data-key',
    ];

    private const RANGES = [
        'xPaddingBytes' => 'x-padding-bytes', 'sessionIDLength' => 'session-length',
        'uplinkChunkSize' => 'uplink-chunk-size', 'scMaxEachPostBytes' => 'sc-max-each-post-bytes',
        'scMinPostsIntervalMs' => 'sc-min-posts-interval-ms',
    ];

    private const BOOLS = ['noGRPCHeader' => 'no-grpc-header', 'xPaddingObfsMode' => 'x-padding-obfs-mode'];

    public static function convert(array $settings): array
    {
        $opts = [];
        foreach (['path', 'host', 'mode'] as $key) {
            if (isset($settings[$key]) && $settings[$key] !== '') {
                $opts[$key] = self::string($settings[$key]);
            }
        }
        if (!in_array($opts['mode'] ?? 'auto', ['auto', 'packet-up', 'stream-up', 'stream-one'], true)) {
            throw new InvalidArgumentException('unsupported XHTTP mode');
        }
        $extra = self::object($settings['extra'] ?? []);
        $opts += self::transport($extra);
        if (isset($extra['downloadSettings'])) {
            if (($opts['mode'] ?? 'auto') === 'stream-one') {
                throw new InvalidArgumentException('stream-one cannot separate upload and download');
            }
            $opts['download-settings'] = self::download(self::object($extra['downloadSettings']), $extra);
        }
        return $opts;
    }

    private static function transport(array $extra): array
    {
        // Server-only limits are intentionally not client options. These client features
        // have no equivalent in Mihomo and must not silently change connection behavior.
        if (!empty($extra['h2Params'])) {
            throw new InvalidArgumentException('XHTTP h2Params cannot be represented in Mihomo');
        }
        $opts = [];
        foreach (self::STRINGS as $source => $target) {
            if (isset($extra[$source])) {
                $opts[$target] = self::string($extra[$source]);
            }
        }
        foreach (self::RANGES as $source => $target) {
            if (isset($extra[$source])) {
                $opts[$target] = self::range($extra[$source]);
            }
        }
        foreach (self::BOOLS as $source => $target) {
            if (isset($extra[$source])) {
                if (!is_bool($extra[$source])) {
                    throw new InvalidArgumentException('XHTTP boolean option has invalid type');
                }
                $opts[$target] = $extra[$source];
            }
        }
        if (isset($extra['headers'])) {
            $opts['headers'] = self::headers($extra['headers']);
        }
        if (isset($extra['xmux'])) {
            $opts['reuse-settings'] = self::reuse(self::object($extra['xmux']));
        }
        return $opts;
    }

    private static function download(array $down, array $uplink): array
    {
        if (!in_array($down['network'] ?? '', ['xhttp', 'splithttp'], true)) {
            throw new InvalidArgumentException('downloadSettings requires XHTTP transport');
        }
        $server = self::string($down['address'] ?? '');
        $port = filter_var($down['port'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 65535]]);
        if ($server === '' || !$port) {
            throw new InvalidArgumentException('downloadSettings requires address and valid port');
        }
        foreach (['sockopt', 'kcpSettings', 'quicParams', 'finalmask', 'tcpSettings'] as $key) {
            if (!empty($down[$key])) {
                throw new InvalidArgumentException('unsupported download stream option');
            }
        }
        $http = self::object($down['xhttpSettings'] ?? $down['splithttpSettings'] ?? []);
        $extra = array_key_exists('extra', $http) ? self::object($http['extra']) : $http;
        if (isset($extra['downloadSettings'])) {
            throw new InvalidArgumentException('nested downloadSettings is unsupported');
        }
        self::transport($extra); // Validate types even for options that cannot be overridden.
        // Mihomo only allows independent path/host/headers/XMUX for the downlink.
        foreach (array_keys(self::STRINGS + self::RANGES + self::BOOLS) as $key) {
            if (($extra[$key] ?? null) !== ($uplink[$key] ?? null)) {
                throw new InvalidArgumentException('independent download XHTTP options cannot be represented in Mihomo');
            }
        }
        $security = strtolower(self::string($down['security'] ?? 'none'));
        if (!in_array($security, ['', 'none', 'tls', 'reality'], true)) {
            throw new InvalidArgumentException('unsupported download security');
        }
        $tls = in_array($security, ['tls', 'reality'], true)
            ? self::object($down[$security === 'reality' ? 'realitySettings' : 'tlsSettings'] ?? []) : [];
        $allowedTls = $security === 'reality'
            ? ['serverName', 'fingerprint', 'publicKey', 'password', 'shortId', 'spiderX', 'show']
            : ['serverName', 'fingerprint', 'allowInsecure', 'alpn', 'echConfigList'];
        foreach ($tls as $key => $value) {
            if (!in_array($key, $allowedTls, true) && $value !== null && $value !== '' && $value !== [] && $value !== false) {
                throw new InvalidArgumentException('unsupported download TLS option');
            }
        }
        $opts = [
            'server' => trim($server, '[]'), 'port' => $port,
            'tls' => in_array($security, ['tls', 'reality'], true),
            'servername' => self::string($tls['serverName'] ?? ''),
            'client-fingerprint' => self::string($tls['fingerprint'] ?? ($security === 'reality' ? 'chrome' : '')),
            'skip-cert-verify' => $security === 'tls' && ($tls['allowInsecure'] ?? false) === true,
            // Xray defaults plain HTTP to 1.1; Mihomo otherwise defaults to h2c.
            'alpn' => in_array($security, ['', 'none'], true) ? ['http/1.1'] : self::alpn($tls['alpn'] ?? []),
            'path' => self::string($http['path'] ?? '/'), 'host' => self::string($http['host'] ?? ''),
            'headers' => self::headers($extra['headers'] ?? []),
            'reuse-settings' => self::reuse(self::object($extra['xmux'] ?? [])),
            // Explicit reset prevents an ordinary TLS/plain downlink inheriting Reality/ECH.
            'reality-opts' => ['public-key' => '', 'short-id' => ''],
            'ech-opts' => ['enable' => false],
        ];
        if ($security === 'reality') {
            $key = self::string(!empty($tls['password']) ? $tls['password'] : ($tls['publicKey'] ?? ''));
            $shortId = self::string($tls['shortId'] ?? '');
            $decoded = base64_decode(strtr($key, '-_', '+/'), true);
            if (!preg_match('/^[A-Za-z0-9_-]{43}$/D', $key) || $decoded === false || strlen($decoded) !== 32
                || !preg_match('/^(?:[a-fA-F0-9]{2}){0,8}$/D', $shortId)) {
                throw new InvalidArgumentException('invalid download Reality public key or short ID');
            }
            $opts['reality-opts'] = ['public-key' => $key, 'short-id' => $shortId];
        } elseif ($security === 'tls' && !empty($tls['echConfigList'])) {
            $opts['ech-opts'] = ['enable' => true, 'config' => Helper::toMihomoEchConfig(self::string($tls['echConfigList']))];
        }
        return $opts;
    }

    private static function headers(mixed $value): array|\stdClass
    {
        $headers = self::object($value);
        foreach ($headers as $key => $header) {
            if (!is_string($key) || strtolower($key) === 'host') {
                throw new InvalidArgumentException('XHTTP headers must use host instead of a Host header');
            }
            self::string($header);
        }
        // YAML {} is essential here: [] is a sequence, not a map[string]string.
        return $headers ?: new \stdClass();
    }

    private static function reuse(array $xmux): array
    {
        $opts = [];
        foreach (['maxConcurrency', 'maxConnections', 'cMaxReuseTimes', 'hMaxRequestTimes', 'hMaxReusableSecs'] as $key) {
            $target = strtolower(preg_replace('/([A-Z])/', '-$1', $key));
            $opts[$target] = self::range($xmux[$key] ?? 0);
        }
        $keepAlive = $xmux['hKeepAlivePeriod'] ?? 0;
        if (!is_int($keepAlive)) {
            throw new InvalidArgumentException('invalid XHTTP keepalive period');
        }
        $opts['h-keep-alive-period'] = $keepAlive;
        return $opts;
    }

    private static function range(mixed $value): string
    {
        if ((!is_string($value) && !is_int($value)) || !preg_match('/^\d+(?:-\d+)?$/D', (string) $value)) {
            throw new InvalidArgumentException('invalid XHTTP range');
        }
        return (string) $value;
    }

    private static function string(mixed $value): string
    {
        if (!is_string($value)) {
            throw new InvalidArgumentException('XHTTP string option has invalid type');
        }
        return $value;
    }

    private static function object(mixed $value): array
    {
        if (!is_array($value) || ($value !== [] && array_is_list($value))) {
            throw new InvalidArgumentException('XHTTP settings must be JSON objects');
        }
        return $value;
    }

    private static function alpn(mixed $value): array
    {
        if (!is_array($value) || !array_is_list($value)) {
            throw new InvalidArgumentException('download ALPN must be a list of strings');
        }
        foreach ($value as $protocol) {
            if (self::string($protocol) === '') {
                throw new InvalidArgumentException('download ALPN cannot contain empty strings');
            }
        }
        return $value;
    }
}
