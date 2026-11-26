<?php

namespace App\Services;

use App\Jobs\RefreshNodeUsersJob;
use App\Models\Server;
use App\Models\ServerMachine;
use App\Models\User;
use App\Services\Plugin\HookManager;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Redis;

class NodeSyncService
{
    public const MACHINE_AUTH_CHANGED = 'machine.auth.changed';

    public static function notifyMachineCredentialsChanged(int $machineId): void
    {
        DB::afterCommit(fn () => self::pushMachine($machineId, self::MACHINE_AUTH_CHANGED, []));
    }

    /**
     * Check if node has active WS connection
     */
    public static function isNodeOnline(int $nodeId): bool
    {
        $nodeKey = "node_ws_alive:{$nodeId}";
        $workerKey = \App\WebSocket\NodeWorker::HEARTBEAT_CACHE_KEY;
        $state = Cache::many([$workerKey, $nodeKey]);
        return !empty($state[$workerKey]) && !empty($state[$nodeKey]);
    }

    /**
     * Push node config update
     */
    public static function notifyConfigUpdated(int $nodeId): void
    {
        if (!self::isNodeOnline($nodeId))
            return;

        $node = Server::query()->useWritePdo()->find($nodeId);
        if (!$node)
            return;

        self::push($nodeId, 'sync.config', ['config' => ServerService::buildNodeConfig($node)]);
    }

    /**
     * Push all users to all nodes in the group
     */
    public static function notifyUsersUpdatedByGroup(int $groupId, bool $retryOnFailure = false): int
    {
        $servers = Server::whereInGroup($groupId)->useWritePdo()->get();

        $notified = 0;
        foreach ($servers as $server) {
            if (self::pushNodeUsers($server, $retryOnFailure)) $notified++;
        }
        return $notified;
    }

    public static function queueRosterRefreshes(array $groupIds): void
    {
        $queued = [];
        foreach ($groupIds as $groupId) {
            foreach (Server::whereInGroup($groupId)->useWritePdo()->pluck('id') as $nodeId) {
                if (!isset($queued[$nodeId])) {
                    $queued[$nodeId] = true;
                    RefreshNodeUsersJob::dispatch((int) $nodeId);
                }
            }
        }
    }

    public static function pushNodeUsers(Server $server, bool $retryOnFailure = false): bool
    {
        if (!self::isNodeOnline($server->id)) return false;
        self::push($server->id, 'sync.users', ['users' => ServerService::getAvailableUsers($server)->all()], $retryOnFailure);
        return true;
    }

    /**
     * Push user changes (add/remove) to affected nodes
     */
    public static function notifyUserChanged(User $user): void
    {
        if (!$user->group_id)
            return;

        // Filters receive the entire roster and can make different decisions for each node.
        if (HookManager::hasHook('server.users.get')) {
            self::notifyUsersUpdatedByGroup($user->group_id);
            return;
        }

        $servers = Server::whereInGroup($user->group_id)->useWritePdo()->get();
        foreach ($servers as $server) {
            if (!self::isNodeOnline($server->id))
                continue;

            if ($user->isAvailable()) {
                self::push($server->id, 'sync.user.delta', [
                    'action' => 'add',
                    'users' => [
                        [
                            'id' => $user->id,
                            'uuid' => $user->uuid,
                            'speed_limit' => $user->speed_limit,
                            'device_limit' => $user->device_limit,
                        ]
                    ],
                ]);
            } else {
                self::push($server->id, 'sync.user.delta', [
                    'action' => 'remove',
                    'users' => [['id' => $user->id]],
                ]);
            }
        }
    }

    /**
     * Push removal for multiple users from a specific group's online nodes.
     */
    public static function notifyUsersRemovedFromGroup(array $userIds, int $groupId, bool $retryOnFailure = false): int
    {
        $normalizedIds = array_values(array_unique(array_filter(
            array_map('intval', $userIds),
            fn (int $id): bool => $id > 0
        )));
        if ($normalizedIds === [] || $groupId <= 0) {
            return 0;
        }
        if (HookManager::hasHook('server.users.get')) {
            return self::notifyUsersUpdatedByGroup($groupId, $retryOnFailure);
        }

        $servers = Server::whereInGroup($groupId)->useWritePdo()->get();
        $notifiedNodes = 0;

        foreach ($servers as $server) {
            if (!self::isNodeOnline($server->id)) {
                continue;
            }

            foreach (array_chunk($normalizedIds, 500) as $chunk) {
                self::push($server->id, 'sync.user.delta', [
                    'action' => 'remove',
                    'users' => array_map(fn (int $id): array => ['id' => $id], $chunk),
                ], $retryOnFailure);
            }
            $notifiedNodes++;
        }

        return $notifiedNodes;
    }

    /**
     * Push user removal from a specific group's nodes
     */
    public static function notifyUserRemovedFromGroup(int $userId, int $groupId): void
    {
        self::notifyUsersRemovedFromGroup([$userId], $groupId);
    }

    /**
     * Full sync: push config + users to a node
     */
    public static function notifyFullSync(int $nodeId): void
    {
        if (!self::isNodeOnline($nodeId))
            return;

        $node = Server::query()->useWritePdo()->find($nodeId);
        if (!$node)
            return;

        self::push($nodeId, 'sync.config', ['config' => ServerService::buildNodeConfig($node)]);

        $users = ServerService::getAvailableUsers($node)->toArray();
        self::push($nodeId, 'sync.users', ['users' => $users]);
    }

    /**
     * Notify machine that its node set has changed.
     * Always publishes via Redis so the WS process can update its in-memory registry.
     */
    public static function notifyMachineNodesChanged(int $machineId): void
    {
        $machine = ServerMachine::query()->useWritePdo()->find($machineId);

        $nodeList = [];
        if ($machine) {
            $nodes = ServerService::getMachineNodes($machine);
            $nodeList = $nodes->map(fn($n) => [
                'id' => $n->id,
                'type' => $n->type,
                'name' => $n->name,
            ])->values()->toArray();
        }

        // Always publish via Redis so the WS process can update its in-memory registry
        self::pushMachine($machineId, 'sync.nodes', ['nodes' => $nodeList]);
    }

    /**
     * Publish a push command to Redis — picked up by the Workerman WS server
     */
    public static function push(int $nodeId, string $event, array $data, bool $retryOnFailure = false): void
    {
        try {
            $result = Redis::publish('node:push', json_encode([
                'node_id' => $nodeId,
                'event' => $event,
                'data' => $data,
            ], JSON_THROW_ON_ERROR));
            if ($result === false) throw new \RuntimeException('Redis did not accept the notification');
        } catch (\Throwable $e) {
            if ($retryOnFailure) throw $e;
            Log::warning("[NodePush] Redis publish failed: {$e->getMessage()}", [
                'node_id' => $nodeId,
                'event' => $event,
            ]);
        }
    }

    /**
     * Publish a machine-level push command to Redis — picked up by the Workerman WS server
     */
    public static function pushMachine(int $machineId, string $event, array $data): void
    {
        try {
            Redis::publish('node:push', json_encode([
                'machine_id' => $machineId,
                'event' => $event,
                'data' => $data,
            ]));
        } catch (\Throwable $e) {
            Log::warning("[NodePush] Redis machine publish failed: {$e->getMessage()}", [
                'machine_id' => $machineId,
                'event' => $event,
            ]);
        }
    }
}
