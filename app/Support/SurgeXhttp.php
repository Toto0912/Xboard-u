<?php

namespace App\Support;

use InvalidArgumentException;

/** Surge's documented XHTTP options, expressed in the panel's Xray schema. */
final class SurgeXhttp
{
    private const OPTIONS = [
        'path' => 'xhttp-path', 'host' => 'xhttp-host', 'mode' => 'xhttp-mode',
        'x-padding-bytes' => 'xhttp-padding-bytes', 'x-padding-obfs-mode' => 'xhttp-padding-obfs',
        'x-padding-key' => 'xhttp-padding-key', 'x-padding-header' => 'xhttp-padding-header',
        'x-padding-placement' => 'xhttp-padding-placement', 'x-padding-method' => 'xhttp-padding-method',
        'uplink-http-method' => 'xhttp-uplink-method', 'session-placement' => 'xhttp-session-placement',
        'session-key' => 'xhttp-session-key', 'session-table' => 'xhttp-session-table',
        'session-length' => 'xhttp-session-length', 'seq-placement' => 'xhttp-seq-placement',
        'seq-key' => 'xhttp-seq-key', 'uplink-data-placement' => 'xhttp-uplink-data-placement',
        'uplink-data-key' => 'xhttp-uplink-data-key', 'uplink-chunk-size' => 'xhttp-uplink-chunk-size',
        'no-grpc-header' => 'xhttp-no-grpc-header', 'sc-max-each-post-bytes' => 'xhttp-max-each-post-bytes',
        'sc-min-posts-interval-ms' => 'xhttp-min-posts-interval',
    ];

    private const XMUX = [
        'maxConcurrency' => ['max-concurrency', 'xhttp-xmux-max-concurrency'],
        'maxConnections' => ['max-connections', 'xhttp-xmux-max-connections'],
        'cMaxReuseTimes' => ['c-max-reuse-times', 'xhttp-xmux-max-reuse-times'],
        'hMaxRequestTimes' => ['h-max-request-times', 'xhttp-xmux-max-request-times'],
        'hMaxReusableSecs' => ['h-max-reusable-secs', 'xhttp-xmux-max-reusable-secs'],
        'hKeepAlivePeriod' => ['h-keep-alive-period', 'xhttp-xmux-keep-alive'],
    ];

    public static function convert(array $settings): array
    {
        $extra = $settings['extra'] ?? [];
        if (!is_array($extra) || ($extra !== [] && array_is_list($extra))) {
            throw new InvalidArgumentException('XHTTP extra must be an object');
        }
        // Surge has no separate downlink. Export the original endpoint for both
        // directions, even when the panel has an independent download draft.
        unset($extra['downloadSettings']);
        $settings['extra'] = $extra;
        $converted = MihomoXhttp::convert($settings);
        $options = ['xhttp' => true];
        foreach (self::OPTIONS as $source => $target) {
            if (array_key_exists($source, $converted)) {
                $options[$target] = $converted[$source];
            }
        }
        if (isset($converted['headers'])) {
            $options['xhttp-headers'] = (array) $converted['headers'];
        }
        if (isset($converted['reuse-settings'])) {
            // Only explicit XMUX fields override Surge's own defaults.
            foreach (self::XMUX as $xrayKey => [$source, $target]) {
                if (array_key_exists($xrayKey, $extra['xmux'] ?? [])) {
                    $options[$target] = $converted['reuse-settings'][$source];
                }
            }
        }
        return $options;
    }
}
