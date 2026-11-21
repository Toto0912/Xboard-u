<?php

namespace App\Services;

use App\Models\Server;
use Illuminate\Support\Facades\Redis;

final class ServerTrafficActivity
{
    private const WINDOW_SECONDS = 600;

    private const RECORD = <<<'LUA'
        local key = KEYS[1]
        local receivedAt = tonumber(ARGV[1])
        local window = tonumber(ARGV[2])
        redis.call('ZREMRANGEBYSCORE', key, '-inf', receivedAt - window)
        for i = 3, #ARGV do
            local member = ARGV[i]
            local previous = redis.call('ZSCORE', key, member)
            if not previous or tonumber(previous) < receivedAt then
                redis.call('ZADD', key, receivedAt, member)
            end
        end
        return redis.call('EXPIRE', key, window)
        LUA;

    public static function key(string $type, int $serverId): string
    {
        return "server_traffic_activity:{$type}:{$serverId}";
    }

    public static function record(Server $server, array $traffic): void
    {
        $receivedAt = now()->timestamp;
        $users = [];
        foreach ($traffic as $userId => $delta) {
            if (!is_array($delta) || filter_var($userId, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]) === false) {
                continue;
            }
            $upload = $delta[0] ?? null;
            $download = $delta[1] ?? null;
            if (is_numeric($upload) && is_numeric($download)
                && $upload >= 0 && $download >= 0 && ($upload > 0 || $download > 0)) {
                $users[] = (string) $userId;
            }
        }

        if ($users === []) {
            return;
        }

        // Update and expire the snapshot together, without moving a newer observation back in time.
        Redis::eval(self::RECORD, 1, self::key($server->type, $server->id),
            $receivedAt, self::WINDOW_SECONDS, ...$users);
    }

    /**
     * @param list<string> $keys
     * @return array<string, int>
     */
    public static function counts(array $keys): array
    {
        if ($keys === []) {
            return [];
        }

        $now = now()->timestamp;
        $cutoff = '(' . ($now - self::WINDOW_SECONDS);
        $counts = Redis::pipeline(function ($pipe) use ($keys, $cutoff, $now) {
            foreach ($keys as $key) {
                $pipe->zcount($key, $cutoff, $now);
            }
        });

        return array_combine($keys, array_map('intval', $counts));
    }
}
