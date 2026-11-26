<?php

namespace App\Console\Commands;

use App\Models\OrderPaymentReceipt;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

class ReviewAdditionalPayments extends ReviewCancelledPayments
{
    protected $signature = 'payment:review-additional' . self::REVIEW_OPTIONS;
    protected $description = 'List or review additional payments and receipts requiring historical verification';

    protected function receipts(): Builder
    {
        return DB::table(OrderPaymentReceipt::TABLE)->useWritePdo()->whereIn('kind', ['additional', 'verify_history']);
    }

    protected function columns(): array
    {
        return ['id', 'trade_no', 'payment_id', 'attempt_id', 'kind', 'transaction_no', 'callback_no',
            'expected_amount', 'verified_amount', 'quote_currency', 'received_at', 'reviewed_at', 'review_note'];
    }
}
