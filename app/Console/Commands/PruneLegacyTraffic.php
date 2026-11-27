<?php

namespace App\Console\Commands;

use App\Services\TrafficBatchReceiver;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class PruneLegacyTraffic extends Command
{
    protected $signature = 'traffic:prune-legacy {--days=90} {--execute : Delete the previewed class of receipts}';
    protected $description = 'Preview or prune completed legacy traffic receipts without outstanding work';

    public function handle(): int
    {
        $days = filter_var($this->option('days'), FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 36500]]);
        if ($days === false || !Schema::hasColumn('v2_traffic_batches', 'source')) {
            $this->error('Migrate the receipt table and specify a retention of 1 to 36500 days.');
            return self::FAILURE;
        }
        $started = microtime(true);
        $eligible = DB::table('v2_traffic_batches')->where('source', TrafficBatchReceiver::SOURCE_LEGACY)
            ->where('completed_at', '<', now()->subDays($days)->timestamp)
            ->whereNotExists(fn ($q) => $q->selectRaw('1')->from('v2_traffic_batch_tasks')
                ->whereColumn('receipt_id', 'v2_traffic_batches.id'));
        $summary = (clone $eligible)->selectRaw('COUNT(*) AS n, MIN(completed_at) AS oldest, MAX(completed_at) AS newest, MAX(id) AS last_id')->first();
        $this->info(sprintf('Eligible: %d, oldest: %s, newest: %s', $summary->n,
            $summary->oldest === null ? '-' : date(DATE_ATOM, $summary->oldest),
            $summary->newest === null ? '-' : date(DATE_ATOM, $summary->newest)));
        if ($this->option('execute') && $summary->n > 0) {
            $deleted = 0;
            (clone $eligible)->where('id', '<=', $summary->last_id)->select('id')
                ->chunkById(500, function ($rows) use ($eligible, &$deleted) {
                    $deleted += (clone $eligible)->whereIntegerInRaw('id', $rows->pluck('id'))->delete();
                });
            $this->info(sprintf('Deleted: %d in %.2f seconds', $deleted, microtime(true) - $started));
        }
        return self::SUCCESS;
    }
}
