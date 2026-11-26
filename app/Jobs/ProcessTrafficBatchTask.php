<?php

namespace App\Jobs;

use App\Services\ServerTrafficActivity;
use App\Services\TrafficBatchOutbox;
use App\Support\TrafficBatch;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;
use LogicException;
use RuntimeException;

class ProcessTrafficBatchTask implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $tries = 3;
    public int $timeout = 25;

    public function __construct(public int $receiptId, public int $taskId)
    {
        $this->onQueue('traffic_batch');
    }

    public function handle(): void
    {
        $usageApplied = DB::transaction(function () {
            // All stages of one receipt acquire the same first lock. The last
            // stage can therefore release the payload without racing its peers.
            $receiptQuery = DB::table('v2_traffic_batches')->where('id', $this->receiptId);
            $receipt = $receiptQuery->lockForUpdate()->first();
            if (!$receipt || $receipt->completed_at !== null) {
                return false;
            }
            $tasks = DB::table('v2_traffic_batch_tasks')->where('receipt_id', $this->receiptId);
            $currentTask = (clone $tasks)->where('id', $this->taskId);
            $task = $currentTask->lockForUpdate()->first();
            if (!$task || $task->available_at === null) {
                return false;
            }

            $traffic = json_decode($receipt->payload, true, 512, JSON_THROW_ON_ERROR);
            $server = ['id' => $receipt->stat_server_id, 'rate' => $receipt->rate];
            switch ($task->kind) {
                case 'usage':
                    TrafficBatch::incrementUsage($traffic, $receipt->rate);
                    (clone $tasks)->where('kind', 'quota_check')->update(['available_at' => time()]);
                    break;
                case 'user_stat':
                    (new StatUserJob($server, $traffic, $receipt->protocol, 'd', $receipt->record_at))->handle();
                    break;
                case 'server_stat':
                    (new StatServerJob($server, $traffic, $receipt->protocol, 'd', $receipt->record_at))->handle();
                    break;
                case 'quota_check':
                    // SADD is safe to repeat if the DB commit following Redis fails.
                    if ($traffic && Redis::sadd('traffic:pending_check', ...array_keys($traffic)) === false) {
                        throw new RuntimeException('Could not enqueue traffic quota checks');
                    }
                    break;
                case 'activity':
                    $users = json_decode($receipt->activity_users, true, 512, JSON_THROW_ON_ERROR);
                    ServerTrafficActivity::recordBatch($receipt->activity_type, $receipt->server_id, $users, $receipt->received_at);
                    break;
                default:
                    throw new LogicException("Unknown traffic batch task: {$task->kind}");
            }

            $currentTask->delete();
            if (!$tasks->exists()) {
                $receiptQuery->update(['completed_at' => time(), 'payload' => null, 'activity_users' => null]);
            }
            return $task->kind === 'usage';
        }, 3);

        if ($usageApplied) {
            // The scheduler can recover this task even if the worker exits here.
            TrafficBatchOutbox::dispatchDue($this->receiptId, 'quota_check');
        }
    }
}
