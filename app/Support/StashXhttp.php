<?php

namespace App\Support;

use InvalidArgumentException;

/** Translate the panel's Xray schema to Stash's documented XHTTP subset. */
final class StashXhttp
{
    private const OPTIONS = [
        'path', 'host', 'mode', 'headers', 'x-padding-bytes', 'x-padding-placement',
        'x-padding-method', 'x-padding-key', 'x-padding-header', 'x-padding-obfs-mode',
        'no-grpc-header', 'sc-max-each-post-bytes', 'sc-min-posts-interval-ms',
    ];

    public static function convert(array $settings): array
    {
        // Share Xray input validation and independent download defaults, not Mihomo's
        // output schema. Stash has no documented XMUX/session-layout/ECH overrides.
        $converted = MihomoXhttp::convert($settings);
        $opts = self::options($converted);
        if (isset($converted['download-settings'])) {
            $down = $converted['download-settings'];
            if (!empty($down['ech-opts']['enable'])) {
                throw new InvalidArgumentException('Stash does not support XHTTP download ECH overrides');
            }
            $opts['download-settings'] = [
                'server' => $down['server'], 'port' => $down['port'],
                'path' => $down['path'], 'host' => $down['host'], 'headers' => $down['headers'],
                'tls' => $down['tls'], 'sni' => $down['servername'],
                'alpn' => $down['alpn'] ?: ['h2', 'http/1.1'],
                'skip-cert-verify' => $down['skip-cert-verify'],
                'server-cert-fingerprint' => '',
                'client-fingerprint' => $down['client-fingerprint'],
                'reality-opts' => $down['reality-opts'],
            ];
        }
        return $opts;
    }

    private static function options(array $converted): array
    {
        foreach ($converted as $key => $value) {
            if (!in_array($key, [...self::OPTIONS, 'download-settings', 'reuse-settings'], true)) {
                throw new InvalidArgumentException('XHTTP option cannot be represented in Stash');
            }
        }
        if (isset($converted['x-padding-placement'])
            && !in_array($converted['x-padding-placement'], ['cookie', 'header', 'query', 'queryInHeader'], true)) {
            throw new InvalidArgumentException('unsupported Stash XHTTP padding placement');
        }
        if (isset($converted['x-padding-method'])
            && !in_array($converted['x-padding-method'], ['repeat-x', 'tokenish'], true)) {
            throw new InvalidArgumentException('unsupported Stash XHTTP padding method');
        }
        // XMUX only tunes connection reuse. Stash uses its own connection pool;
        // never emit Mihomo's unsupported reuse-settings into a Stash subscription.
        return array_intersect_key($converted, array_flip(self::OPTIONS));
    }
}
