<?php

namespace App\Support;

use App\Models\User;

final class NaiveSubscription
{
    public static function from(array|User $user, array $server): ?array
    {
        $settings = $server['protocol_settings'] ?? [];
        $id = (string) ($user['id'] ?? '');
        $password = $user['uuid'] ?? '';
        $host = trim($server['host'] ?? '');
        $port = filter_var($server['port'] ?? null, FILTER_VALIDATE_INT, [
            'options' => ['min_range' => 1, 'max_range' => 65535],
        ]);
        if ((int) ($settings['tls'] ?? 0) !== 1 || data_get($settings, 'tls_settings.allow_insecure')
            || !ctype_digit($id) || (int) $id < 1 || $password === '' || $host === '' || $port === false) {
            return null;
        }

        if (str_starts_with($host, '[') && str_ends_with($host, ']')
            && filter_var(substr($host, 1, -1), FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
            $host = substr($host, 1, -1);
        }
        if (!filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) && strpbrk($host, " \t\r\n:/@?#[]\\") !== false) {
            return null;
        }
        $tls = ['enabled' => true];
        $serverName = trim(data_get($settings, 'tls_settings.server_name') ?? '');
        if ($serverName !== '') {
            $tls['server_name'] = $serverName;
        }
        return [
            'server' => $host,
            'server_port' => $port,
            'username' => $id,
            'password' => $password,
            'tls' => $tls,
        ];
    }
}
