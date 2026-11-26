<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OrderPaymentAttempt extends Model
{
    protected $table = 'v2_order_payment_attempts';
    public $timestamps = false;
    protected $guarded = ['id'];
    protected $casts = ['order_id'=>'integer', 'payment_id'=>'integer', 'total_amount'=>'integer', 'handling_amount'=>'integer'];

    // The caller holds the order lock. Identical quotes use the same merchant reference on retries.
    public static function quote(Order $order, Payment $payment, bool $supportsReferences, ?string $currency = null): self
    {
        $attempts = self::where('order_id', $order->id);
        if ($order->payment_id !== null && !(clone $attempts)->exists()) {
            self::create(['order_id' => $order->id, 'payment_id' => $order->payment_id, 'legacy_quote' => true,
                'total_amount' => $order->total_amount, 'handling_amount' => $order->handling_amount, 'created_at' => time()]);
        }

        $fee = null;
        if ($payment->handling_fee_fixed || $payment->handling_fee_percent) {
            $fee = (int) round($order->total_amount * $payment->handling_fee_percent / 100 + $payment->handling_fee_fixed);
        }
        $quotes = $attempts->where('payment_id', $payment->id);
        // A plugin that uses the public order number cannot distinguish a later quote on this channel.
        $quote = $supportsReferences
            ? $quotes->where('total_amount', $order->total_amount)->where('handling_amount', $fee)
                ->where('quote_currency', $currency)->whereNotNull('merchant_reference')->first()
            : $quotes->whereNull('merchant_reference')->first();
        return $quote ?? self::create([
            'order_id' => $order->id, 'payment_id' => $payment->id, 'total_amount' => $order->total_amount,
            'handling_amount' => $fee, 'quote_currency' => $currency,
            'merchant_reference' => $supportsReferences ? 'P'.bin2hex(random_bytes(12)) : null,
            'created_at' => time(),
        ]);
    }

    public static function hasIssuedPublicQuote(Order $order, int $paymentId): bool
    {
        $quotes = self::query()->useWritePdo()->where('order_id', $order->id);
        if ((clone $quotes)->where('payment_id', $paymentId)->whereNull('merchant_reference')->exists()) {
            return true;
        }

        // Orders predating payment attempts kept their selected channel on the order itself.
        return (int) $order->payment_id === $paymentId && !$quotes->exists();
    }

    // Return the confirmation as it stood before this delivery, while holding the order lock.
    public static function confirm(Order $order, int $paymentId, string $transaction, ?self $attempt): ?self
    {
        if ($attempt) {
            $attempt = self::lockForUpdate()->findOrFail($attempt->id);
        } else {
            $attempts = self::where('order_id', $order->id);
            $publicQuotes = (clone $attempts)->whereNull('merchant_reference');
            $attempt = (clone $publicQuotes)->where('payment_id', $paymentId)->first();
            if (!$attempt && !$publicQuotes->where('legacy_quote', true)->exists() && $attempts->exists()) {
                throw new \RuntimeException('Payment callback is missing its merchant reference.');
            }
        }
        if ($attempt) {
            if ($attempt->order_id !== (int) $order->id || $attempt->payment_id !== $paymentId) {
                throw new \RuntimeException('Payment reference does not match the order and channel.');
            }
            self::whereKey($attempt->id)->whereNull('confirmed_at')->update([
                'confirmed_at' => time(), 'confirmed_transaction' => $transaction,
            ]);
        }
        return $attempt;
    }
}
