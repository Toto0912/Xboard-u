<?php

namespace App\Support;

use Illuminate\Validation\Validator;

final class Hysteria2PortHopping
{
    public static function isHy2(array $connection, ?string $type): bool
    {
        return $type === 'hysteria' && (int) (data_get($connection, 'protocol_settings.version') ?? 2) === 2;
    }

    /** Parse before casting so invalid input and overflowing integers are never truncated. */
    public static function range(mixed $value, int $minimum = 1, int $maximum = 65535): ?array
    {
        if (!is_string($value) && !is_int($value)) {
            return null;
        }
        $value = trim((string) $value);
        if (!preg_match('/^(\d{1,10})(?:-(\d{1,10}))?$/D', $value, $match)) {
            return null;
        }
        $first = (int) $match[1];
        $last = (int) ($match[2] ?? $match[1]);
        return $first >= $minimum && $last <= $maximum && $first <= $last ? [$first, $last] : null;
    }

    public static function text(array $range): string
    {
        return $range[0] === $range[1] ? (string) $range[0] : implode('-', $range);
    }

    public static function validate(Validator $validator, array $data): void
    {
        if (!is_string($data['type'] ?? null)) {
            return;
        }
        foreach (['' => $data, 'cdn_settings.server.' => data_get($data, 'cdn_settings.server')] as $prefix => $connection) {
            if (!is_array($connection) || !self::isHy2($connection, $data['type'] ?? null)) {
                continue;
            }
            foreach (['port', 'server_port'] as $field) {
                if (!self::range($connection[$field] ?? null)) {
                    $validator->errors()->add($prefix.$field, __('hy2.port_range'));
                }
            }
            $extra = data_get($connection, 'protocol_settings.hy2_settings.port_range');
            $actual = self::range($connection['server_port'] ?? null);
            if ($extra !== null && $extra !== '') {
                $range = self::range($extra);
                if (!$range || !$actual || $range[0] !== $actual[0]
                    || ($actual[0] !== $actual[1] && $range !== $actual)) {
                    $validator->errors()->add($prefix.'protocol_settings.hy2_settings.port_range', __('hy2.port_mismatch'));
                }
            }
            $interval = data_get($connection, 'protocol_settings.hop_interval');
            $maximum = data_get($connection, 'protocol_settings.hop_interval_max');
            $range = ($interval === null || $interval === '') ? [30, 30] : self::range($interval, 5, 2147483647);
            if (!$range || (($interval === null || $interval === '') && $maximum !== null && $maximum !== '') ||
                ($maximum !== null && $maximum !== '' &&
                (!is_numeric($maximum) || !preg_match('/^\d{1,10}$/D', (string) $maximum)
                || $maximum < $range[0] || $maximum > 2147483647
                || ($range[0] !== $range[1] && (int) $maximum !== $range[1])))) {
                $validator->errors()->add($prefix.'protocol_settings.hop_interval', __('hy2.interval'));
            }
        }
    }

    /** Called only after validation. The database and node wire port stay integers. */
    public static function normalize(array $data): array
    {
        if (self::isHy2($data, $data['type'] ?? null)) {
            $data = self::normalizeConnection($data);
        }
        if (is_array(data_get($data, 'cdn_settings.server')) &&
            self::isHy2($data['cdn_settings']['server'], $data['type'] ?? null)) {
            $data['cdn_settings']['server'] = self::normalizeConnection($data['cdn_settings']['server']);
        }
        return $data;
    }

    private static function normalizeConnection(array $connection): array
    {
        $settings = $connection['protocol_settings'] ?? [];
        $port = self::range($connection['server_port']);
        $explicit = $settings['hy2_settings']['port_range'] ?? null;
        // A scalar submitted with no extension explicitly disables automatic rules.
        $range = $explicit ? self::range($explicit) : $port;
        $connection['port'] = self::text(self::range($connection['port']));
        $connection['server_port'] = $port[0];
        if ($range[0] !== $range[1]) {
            $settings['hy2_settings']['port_range'] = self::text($range);
        } else {
            unset($settings['hy2_settings']['port_range']);
        }
        $value = $settings['hop_interval'] ?? null;
        if ($value === null || $value === '') {
            $settings['hop_interval'] = null;
            $settings['hop_interval_max'] = null;
        } else {
            [$min, $max] = self::range($value, 5, 2147483647);
            $max = $settings['hop_interval_max'] ?? $max;
            $settings['hop_interval'] = $min;
            $settings['hop_interval_max'] = (int) $max > $min ? (int) $max : null;
        }
        $connection['protocol_settings'] = $settings;
        return $connection;
    }

    public static function interval(array $settings, bool $random = false): int|string
    {
        $min = (int) ($settings['hop_interval'] ?? 30);
        $max = (int) ($settings['hop_interval_max'] ?? $min);
        return $random && $max > $min ? "$min-$max" : $min;
    }

    public static function serverPort(array $connection): int|string
    {
        return data_get($connection, 'protocol_settings.hy2_settings.port_range') ?: $connection['server_port'];
    }

    public static function client(array $server): array
    {
        if (self::isHy2($server, $server['type'] ?? null)) {
            $range = self::range($server['ports'] ?? $server['port'] ?? null);
            if ($range) {
                $server['port'] = $range[0];
                if ($range[0] !== $range[1]) {
                    $server['ports'] = self::text($range);
                } else {
                    unset($server['ports']);
                }
            }
        }
        return $server;
    }
}
