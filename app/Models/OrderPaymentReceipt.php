<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use RuntimeException;

final class OrderPaymentReceipt
{
    public const TABLE = 'v2_order_payment_receipts';

    // The order is locked. The unique channel/transaction key also serializes competing orders.
    public static function record(Order $order, int $paymentId, string $transaction, string $callback,
        ?OrderPaymentAttempt $attempt, ?int $expected, ?int $verifiedGross, ?string $historicalInvoiceCurrency = null): bool
    {
        $kind = $historicalInvoiceCurrency !== null ? 'verify_history' : match ((int) $order->status) {
            Order::STATUS_PENDING => 'applied',
            Order::STATUS_CANCELLED => 'cancelled',
            default => self::classifyPaid($order, $paymentId, $transaction, $attempt),
        };
        $identity = ['payment_id' => $paymentId, 'reference_hash' => hash('sha256', $transaction)];
        $receipts = DB::table(self::TABLE);
        if ($receipts->insertOrIgnore($identity + [
            'order_id' => $order->id, 'trade_no' => $order->trade_no, 'attempt_id' => $attempt?->id,
            'transaction_no' => $transaction, 'callback_no' => $callback, 'kind' => $kind,
            'expected_amount' => $expected, 'verified_amount' => $verifiedGross,
            'quote_currency' => $attempt?->quote_currency ?? $historicalInvoiceCurrency, 'received_at' => time(),
        ])) {
            return true;
        }
        $existing = $receipts->where($identity)->lockForUpdate()->first();
        if (!$existing || (int) $existing->order_id !== (int) $order->id || $existing->transaction_no !== $transaction
            || ($attempt && $existing->attempt_id !== null && (int) $existing->attempt_id !== (int) $attempt->id)) {
            throw new RuntimeException('Gateway transaction belongs to a different order or quote.');
        }
        return false;
    }

    private static function classifyPaid(Order $order, int $paymentId, string $transaction,
        ?OrderPaymentAttempt $attempt): string
    {
        if ($attempt?->confirmed_transaction !== null) {
            return $attempt->confirmed_transaction === $transaction ? 'historical' : 'additional';
        }
        if (DB::table(self::TABLE)->where('order_id', $order->id)->exists()) {
            return 'additional';
        }
        // A legacy order may have saved only a delivery ID or a manual confirmation.
        if ((int) $order->payment_id === $paymentId && $order->callback_no === $transaction) {
            return 'historical';
        }
        return 'verify_history';
    }
}
