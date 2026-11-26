<?php

namespace App\Services;

use App\Jobs\ProcessTrafficBatchTask;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;

final class TrafficBatchOutbox
{
    // A killed dispatcher or a lost queue message leaves a claim that expires.
    private const LEASE_SECONDS = 300;

    public static function dispatchDue(?int $receiptId = null, ?string $kind = null, int $limit = 1000): int
    {
        $now = time();
        $due = DB::table('v2_traffic_batch_tasks')->where('available_at', '<=', $now);
        if ($receiptId !== null) {
            $due->where('receipt_id', $receiptId);
        }
        if ($kind !== null) {
            $due->where('kind', $kind);
        }
        $tasks = $due->orderBy('available_at')->orderBy('id')->limit($limit)->get(['id', 'receipt_id']);
        $dispatched = 0;
        foreach ($tasks as $task) {
            $claimed = DB::table('v2_traffic_batch_tasks')->where('id', $task->id)
                ->where('available_at', '<=', $now)->update(['available_at' => $now + self::LEASE_SECONDS]);
            if ($claimed) {
                Bus::dispatch(new ProcessTrafficBatchTask($task->receipt_id, $task->id));
                ++$dispatched;
            }
        }
        return $dispatched;
    }
}
