<?php

namespace App\Http\Controllers\V1\Guest;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\OrderPaymentAttempt;
use App\Models\OrderPaymentReceipt;
use App\Services\OrderService;
use App\Services\PaymentService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use App\Services\Plugin\HookManager;

class PaymentController extends Controller
{
    public function notify($method, $uuid, Request $request)
    {
        HookManager::call('payment.notify.before', [$method, $uuid, $request]);
        try {
            $paymentService = new PaymentService($method, null, $uuid);
            $verify = $paymentService->notify($request->input());
            if (!$verify) {
                HookManager::call('payment.notify.failed', [$method, $uuid, $request]);
                return $this->fail([422, 'verify error']);
            }
            if (is_string($verify)) {
                // Some verified notifications acknowledge progress without settling an order.
                return $verify;
            }
            foreach (['trade_no', 'callback_no'] as $key) {
                $value = $verify[$key] ?? null;
                if ((!is_string($value) && !is_int($value)) || trim((string) $value) === '') {
                    return $this->fail([422, 'invalid payment reference']);
                }
            }
            $reference = array_key_exists('transaction_no', $verify) ? $verify['transaction_no'] : $verify['callback_no'];
            if ((!is_string($reference) && !is_int($reference)) || trim((string) $reference) === '') {
                return $this->fail([422, 'invalid transaction reference']);
            }
            $gross = null;
            if ($paymentService->supportsAttemptReferences() && isset($verify['verified_order_gross'])) {
                // Only the plugin's verified result can supply the gross in the order currency.
                $amount = $verify['verified_order_gross'];
                if ((!is_string($amount) && !is_int($amount))
                    || !preg_match('/\A([0-9]{1,12})(?:\.([0-9]{1,2})0*)?\z/', (string) $amount, $parts)) {
                    return $this->fail([422, 'invalid verified amount']);
                }
                $gross = (int) $parts[1] * 100 + (int) str_pad($parts[2] ?? '', 2, '0');
            }
            if (!$this->handle($verify, $paymentService, (string) $reference, $gross)) {
                return $this->fail([400, 'handle error']);
            }
            return (isset($verify['custom_result']) ? $verify['custom_result'] : 'success');
        } catch (\Exception $e) {
            Log::error($e);
            return $this->fail([500, 'fail']);
        }
    }

    private function handle(array $verify, PaymentService $paymentService, string $reference, ?int $gross): bool
    {
        $paymentId = $paymentService->paymentId();
        $requireIssuedQuote = !$paymentService->isEnabled();
        $tradeNo = (string) $verify['trade_no'];
        $attempt = OrderPaymentAttempt::query()->useWritePdo()->where('merchant_reference', $tradeNo)->first();
        if ($attempt && $attempt->payment_id !== $paymentId) {
            Log::warning('Payment reference belongs to a different channel', ['payment_id' => $paymentId]);
            return false;
        }
        $order = $attempt
            ? Order::query()->useWritePdo()->find($attempt->order_id)
            : Order::query()->useWritePdo()->where('trade_no', $tradeNo)->first();
        if (!$order) {
            Log::warning('Payment notify received for unknown order', ['trade_no' => $tradeNo]);
            return false;
        }
        $legacyCurrency = $attempt?->quote_currency === null && array_key_exists('verified_order_currency', $verify);
        $recorded = ($requireIssuedQuote || $legacyCurrency)
            && $this->alreadyRecorded($order, $attempt, $paymentId, $reference, $requireIssuedQuote || $paymentService->method === 'BTCPay');
        if ($requireIssuedQuote && $recorded && $attempt && $gross !== null && $gross !== $attempt->total_amount + (int) $attempt->handling_amount) {
            return false;
        }
        if ($requireIssuedQuote && !$recorded && !$attempt && !OrderPaymentAttempt::hasIssuedPublicQuote($order, $paymentId)) {
            Log::warning('Disabled payment channel has no matching issued quote', ['payment_id' => $paymentId, 'trade_no' => $tradeNo]);
            return false;
        }
        if (array_key_exists('verified_order_currency', $verify) || $attempt?->quote_currency !== null) {
            if ($legacyCurrency && $recorded) {
                // A pre-upgrade receipt is safe to acknowledge again without dispatching hooks or fulfillment.
                return true;
            }
            if ($attempt?->quote_currency === null && $paymentService->method === 'BTCPay'
                && ($verify['verified_order_currency'] ?? null) === 'CNY' && $gross !== null) {
                // Old invoices always requested CNY; the intended site currency was never stored.
                return $this->reviewHistoricalBtcpay($order, $attempt, $paymentId, $reference, $gross);
            }
            if ($attempt?->quote_currency === null || $attempt->quote_currency !== ($verify['verified_order_currency'] ?? null)
                || $gross !== $attempt->total_amount + (int) $attempt->handling_amount) {
                Log::warning('Payment requires reconciliation: missing or mismatched checkout quote', [
                    'payment_id' => $paymentId, 'trade_no' => $tradeNo, 'transaction_no' => $reference,
                ]);
                return false;
            }
        }
        if ($recorded) {
            return true;
        }
        $verify['trade_no'] = $order->trade_no;
        HookManager::call('payment.notify.verified', $verify);
        // A legacy callback number can identify a delivery rather than a settled payment.
        $transaction = isset($verify['transaction_no']) ? $reference : null;
        return (new OrderService($order))->paid((string) $verify['callback_no'], $paymentId, $transaction, $attempt, $gross, $requireIssuedQuote);
    }

    private function reviewHistoricalBtcpay(Order $order, ?OrderPaymentAttempt $attempt, int $paymentId,
        string $reference, int $gross): bool
    {
        return DB::transaction(function () use ($order, $attempt, $paymentId, $reference, $gross) {
            $order = Order::lockForUpdate()->findOrFail($order->id);
            if (!$attempt) {
                if (!OrderPaymentAttempt::hasIssuedPublicQuote($order, $paymentId)) {
                    return false;
                }
                $attempt = OrderPaymentAttempt::where('order_id', $order->id)->where('payment_id', $paymentId)
                    ->whereNull('merchant_reference')->lockForUpdate()->first();
            }
            $quote = $attempt ?? $order;
            $expected = $quote->total_amount + (int) $quote->handling_amount;
            if ($gross !== $expected) {
                return false;
            }
            OrderPaymentReceipt::record($order, $paymentId, $reference, $reference, $attempt, $expected, $gross, 'CNY');
            return true;
        }, 3);
    }

    private function alreadyRecorded(Order $order, ?OrderPaymentAttempt $attempt, int $paymentId, string $reference,
        bool $requireSameQuote): bool
    {
        $referenceHash = hash('sha256', $reference);
        $receipt = DB::table(OrderPaymentReceipt::TABLE)->useWritePdo()->where('payment_id', $paymentId)
            ->where('reference_hash', $referenceHash)->first();
        if ($receipt) {
            if ((int) $receipt->order_id !== (int) $order->id || $receipt->transaction_no !== $reference) {
                return false;
            }
            if (!$requireSameQuote) {
                return true;
            }
            if ($receipt->attempt_id === null) {
                return $attempt === null;
            }
            if ($attempt) {
                return $attempt->id === (int) $receipt->attempt_id;
            }
            return OrderPaymentAttempt::query()->useWritePdo()->whereKey($receipt->attempt_id)
                ->where('order_id', $order->id)->where('payment_id', $paymentId)->whereNull('merchant_reference')->exists();
        }
        if ($attempt?->confirmed_at !== null && $attempt->confirmed_transaction === $reference) {
            return true;
        }
        if ($requireSameQuote && OrderPaymentAttempt::query()->useWritePdo()->where('order_id', $order->id)
            ->where('payment_id', $paymentId)->whereNotNull('merchant_reference')->whereNotNull('confirmed_at')
            ->where('confirmed_transaction', $reference)->exists()) {
            return false;
        }
        if ((int) $order->status === Order::STATUS_CANCELLED) {
            return DB::table('v2_cancelled_order_payments')->useWritePdo()->where('order_id', $order->id)
                ->where('payment_id', $paymentId)->where('reference_hash', $referenceHash)->where('transaction_no', $reference)->exists();
        }
        return $order->paid_at !== null && (int) $order->payment_id === $paymentId && $order->callback_no === $reference;
    }
}
