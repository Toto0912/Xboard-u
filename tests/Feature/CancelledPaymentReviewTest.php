<?php

namespace Tests\Feature;

use App\Jobs\OrderHandleJob;
use App\Models\Order;
use App\Models\OrderPaymentAttempt;
use App\Models\Payment;
use App\Models\Plan;
use App\Models\User;
use App\Services\OrderService;
use App\Services\Plugin\HookManager;
use App\Services\Plugin\PluginManager;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class CancelledPaymentReviewTest extends TestCase
{
    use RefreshDatabase;

    private const TABLE = 'v2_cancelled_order_payments';
    private Payment $epay;
    private User $user;
    private Order $order;

    protected function setUp(): void
    {
        parent::setUp();
        require_once base_path('plugins-core/Epay/Plugin.php');
        require_once base_path('plugins-core/Btcpay/Plugin.php');
        require_once base_path('plugins-core/CoinPayments/Plugin.php');
        $plugins = [new \Plugin\Epay\Plugin('epay'),
            new \Plugin\Btcpay\Plugin('btcpay'), new \Plugin\CoinPayments\Plugin('coin_payments')];
        foreach ($plugins as $plugin) {
            $plugin->boot();
        }
        $manager = $this->mock(PluginManager::class);
        $manager->shouldReceive('initializeEnabledPlugins')->andReturnNull();
        $manager->shouldReceive('getEnabledPaymentPlugins')->andReturn($plugins);
        Bus::fake([OrderHandleJob::class]);
        $this->epay = $this->gateway('EPay', ['pid' => '7', 'key' => 'test-key']);
        $this->user = User::create(['email' => 'receipt@example.test', 'password' => 'password',
            'uuid' => 'de332e7b-c568-4df9-945a-c084becbfdf0', 'token' => str_repeat('t', 32), 'balance' => 100]);
        $this->order = Order::create(['trade_no' => 'review-test', 'plan_id' => 1, 'user_id' => $this->user->id,
            'period' => Plan::PERIOD_MONTHLY, 'type' => Order::TYPE_NEW_PURCHASE, 'status' => Order::STATUS_PENDING,
            'total_amount' => 700, 'handling_amount' => 5, 'balance_amount' => 300, 'payment_id' => $this->epay->id]);
    }

    private function gateway(string $method, array $config): Payment
    {
        return Payment::create(['payment' => $method, 'uuid' => bin2hex(random_bytes(16)),
            'name' => $method, 'enable' => true, 'config' => $config]);
    }

    private function epay(string $reference, bool $valid = true, ?Payment $gateway = null): TestResponse
    {
        $data = ['pid' => '7', 'trade_status' => 'TRADE_SUCCESS', 'trade_no' => $reference,
            'out_trade_no' => $this->order->trade_no, 'money' => '7.05'];
        ksort($data);
        $data['sign'] = $valid ? md5(urldecode(http_build_query($data)) . 'test-key') : 'invalid';
        return $this->postJson('/api/v1/guest/payment/notify/EPay/' . ($gateway ?? $this->epay)->uuid, $data);
    }

    public function test_verified_receipts_are_idempotent_per_payment_and_review_survives_redelivery(): void
    {
        $this->assertTrue((new OrderService($this->order))->cancel());
        $this->epay('first', false)->assertStatus(422);
        $this->assertDatabaseCount(self::TABLE, 0);
        $this->epay('first')->assertOk()->assertContent('success');
        $this->epay('first')->assertOk();
        $receipt = DB::table(self::TABLE)->sole();
        $this->assertSame(705, (int) $receipt->expected_amount);
        $this->artisan('payment:review-cancelled', ['--trade-no' => $this->order->trade_no])
            ->expectsOutputToContain('first')->assertSuccessful();
        $this->artisan('payment:review-cancelled', ['--resolve' => (string) $receipt->id, '--note' => 'case 17'])
            ->assertSuccessful();
        $this->epay('first')->assertOk();
        $this->epay('second')->assertOk();
        $other = $this->gateway('EPay', ['pid' => '7', 'key' => 'test-key']);
        $this->epay('first', true, $other)->assertOk();
        $this->assertDatabaseCount(self::TABLE, 3);
        $this->assertSame(2, DB::table(self::TABLE)->whereNull('reviewed_at')->count());
        $this->assertDatabaseHas(self::TABLE, ['id' => $receipt->id, 'review_note' => 'case 17']);
        $this->assertSame(Order::STATUS_CANCELLED, $this->order->fresh()->status);
        $this->assertNull($this->order->fresh()->paid_at);
        $this->assertSame(400, $this->user->fresh()->balance);
        Bus::assertNotDispatched(OrderHandleJob::class);
    }

    public function test_failure_to_save_is_retryable_and_stale_pending_order_observes_the_locked_cancellation(): void
    {
        $stale = new OrderService($this->order->fresh());
        $this->assertTrue((new OrderService($this->order))->cancel());
        $this->assertTrue($stale->paid('manual_operation'));
        $this->assertDatabaseCount(self::TABLE, 0);
        $reject = true;
        DB::connection()->beforeExecuting(function ($sql) use (&$reject) {
            if ($reject && str_starts_with(strtolower($sql), 'insert') && str_contains($sql, self::TABLE)) {
                throw new \RuntimeException('receipt write unavailable');
            }
        });
        try {
            $this->epay('retry')->assertStatus(400);
            $this->assertDatabaseCount(self::TABLE, 0);
        } finally {
            $reject = false;
        }
        $this->epay('retry')->assertOk();
        $this->assertTrue($stale->paid('race', $this->epay->id));
        $this->assertDatabaseCount(self::TABLE, 2);
        $this->assertSame(400, $this->user->fresh()->balance);
        Bus::assertNotDispatched(OrderHandleJob::class);
    }

    public function test_normal_payment_dispatches_and_calls_payment_success_only_once(): void
    {
        $success = 0;
        HookManager::register('payment.notify.success', function () use (&$success) { $success++; });
        $this->epay('paid')->assertOk();
        $this->epay('paid')->assertOk();
        $this->assertSame(1, $success);
        Bus::assertDispatchedSync(OrderHandleJob::class, 1);
        $this->assertDatabaseCount(self::TABLE, 0);
        $this->assertSame(Order::STATUS_PROCESSING, $this->order->fresh()->status);
    }

    public function test_signed_btcpay_delivery_waits_for_the_invoice_to_be_settled(): void
    {
        $responses = Http::sequence()->pushStatus(404);
        Http::fake(['https://btcpay.example/*' => $responses]);
        $gateway = $this->gateway('BTCPay', ['btcpay_webhook_key' => 'btcpay-key', 'btcpay_storeId' => 'store',
            'btcpay_url' => 'https://btcpay.example/', 'btcpay_api_key' => 'read-key']);
        $attempt = OrderPaymentAttempt::quote($this->order, $gateway, true, 'CNY');
        $this->assertTrue((new OrderService($this->order))->cancel());
        $send = function (string $type, string $key = 'btcpay-key') use ($gateway) {
            $body = json_encode(['type' => $type, 'invoiceId' => 'invoice1']);
            return $this->call('POST', '/api/v1/guest/payment/notify/BTCPay/' . $gateway->uuid, [], [], [], [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_BTCPAY_SIG' => 'sha256=' . hash_hmac('sha256', $body, $key),
            ], $body);
        };
        $send('InvoiceSettled')->assertServerError();
        $this->assertDatabaseCount(self::TABLE, 0);
        foreach (['Processing', 'Settled', 'Settled'] as $status) {
            $responses->push(['id' => 'invoice1', 'status' => $status, 'additionalStatus' => 'None',
                'checkout' => ['paymentTolerance' => 0], 'amount' => '7.00', 'currency' => 'CNY',
                'metadata' => ['orderId' => $attempt->merchant_reference]]);
            $send('Invoice' . $status, 'different-key')->assertServerError();
            $send('Invoice' . $status)->assertOk();
            $this->assertDatabaseCount(self::TABLE, $status === 'Settled' ? 1 : 0);
        }
    }

    public function test_coinpayments_progress_ack_and_integer_transaction_reference_are_preserved(): void
    {
        $gateway = $this->gateway('CoinPayments', ['coinpayments_merchant_id' => 'merchant',
            'coinpayments_ipn_secret' => 'coinpayments-key', 'coinpayments_currency' => 'USD']);
        $attempt = OrderPaymentAttempt::quote($this->order, $gateway, true, 'USD');
        $this->assertTrue((new OrderService($this->order))->cancel());
        foreach ([0, 100, 100] as $status) {
            $body = http_build_query(['merchant' => 'merchant', 'item_number' => $attempt->merchant_reference,
                'ipn_mode' => 'hmac', 'ipn_type' => 'simple', 'amount1' => '7.00000000', 'currency1' => 'USD',
                'txn_id' => 12345, 'status' => $status]);
            $this->call('POST', '/api/v1/guest/payment/notify/CoinPayments/' . $gateway->uuid, [], [], [], [
                'CONTENT_TYPE' => 'application/x-www-form-urlencoded', 'HTTP_HMAC' => hash_hmac('sha512', $body, 'coinpayments-key'),
            ], $body)->assertOk()->assertContent($status === 0 ? 'IPN OK: pending' : 'IPN OK');
            $this->assertDatabaseCount(self::TABLE, $status === 0 ? 0 : 1);
        }
        $this->assertDatabaseHas(self::TABLE, ['transaction_no' => '12345', 'expected_amount' => 700]);
    }

    public function test_two_settled_btcpay_invoices_for_one_merchant_reference_leave_two_receipts(): void
    {
        $responses = Http::sequence();
        Http::fake(['https://btcpay.example/*' => $responses]);
        $gateway = $this->gateway('BTCPay', ['btcpay_webhook_key' => 'signed', 'btcpay_storeId' => 'store',
            'btcpay_url' => 'https://btcpay.example/', 'btcpay_api_key' => 'read']);
        $attempt = OrderPaymentAttempt::quote($this->order, $gateway, true, 'CNY');
        $send = function (string $invoiceId) use ($gateway) {
            $body = json_encode(['type' => 'InvoiceSettled', 'invoiceId' => $invoiceId]);
            return $this->call('POST', '/api/v1/guest/payment/notify/BTCPay/' . $gateway->uuid, [], [], [], [
                'CONTENT_TYPE' => 'application/json', 'HTTP_BTCPAY_SIG' => 'sha256=' . hash_hmac('sha256', $body, 'signed'),
            ], $body);
        };
        foreach ([['inv-a', 'Settled'], ['inv-b', 'Processing'], ['inv-b', 'Settled'], ['inv-b', 'Settled']] as [$id, $status]) {
            $responses->push(['id' => $id, 'status' => $status, 'additionalStatus' => 'None',
                'checkout' => ['paymentTolerance' => 0], 'amount' => '7.00', 'currency' => 'CNY',
                'metadata' => ['orderId' => $attempt->merchant_reference]]);
            $send($id)->assertOk();
            if ($status === 'Processing') {
                $this->assertDatabaseCount('v2_order_payment_receipts', 1);
            }
        }
        $this->assertDatabaseHas('v2_order_payment_receipts', ['transaction_no' => 'inv-a', 'kind' => 'applied']);
        $this->assertDatabaseHas('v2_order_payment_receipts', ['transaction_no' => 'inv-b', 'kind' => 'additional',
            'attempt_id' => $attempt->id, 'verified_amount' => 700, 'quote_currency' => 'CNY']);
        $this->assertDatabaseCount('v2_order_payment_receipts', 2);
        $this->assertDatabaseCount(self::TABLE, 0);
        $this->assertSame('inv-a', $this->order->fresh()->callback_no);
        Bus::assertDispatchedSync(OrderHandleJob::class, 1);
    }
}
