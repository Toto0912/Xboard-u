<?php

namespace App\WebSocket;

use App\Models\Server;
use App\Services\DeviceStateService;
use App\Services\NodeRegistry;
use App\Services\Plugin\HookManager;
use App\Services\ServerService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Redis;
use Workerman\Connection\TcpConnection;

class NodeEventHandlers
{
    /**
     * Handle pong heartbeat
     */
    public static function handlePong(TcpConnection $conn, int $nodeId, array $data = []): void
    {
        Cache::put("node_ws_alive:{$nodeId}", $conn->wsOwner, NodeWorker::CONNECTION_TTL);
    }

    /**
     * Handle node status update
     */
    public static function handleNodeStatus(TcpConnection $conn, int $nodeId, array $data): void
    {
        $node = Server::find($nodeId);
        if (!$node) return;

        $nodeType = strtoupper($node->type);
        Cache::put(\App\Utils\CacheKey::get('SERVER_' . $nodeType . '_LAST_CHECK_AT', $nodeId), time(), 3600);
        ServerService::updateMetrics($node, $data);

        Log::debug("[WS] Node#{$nodeId} status updated");
    }

    /**
     * Handle device report from node
     * 
     * 数据格式: {"event": "report.devices", "data": {userId: [ip1, ip2, ...], ...}}
     */
    public static function handleDeviceReport(TcpConnection $conn, int $nodeId, array $data): void
    {
        $service = app(DeviceStateService::class);

        if (isset($data['devices']) && is_array($data['devices'])) {
            $data = $data['devices'];
        }

        $affected = $service->replaceNodeDevices($nodeId, $data);
        Redis::sadd('device:push_pending_nodes', $nodeId);
        Log::debug("[WS] Node#{$nodeId} synced devices", ['affected_users' => count($affected)]);
    }

    /**
     * Handle device state request from node
     */
    public static function handleDeviceRequest(TcpConnection $conn, int $nodeId, array $data = []): void
    {
        self::pushDeviceStateToNode($nodeId, app(DeviceStateService::class));
    }

    /**
     * Push device state to node
     */
    public static function pushDeviceStateToNode(int $nodeId, DeviceStateService $service): void
    {
        self::pushDeviceStateToNodes([$nodeId], $service);
    }

    public static function pushDeviceStateToNodes(array $nodeIds, DeviceStateService $service, ?callable $publish = null): void
    {
        $onlineIds = $publish ? $nodeIds : array_filter($nodeIds, static fn ($id) => NodeRegistry::get((int) $id) !== null);
        if (!$onlineIds) return;

        $nodes = Server::query()->useWritePdo()->findMany($onlineIds);
        $hasUserHook = HookManager::hasHook('server.users.get');
        $batches = $nodes->groupBy(static function (Server $node) use ($hasUserHook) {
            // A user-list filter receives the node and can narrow its authorization.
            if ($hasUserHook) return $node->id;
            $groups = $node->group_ids ?? [];
            sort($groups, SORT_STRING);
            return serialize($groups);
        });
        foreach ($batches as $batch) {
            $userIds = ServerService::getAvailableUsers($batch->first())->pluck('id')->all();
            $devices = $service->getUsersDevices($userIds);
            foreach ($batch as $node) {
                if ($publish) {
                    $publish($node->id, $devices);
                } else {
                    NodeRegistry::send($node->id, 'sync.devices', ['users' => $devices]);
                }
                Log::debug("[WS] Pushed device state to node#{$node->id}: " . count($devices) . " users");
            }
        }
    }

    /**
     * Push full config + users to newly connected node
     */
    public static function pushFullSync(TcpConnection $conn, Server $node): void
    {
        $nodeId = (int) $node->id;

        // Push config
        $config = ServerService::buildNodeConfig($node);
        NodeRegistry::send($nodeId, 'sync.config', [
            'config' => $config,
        ]);

        // Push users
        $users = ServerService::getAvailableUsers($node)->toArray();
        NodeRegistry::send($nodeId, 'sync.users', [
            'users' => $users,
        ]);

        Log::info("[WS] Full sync pushed to node#{$nodeId}", [
            'users' => count($users),
        ]);
    }
}
