<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

class ReviewCancelledPayments extends Command
{
    protected const REVIEW_OPTIONS = '
        {--trade-no= : Filter by order number}
        {--after=0 : Start after this record ID}
        {--all : Include reviewed receipts}
        {--resolve= : Mark this receipt ID as reviewed}
        {--note= : Record the review outcome or reference}';
    protected $signature = 'payment:review-cancelled' . self::REVIEW_OPTIONS;

    protected $description = 'List or mark reviewed payments received after order cancellation';

    protected function receipts(): Builder
    {
        return DB::table('v2_cancelled_order_payments')->useWritePdo();
    }

    protected function columns(): array
    {
        return ['id', 'trade_no', 'payment_id', 'transaction_no', 'callback_no', 'expected_amount',
            'received_at', 'reviewed_at', 'review_note'];
    }

    public function handle(): int
    {
        $receipts = $this->receipts();
        if (($id = $this->option('resolve')) !== null) {
            $note = trim((string) $this->option('note'));
            if (!ctype_digit($id) || (int) $id < 1 || $note === '') {
                $this->error('Provide a positive receipt ID and a nonempty --note.');
                return self::FAILURE;
            }
            if (!$receipts->where('id', $id)->whereNull('reviewed_at')
                ->update(['reviewed_at' => time(), 'review_note' => $note])) {
                $this->error('Receipt does not exist or has already been reviewed.');
                return self::FAILURE;
            }
            $this->info("Marked receipt {$id} as reviewed.");
            return self::SUCCESS;
        }

        if (!$this->option('all')) {
            $receipts->whereNull('reviewed_at');
        }
        if (($tradeNo = $this->option('trade-no')) !== null) {
            $receipts->where('trade_no', $tradeNo);
        }
        $columns = $this->columns();
        $rows = $receipts->where('id', '>', (int) $this->option('after'))->orderBy('id')->limit(100)->get($columns);
        $this->table($columns, $rows->map(fn ($row) => (array) $row)->all());
        return self::SUCCESS;
    }
}
