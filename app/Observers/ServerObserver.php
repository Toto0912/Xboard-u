<?php

namespace App\Observers;

use App\Models\Server;
use App\Services\NodeSyncService;
use App\Services\ServerService;

class ServerObserver
{
    public function created(Server $server): void
    {
        $machineId = $server->machine_id;
        $this->afterCommit($server, fn () => $this->notifyMachineNodesChanged($machineId));
    }

    public function updated(Server $server): void
    {
        $before = (new Server())->setRawAttributes($server->getRawOriginal(), true);
        $nodeId = $server->id;
        $fullSync = $server->wasChanged('group_ids');
        $configChanged = $server->wasChanged([
            'host', 'server_port', 'protocol_settings', 'cdn_settings', 'type',
            'route_ids', 'custom_outbounds', 'custom_routes', 'cert_config',
        ]) && json_encode(ServerService::buildNodeConfig($before)) !== json_encode(ServerService::buildNodeConfig($server));
        $machineChanged = $server->wasChanged(['machine_id', 'enabled']);
        $machineId = $server->machine_id;
        $oldMachineId = $before->machine_id;

        $this->afterCommit($server, function () use ($nodeId, $fullSync, $configChanged, $machineChanged, $machineId, $oldMachineId) {
            if ($fullSync) {
                NodeSyncService::notifyFullSync($nodeId);
            } elseif ($configChanged) {
                NodeSyncService::notifyConfigUpdated($nodeId);
            }

            if ($machineChanged) {
                $this->notifyMachineChange($machineId, $oldMachineId);
            }
        });
    }

    public function deleted(Server $server): void
    {
        $machineId = $server->getOriginal('machine_id') ?: $server->machine_id;
        $this->afterCommit($server, fn () => $this->notifyMachineChange(null, $machineId));
    }

    private function afterCommit(Server $server, callable $callback): void
    {
        $connection = $server->getConnection();
        if ($connection->transactionLevel() > 0) {
            $connection->afterCommit($callback);
        } else {
            $callback();
        }
    }

    private function notifyMachineChange(?int $newMachineId, ?int $oldMachineId): void
    {
        $notified = [];

        if ($newMachineId) {
            NodeSyncService::notifyMachineNodesChanged($newMachineId);
            $notified[] = $newMachineId;
        }

        if ($oldMachineId && !in_array($oldMachineId, $notified, true)) {
            NodeSyncService::notifyMachineNodesChanged($oldMachineId);
        }
    }

    private function notifyMachineNodesChanged(?int $machineId): void
    {
        if ($machineId) {
            NodeSyncService::notifyMachineNodesChanged($machineId);
        }
    }
}
