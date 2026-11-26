<?php

namespace App\Console\Commands;

use App\Services\TrafficBatchOutbox;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class DispatchTrafficBatches extends Command
{
    protected $signature = 'traffic:batches {--status : Show pending work and replay counters}';
    protected $description = 'Recover pending or unacknowledged traffic batch jobs';

    public function handle(): int
    {
        if (!$this->option('status')) {
            $this->info('Dispatched: ' . TrafficBatchOutbox::dispatchDue());
            return self::SUCCESS;
        }

        $rows = DB::table('v2_traffic_batch_tasks as t')
            ->join('v2_traffic_batches as b', 't.receipt_id', '=', 'b.id')->groupBy('t.kind')->orderBy('t.kind')
            ->selectRaw('t.kind, COUNT(*) AS pending, MIN(b.received_at) AS oldest, SUM(b.raw_u) AS raw_u, SUM(b.raw_d) AS raw_d')
            ->get()->map(fn ($row) => [$row->kind, $row->pending, max(0, time() - $row->oldest), $row->raw_u, $row->raw_d]);
        $this->table(['Stage', 'Pending', 'Oldest (s)', 'Pending raw up (B)', 'Pending raw down (B)'], $rows);
        $summary = DB::table('v2_traffic_batches')
            ->selectRaw('COUNT(*) AS receipts, SUM(duplicate_count) AS duplicates, SUM(conflict_count) AS conflicts')->first();
        $this->info(sprintf('Receipts: %d, duplicate requests: %d, conflicts: %d',
            $summary->receipts, $summary->duplicates, $summary->conflicts));
        return self::SUCCESS;
    }
}
