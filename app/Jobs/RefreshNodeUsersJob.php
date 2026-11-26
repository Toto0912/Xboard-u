<?php

namespace App\Jobs;

use App\Models\Server;
use App\Services\NodeSyncService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;

class RefreshNodeUsersJob implements ShouldQueue
{
    use Dispatchable, Queueable;

    public function __construct(private readonly int $nodeId)
    {
        $this->onQueue('node_sync');
    }

    public function handle(): void
    {
        $server = Server::query()->useWritePdo()->find($this->nodeId);
        if ($server) {
            NodeSyncService::pushNodeUsers($server);
        }
    }
}
