<?php

namespace App\WebSocket;

use App\Models\Server;
use App\Models\ServerMachine;
use App\Services\DeviceStateService;
use App\Services\NodeRegistry;
use App\Services\NodeSyncService;
use App\Services\ServerService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Redis;
use Workerman\Connection\TcpConnection;
use Workerman\Timer;
use Workerman\Worker;

class NodeWorker
{
    private const AUTH_TIMEOUT = 10;
    private const PING_INTERVAL = 55;
    public const CONNECTION_TTL = 3 * self::PING_INTERVAL;

    public const HEARTBEAT_CACHE_KEY = 'ws_server:heartbeat';
    private const HEARTBEAT_INTERVAL = 10;
    private const HEARTBEAT_TTL = 30;

    private Worker $worker;
    private array $pendingDevicePushes = [];

    private array $handlers = [
        'pong' => [NodeEventHandlers::class, 'handlePong'],
        'node.status' => [NodeEventHandlers::class, 'handleNodeStatus'],
        'report.devices' => [NodeEventHandlers::class, 'handleDeviceReport'],
        'request.devices' => [NodeEventHandlers::class, 'handleDeviceRequest'],
    ];

    public function __construct(string $host, int $port)
    {
        $this->worker = new Worker("websocket://{$host}:{$port}");
        $this->worker->count = 1;
        $this->worker->name = 'xboard-ws-server';
    }

    public function run(): void
    {
        $this->setupLogging();
        $this->setupCallbacks();
        Worker::runAll();
    }

    private function setupLogging(): void
    {
        $logPath = storage_path('logs');
        if (!is_dir($logPath)) {
            mkdir($logPath, 0777, true);
        }
        Worker::$logFile = $logPath . '/xboard-ws-server.log';
        Worker::$pidFile = $logPath . '/xboard-ws-server.pid';
    }

    private function setupCallbacks(): void
    {
        $this->worker->onWorkerStart = [$this, 'onWorkerStart'];
        $this->worker->onConnect = [$this, 'onConnect'];
        $this->worker->onWebSocketConnect = [$this, 'onWebSocketConnect'];
        $this->worker->onMessage = [$this, 'onMessage'];
        $this->worker->onClose = [$this, 'onClose'];
    }

    public function onWorkerStart(Worker $worker): void
    {
        Log::info("[WS] Worker started, pid={$worker->id}");
        $this->subscribeRedis();
        $this->setupTimers();
    }

    private function setupTimers(): void
    {
        Cache::put(self::HEARTBEAT_CACHE_KEY, time(), self::HEARTBEAT_TTL);
        $this->schedule(self::HEARTBEAT_INTERVAL, function () {
            Cache::put(self::HEARTBEAT_CACHE_KEY, time(), self::HEARTBEAT_TTL);
        });

        $this->schedule(self::PING_INTERVAL, function () {
            $this->revalidateMachineSessions();
            $seen = [];

            foreach (NodeRegistry::getConnectedNodeIds() as $nodeId) {
                $conn = NodeRegistry::get($nodeId);
                if ($conn) {
                    $oid = spl_object_id($conn);
                    if (!isset($seen[$oid])) {
                        $seen[$oid] = true;
                        $this->ping($conn);
                    }
                }
            }

            foreach (NodeRegistry::getConnectedMachineIds() as $machineId) {
                $conn = NodeRegistry::getMachine($machineId);
                if ($conn) {
                    $oid = spl_object_id($conn);
                    if (!isset($seen[$oid])) {
                        $seen[$oid] = true;
                        $this->ping($conn);
                    }
                }
            }
        });

        $this->schedule(10, fn () => $this->publishPendingDeviceStates());
    }

    private function publishPendingDeviceStates(): void
    {
        if (!$this->pendingDevicePushes) {
            $ids = Redis::spop('device:push_pending_nodes', 100);
            $this->pendingDevicePushes = array_fill_keys($ids ?: [], true);
        }
        if (!$this->pendingDevicePushes) return;

        try {
            NodeEventHandlers::pushDeviceStateToNodes(array_keys($this->pendingDevicePushes), app(DeviceStateService::class),
                function (int $id, array $users) {
                    NodeSyncService::push($id, 'sync.devices', ['users' => $users], true);
                    unset($this->pendingDevicePushes[$id]);
                });
            $this->pendingDevicePushes = []; // Deleted nodes do not need delivery.
        } catch (\Throwable $error) {
            Log::warning('[WS] Device push deferred', ['exception' => $error::class]);
            // Keep unsent IDs until a later tick if Redis is unavailable during requeue.
            if ($this->pendingDevicePushes) {
                if (Redis::sadd('device:push_pending_nodes', ...array_keys($this->pendingDevicePushes)) !== false) {
                    $this->pendingDevicePushes = [];
                }
            }
        }
    }

    private function schedule(int $interval, callable $task): void
    {
        Timer::add($interval, static function () use ($task) {
            try {
                $task();
            } catch (\Exception $error) {
                Log::warning('[WS] Periodic task deferred', ['exception' => $error::class]);
            }
        });
    }

    private function ping(TcpConnection $conn): void
    {
        if (time() - ($conn->lastPongAt ?? 0) >= self::CONNECTION_TTL) {
            $conn->close();
        } else {
            $conn->send(json_encode(['event' => 'ping']));
        }
    }

    public function onConnect(TcpConnection $conn): void
    {
        $conn->authTimer = Timer::add(self::AUTH_TIMEOUT, function () use ($conn) {
            if (empty($conn->nodeId) && empty($conn->machineNodeIds)) {
                $conn->close(json_encode([
                    'event' => 'error',
                    'data' => ['message' => 'auth timeout'],
                ]));
            }
        }, [], false);
    }

    public function onWebSocketConnect(TcpConnection $conn, $httpMessage): void
    {
        $conn->lastPongAt = time();
        $conn->wsOwner = bin2hex(random_bytes(16));
        $queryString = '';
        if (is_string($httpMessage)) {
            $queryString = parse_url($httpMessage, PHP_URL_QUERY) ?? '';
        } elseif ($httpMessage instanceof \Workerman\Protocols\Http\Request) {
            $queryString = $httpMessage->queryString();
        }

        parse_str($queryString, $params);

        if (isset($conn->authTimer)) {
            Timer::del($conn->authTimer);
        }

        try {
            if (!empty($params['machine_id'])) {
                $this->authenticateMachine($conn, $params);
            } else {
                $this->authenticateNode($conn, $params);
            }
        } catch (\Throwable $error) {
            Log::warning('[WS] Initial node sync failed', ['exception' => $error::class]);
            $conn->close(json_encode(['event' => 'error', 'data' => ['message' => 'initial sync unavailable']]));
        }
    }

    /**
     * 旧模式：单节点认证
     */
    private function authenticateNode(TcpConnection $conn, array $params): void
    {
        $token = $params['token'] ?? '';
        $identifier = $params['node_id'] ?? null;

        if (!\App\Support\Setting::matchesNodeToken($token, fresh: true)) {
            $conn->close(json_encode([
                'event' => 'error',
                'data' => ['message' => 'invalid token'],
            ]));
            return;
        }

        $node = ServerService::getServer($identifier, null);
        if (!$node) {
            $conn->close(json_encode([
                'event' => 'error',
                'data' => ['message' => 'node not found'],
            ]));
            return;
        }

        $nodeId = (int) $node->getKey();
        $conn->nodeId = $nodeId;
        NodeRegistry::add($nodeId, $conn);
        $this->claimNode($conn, $nodeId);

        Log::debug("[WS] Node#{$nodeId} connected", [
            'remote' => $conn->getRemoteIp(),
            'total' => NodeRegistry::count(),
        ]);

        $conn->send(json_encode([
            'event' => 'auth.success',
            'data' => ['node_id' => $nodeId],
        ]));

        NodeEventHandlers::pushFullSync($conn, $node);
    }

    /**
     * 新模式：机器认证，自动注册该机器下所有已启用节点
     */
    private function authenticateMachine(TcpConnection $conn, array $params): void
    {
        $machineId = (int) ($params['machine_id'] ?? 0);
        $token = $params['token'] ?? '';

        $machine = is_string($token) ? ServerMachine::findWithToken($machineId, $token) : null;

        if (!$machine || !$machine->is_active) {
            $conn->close(json_encode([
                'event' => 'error',
                'data' => ['code' => 403, 'message' => 'invalid machine credentials'],
            ]));
            return;
        }

        $machine->forceFill(['last_seen_at' => now()->timestamp])->saveQuietly();
        $conn->machineId = $machineId;

        $conn->machineTokenHash = hash('sha256', $machine->token);
        $previous = NodeRegistry::getMachine($machineId);
        if ($previous) {
            if (($previous->machineTokenHash ?? null) === $conn->machineTokenHash) {
                $this->detachMachine($previous);
                $previous->close();
            } else {
                $this->revokeMachine($previous);
            }
        }
        $nodes = Cache::lock("machine_ws_change:{$machineId}", self::CONNECTION_TTL)->block(1, function () use ($conn, $machine, $machineId) {
            $nodes = ServerService::getMachineNodes($machine);
            Cache::put("machine_ws_owner:{$machineId}", $conn->wsOwner, self::CONNECTION_TTL);
            NodeRegistry::addMachine($machineId, $conn);
            $conn->machineNodeIds = $nodes->modelKeys();
            foreach ($nodes as $node) {
                NodeRegistry::add($node->id, $conn);
                $this->claimNode($conn, $node->id);
            }
            return $nodes;
        });
        $nodeIds = $conn->machineNodeIds;

        Log::debug("[WS] Machine#{$machineId} connected, nodes: " . implode(',', $nodeIds), [
            'remote' => $conn->getRemoteIp(),
            'total' => NodeRegistry::count(),
            'machines' => NodeRegistry::machineCount(),
        ]);

        $conn->send(json_encode([
            'event' => 'auth.success',
            'data' => [
                'machine_id' => $machineId,
                'node_ids' => $nodeIds,
            ],
        ]));

        // 为每个节点推送完整同步
        foreach ($nodes as $node) {
            NodeEventHandlers::pushFullSync($conn, $node);
        }
    }

    public function onMessage(TcpConnection $conn, $data): void
    {
        try {
            $this->dispatchMessage($conn, $data);
        } catch (\Exception $error) {
            Log::warning('[WS] Node event failed', ['node_id' => $conn->nodeId ?? null, 'exception' => $error::class]);
        }
    }

    private function dispatchMessage(TcpConnection $conn, $data): void
    {
        $msg = json_decode($data, true);
        if (!is_array($msg)) {
            return;
        }

        $event = $msg['event'] ?? '';
        if (!is_string($event) || (isset($msg['data']) && !is_array($msg['data']))) return;


        // 机器连接：从消息中读取 node_id 来分派到具体节点
        if (!empty($conn->machineId)) {
            if (NodeRegistry::getMachine($conn->machineId) !== $conn) {
                return;
            }
            if ($event === 'pong') {
                $current = Cache::lock("machine_ws_change:{$conn->machineId}", self::CONNECTION_TTL)->block(1, static function () use ($conn) {
                    $key = "machine_ws_owner:{$conn->machineId}";
                    if (Cache::get($key) !== $conn->wsOwner) return false;
                    Cache::put($key, $conn->wsOwner, self::CONNECTION_TTL);
                    return true;
                });
                if (!$current) {
                    $conn->close();
                    return;
                }
                $conn->lastPongAt = time();
                foreach ($conn->machineNodeIds as $nid) {
                    $this->handleNodeEvent($conn, $nid, 'pong', []);
                }
                return;
            }

            $nodeId = (int) ($msg['data']['node_id'] ?? 0);
            if ($nodeId <= 0 || NodeRegistry::get($nodeId) !== $conn) {
                return;
            }
            if (isset($this->handlers[$event])) {
                $this->handleNodeEvent($conn, $nodeId, $event, $msg['data'] ?? []);
            }
            return;
        }

        // 旧模式：单节点
        $nodeId = $conn->nodeId ?? null;
        if (isset($this->handlers[$event]) && $nodeId && NodeRegistry::get($nodeId) === $conn) {
            $this->handleNodeEvent($conn, $nodeId, $event, $msg['data'] ?? []);
        }
    }

    public function onClose(TcpConnection $conn): void
    {
        // 机器模式：清理所有关联节点
        if (!empty($conn->machineId)) {
            $this->detachMachine($conn);
            Log::debug("[WS] Machine#{$conn->machineId} disconnected", [
                'total' => NodeRegistry::count(),
                'machines' => NodeRegistry::machineCount(),
            ]);
            return;
        }

        // 旧模式：单节点
        if (!empty($conn->nodeId)) {
            $nodeId = $conn->nodeId;
            if (NodeRegistry::get($nodeId) !== $conn) return;
            NodeRegistry::remove($nodeId, $conn);
            $this->releaseNode($conn, $nodeId);

            Log::debug("[WS] Node#{$nodeId} disconnected", ['total' => NodeRegistry::count()]);
        }
    }

    private function claimNode(TcpConnection $conn, int $nodeId): void
    {
        Cache::lock("node_ws_change:{$nodeId}", self::CONNECTION_TTL)->block(1, static function () use ($conn, $nodeId) {
            Cache::put("node_ws_alive:{$nodeId}", $conn->wsOwner, self::CONNECTION_TTL);
            app(DeviceStateService::class)->clearAllNodeDevices($nodeId);
        });
    }

    private function releaseNode(TcpConnection $conn, int $nodeId): void
    {
        try {
            Cache::lock("node_ws_change:{$nodeId}", self::CONNECTION_TTL)->block(1, static function () use ($conn, $nodeId) {
                $key = "node_ws_alive:{$nodeId}";
                if (Cache::get($key) !== $conn->wsOwner) return;
                Cache::forget($key);
                app(DeviceStateService::class)->clearAllNodeDevices($nodeId);
            });
        } catch (\Throwable $e) {
            Log::warning("[WS] Failed to clear offline state for node#{$nodeId}", ['exception' => $e::class]);
        }
    }

    private function handleNodeEvent(TcpConnection $conn, int $nodeId, string $event, array $data): void
    {
        // A connection on another worker may already own this node. Serialize its
        // handoff with reports so a late snapshot cannot erase the new owner's devices.
        $reauthenticate = Cache::lock("node_ws_change:{$nodeId}", self::CONNECTION_TTL)->block(1, function () use ($conn, $nodeId, $event, $data) {
            $owner = Cache::get("node_ws_alive:{$nodeId}");
            if ($owner !== $conn->wsOwner) {
                return empty($conn->machineId) && $event === 'pong';
            }
            if ($event === 'pong') $conn->lastPongAt = time();
            ($this->handlers[$event])($conn, $nodeId, $data);
            return false;
        });
        // After expiry or a cache flush only a fresh handshake may reclaim the node.
        // Close outside the lock, since onClose also takes it.
        if ($reauthenticate) $conn->close();
    }

    private function detachMachine(TcpConnection $conn): void
    {
        NodeRegistry::removeMachine($conn->machineId, $conn);
        $nodeIds = $conn->machineNodeIds ?? [];
        $conn->machineNodeIds = [];
        foreach ($nodeIds as $nodeId) {
            if (NodeRegistry::get($nodeId) !== $conn) {
                continue;
            }
            NodeRegistry::remove($nodeId, $conn);
            $this->releaseNode($conn, $nodeId);
        }
    }

    private function revokeMachine(TcpConnection $conn): void
    {
        $this->detachMachine($conn);
        // Older clients already understand an empty assignment.
        $conn->send(json_encode(['event' => 'sync.nodes', 'data' => ['nodes' => []]]));
        $conn->close(json_encode(['event' => 'machine.revoked', 'data' => ['code' => 403]]));
    }

    public function revalidateMachineSessions(?array $machineIds = null): void
    {
        foreach (array_chunk($machineIds ?? NodeRegistry::getConnectedMachineIds(), 500) as $ids) {
            try {
                $tokens = ServerMachine::query()->useWritePdo()->whereIntegerInRaw('id', $ids)
                    ->where('is_active', true)->pluck('token', 'id');
            } catch (\Illuminate\Database\QueryException $e) {
                Log::warning('[WS] Machine credential check deferred', ['exception' => $e]);
                continue;
            }
            foreach ($ids as $id) {
                $conn = NodeRegistry::getMachine($id);
                $token = $tokens->get($id);
                if ($conn && ($token === null || hash('sha256', $token) !== $conn->machineTokenHash)) {
                    $this->revokeMachine($conn);
                }
            }
        }
    }

    private function subscribeRedis(): void
    {
        $config = (new \Illuminate\Support\ConfigurationUrlParser)->parseConfiguration(config('database.redis.default'));
        $host = $config['host'] ?? '127.0.0.1';
        $port = $config['port'] ?? 6379;

        if (str_starts_with($host, '/')) {
            $redisUri = "unix://{$host}";
        } else {
            $redisUri = "redis://{$host}:{$port}";
        }

        $redis = new \Workerman\Redis\Client($redisUri, [
            'ssl' => ($config['driver'] ?? $config['scheme'] ?? null) === 'tls',
            'context' => $config['context'] ?? [],
        ]);

        $password = $config['password'] ?? null;
        if ($password !== null && $password !== '') {
            $user = $config['username'] ?? null;
            $redis->auth($user !== null && $user !== '' ? [$user, $password] : $password);
        }
        if (!empty($config['database'])) $redis->select((int) $config['database']);

        $prefix = config('database.redis.options.prefix', '');
        $channel = $prefix . 'node:push';

        $redis->subscribe([$channel], function ($chan, $message) {
            try {
                $this->dispatchPublishedEvent($message);
            } catch (\Exception $error) {
                Log::warning('[WS] Redis event failed', ['exception' => $error::class]);
            }
        });
        Log::info("[WS] Subscribed to Redis channel: {$channel}");
    }

    private function dispatchPublishedEvent(string $message): void
    {
        $payload = json_decode($message, true);
        if (!is_array($payload)) {
            return;
        }

        $event = $payload['event'] ?? '';
        $data = $payload['data'] ?? [];
        if (!is_string($event) || !is_array($data)) return;

        // Machine-level events (e.g., sync.nodes)
        $machineId = $payload['machine_id'] ?? null;
        if ($machineId && $event) {
            if ($event === NodeSyncService::MACHINE_AUTH_CHANGED) {
                if (NodeRegistry::getMachine((int) $machineId)) {
                    $this->revalidateMachineSessions([(int) $machineId]);
                }
                return;
            }
            // Update server-side registry when node membership changes
            if ($event === 'sync.nodes') {
                $this->refreshMachineMembership((int) $machineId);
                return;
            }

            $sent = NodeRegistry::sendMachine((int) $machineId, $event, $data);
            if ($sent) {
                Log::debug("[WS] Pushed {$event} to machine#{$machineId}");
            }
            return;
        }

        // Per-node events
        $nodeId = $payload['node_id'] ?? null;
        if (!$nodeId || !$event) {
            return;
        }

        $sent = NodeRegistry::send((int) $nodeId, $event, $data);
        if ($sent) {
            Log::debug("[WS] Pushed {$event} to node#{$nodeId}");
        }
    }

    public function refreshMachineMembership(int $machineId): void
    {
        $conn = NodeRegistry::getMachine($machineId);
        if (!$conn) return;
        $added = Cache::lock("machine_ws_change:{$machineId}", self::CONNECTION_TTL)->block(1, function () use ($machineId, $conn) {
            if (Cache::get("machine_ws_owner:{$machineId}") !== $conn->wsOwner) return [];
            return $this->refreshOwnedMachine($machineId, $conn);
        });
        foreach ($added as $node) NodeEventHandlers::pushFullSync($conn, $node);
    }

    private function refreshOwnedMachine(int $machineId, TcpConnection $conn): array
    {
        $machine = ServerMachine::query()->useWritePdo()->find($machineId);
        if (!$machine || !$machine->is_active || hash('sha256', $machine->token) !== $conn->machineTokenHash) {
            $this->revokeMachine($conn);
            return [];
        }
        $nodes = ServerService::getMachineNodes($machine);
        $ids = $nodes->modelKeys();
        $oldIds = $conn->machineNodeIds ?? [];
        foreach (array_diff($oldIds, $ids) as $removed) {
            if (NodeRegistry::get($removed) === $conn) {
                $this->releaseNode($conn, $removed);
            }
        }
        NodeRegistry::refreshMachineNodes($machineId, $ids);
        NodeRegistry::sendMachine($machineId, 'sync.nodes', [
            'nodes' => $nodes->map(fn ($node) => $node->only(['id', 'type', 'name']))->values()->all(),
        ]);
        $added = $nodes->whereIn('id', array_diff($ids, $oldIds))->all();
        foreach ($added as $node) $this->claimNode($conn, $node->id);
        return $added;
    }
}
