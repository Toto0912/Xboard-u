<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;

class DeviceStateService
{
    private const PREFIX = 'user_devices:';
    private const TTL = 300;
    private const DB_THROTTLE = 10;

    public function setDevices(int $userId, int $nodeId, array $ips): void
    {
        $this->writeSnapshot($nodeId, [$userId => $ips], false);
    }

    /** Legacy HTTP alive reports update only users present in the report. */
    public function setNodeDevices(int $nodeId, array $devices): void
    {
        $this->writeSnapshot($nodeId, $devices, false);
    }

    /** Complete v2/WS snapshot: absent users are removed from this node. */
    public function replaceNodeDevices(int $nodeId, array $devices): array
    {
        return $this->writeSnapshot($nodeId, $devices, true);
    }

    public function clearAllNodeDevices(int $nodeId): array
    {
        return $this->replaceNodeDevices($nodeId, []);
    }

    public function removeNodeDevices(int $nodeId, int $userId): void
    {
        $this->setDevices($userId, $nodeId, []);
    }

    private function indexKey(int $id): string { return "node_devices:{$id}"; }
    private function readyKey(int $id): string { return "node_devices:indexed:{$id}"; }
    private function pendingKey(int $id): string { return "node_devices:pending:{$id}"; }

    private function writeSnapshot(int $nodeId, array $devices, bool $complete): array
    {
        $this->ensureNodeIndex($nodeId);
        $normalized = [];
        foreach ($devices as $userId => $ips) {
            if (!ctype_digit((string) $userId) || (int) $userId <= 0 || !is_array($ips)) continue;
            $normalized[(int) $userId] = array_values(array_unique(array_map(
                [self::class, 'normalizeIP'], array_filter($ips, 'is_string')
            )));
        }
        $result = Redis::eval($this->script('device-snapshot'), 3,
            $this->indexKey($nodeId), $this->pendingKey($nodeId), 'node_devices:revision',
            config('database.redis.options.prefix', '') . self::PREFIX,
            (string) $nodeId, time(), self::TTL, $complete ? 'full' : 'partial',
            json_encode((object) $normalized, JSON_THROW_ON_ERROR));
        $affected = json_decode($result, true, 512, JSON_THROW_ON_ERROR);
        $pending = $affected['pending'];
        // Retry failed SQL writes. An old request may acknowledge only its own
        // revision, never a newer overlapping report from the same node.
        $this->persistCounts(array_map('intval', array_keys($pending)));
        if ($pending !== []) {
            Redis::eval($this->script('device-ack'), 1, $this->pendingKey($nodeId),
                json_encode((object) $pending, JSON_THROW_ON_ERROR));
        }
        return array_map('intval', $affected['users']);
    }

    /** Reads only users indexed under this node, not every user in Redis. */
    public function getNodeDevices(int $nodeId): array
    {
        $this->ensureNodeIndex($nodeId);
        $ids = Redis::zrangebyscore($this->indexKey($nodeId), time() - self::TTL, '+inf');
        $result = [];
        $prefix = "{$nodeId}:";
        $cutoff = time() - self::TTL;
        foreach ($this->readUserHashes($ids) as $uid => $fields) {
            foreach ($fields as $field => $timestamp) {
                if ((int) $timestamp >= $cutoff && str_starts_with($field, $prefix)) {
                    $result[$uid][] = substr($field, strlen($prefix));
                }
            }
        }
        return $result;
    }

    /** Import pre-index state once per node, using non-blocking SCAN. */
    private function ensureNodeIndex(int $nodeId): void
    {
        if (Redis::exists($this->readyKey($nodeId))) return;
        $redisPrefix = config('database.redis.options.prefix', '');
        $cursor = null;
        $members = [];
        $cutoff = time() - self::TTL;
        do {
            $page = Redis::scan($cursor, ['match' => $redisPrefix . self::PREFIX . '*', 'count' => 500]);
            if ($page === false) break;
            [$cursor, $keys] = $page;
            $ids = [];
            foreach ($keys as $key) {
                $uid = substr($key, strlen($redisPrefix . self::PREFIX));
                if (ctype_digit($uid) && (int) $uid > 0) $ids[] = (int) $uid;
            }
            foreach ($this->readUserHashes($ids) as $uid => $fields) {
                foreach ($fields as $field => $timestamp) {
                    if ((int) $timestamp >= $cutoff && str_starts_with($field, "{$nodeId}:")) {
                        $members[$uid] = max($members[$uid] ?? 0, (int) $timestamp);
                    }
                }
            }
        } while ($cursor !== 0);
        Redis::eval($this->script('device-index'), 2, $this->indexKey($nodeId),
            $this->readyKey($nodeId), self::TTL, json_encode((object) $members, JSON_THROW_ON_ERROR));
    }

    private function readUserHashes(array $ids): array
    {
        $result = [];
        foreach (array_chunk(array_values(array_unique(array_map('intval', $ids))), 500) as $chunk) {
            $values = Redis::pipeline(function ($pipe) use ($chunk) {
                foreach ($chunk as $uid) $pipe->hgetall(self::PREFIX . $uid);
            });
            foreach ($chunk as $i => $uid) $result[$uid] = $values[$i];
        }
        return $result;
    }

    public function getUsersDevices(array $userIds): array
    {
        $result = [];
        $cutoff = time() - self::TTL;
        foreach ($this->readUserHashes($userIds) as $uid => $fields) {
            $ips = [];
            foreach ($fields as $field => $timestamp) {
                if ((int) $timestamp >= $cutoff) $ips[] = substr($field, strpos($field, ':') + 1);
            }
            if ($ips !== []) $result[$uid] = array_values(array_unique($ips));
        }
        return $result;
    }

    public function getDeviceCount(int $userId): int
    {
        return count($this->getUsersDevices([$userId])[$userId] ?? []);
    }

    public function getAliveList(Collection $users): array
    {
        return array_map('count', $this->getUsersDevices($users->pluck('id')->all()));
    }

    public function notifyUpdate(int $userId): void { $this->persistCounts([$userId]); }

    private function persistCounts(array $ids): void
    {
        sort($ids, SORT_NUMERIC);
        foreach (array_chunk($ids, 400) as $chunk) {
            DB::transaction(function () use ($chunk) {
                // Row locks order concurrent writers. Read Redis only after
                // acquiring them, so a delayed report cannot commit old counts.
                $existing = User::whereIn('id', $chunk)->orderBy('id')->lockForUpdate()->pluck('id')->all();
                if ($existing === []) return;
                $devices = $this->getUsersDevices($existing);
                $case = 'CASE id';
                foreach ($existing as $uid) $case .= ' WHEN ' . (int) $uid . ' THEN ' . count($devices[$uid] ?? []);
                $case .= ' ELSE online_count END';
                User::whereIn('id', $existing)->where(function ($query) use ($case) {
                    $query->whereRaw("COALESCE(online_count, -1) <> ({$case})")
                        ->orWhereNull('last_online_at')
                        ->orWhere('last_online_at', '<=', now()->subSeconds(self::DB_THROTTLE));
                })->update(['online_count' => DB::raw($case), 'last_online_at' => now()]);
            }, 3);
        }
    }

    private function script(string $name): string
    {
        static $scripts = [];
        return $scripts[$name] ??= file_get_contents(resource_path("lua/{$name}.lua"));
    }

    private static function normalizeIP(string $ip): string
    {
        if (preg_match('/^\[(.+)\]:\d+$/', $ip, $m)) return $m[1];
        if (preg_match('/^(\d+\.\d+\.\d+\.\d+):\d+$/', $ip, $m)) return $m[1];
        return $ip;
    }
}
