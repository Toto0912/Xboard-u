<?php

namespace Tests\Feature;

use App\Jobs\OrderHandleJob;
use App\Models\Order;
use App\Models\OrderPaymentAttempt;
use App\Models\OrderPaymentReceipt;
use App\Models\Payment;
use App\Models\Plan;
use App\Models\User;
use App\Services\Plugin\PluginManager;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BtcpayQuoteCurrencyTest extends TestCase
{
    use RefreshDatabase;

    private Payment $gateway;
    private Order $order;
    private array $invoices = [];
    private array $createChanges = [];

    protected function setUp(): void
    {
        parent::setUp();
        require_once base_path('plugins-core/Btcpay/Plugin.php');
        $plugin = new \Plugin\Btcpay\Plugin('btcpay');
        $plugin->boot();
        $manager = $this->mock(PluginManager::class);
        $manager->shouldReceive('initializeEnabledPlugins')->andReturnNull();
        $manager->shouldReceive('getEnabledPaymentPlugins')->andReturn([$plugin]);
        $user = User::create(['email' => 'btcpay@example.test', 'password' => 'test',
            'uuid' => (string) Str::uuid(), 'token' => Str::random(32)]);
        Sanctum::actingAs($user);
        $plan = Plan::create(['name' => 'Monthly', 'group_id' => 1, 'transfer_enable' => 5, 'capacity_limit' => null,
            'show' => true, 'sell' => true, 'renew' => true, 'prices' => ['monthly' => 10]]);
        $this->order = Order::create(['user_id' => $user->id, 'plan_id' => $plan->id, 'trade_no' => 'trade-1',
            'total_amount' => 1000, 'period' => 'monthly', 'type' => Order::TYPE_NEW_PURCHASE, 'status' => Order::STATUS_PENDING]);
        $this->gateway = Payment::create(['payment' => 'BTCPay', 'name' => 'Shop', 'enable' => true,
            'uuid' => Str::random(32), 'handling_fee_fixed' => 25, 'config' => ['btcpay_url' => 'https://gateway.example/',
                'btcpay_storeId' => 'shop', 'btcpay_api_key' => 'read-write', 'btcpay_webhook_key' => 'webhook']]);
        Bus::fake([OrderHandleJob::class]);
        Http::fake(function (Request $request) {
            $url = 'https://gateway.example/api/v1/stores/shop/invoices';
            $this->assertTrue($request->hasHeader('Authorization', 'token read-write'));
            if ($request->method() === 'POST' && $request->url() === $url) {
                $id = 'invoice-' . (count($this->invoices) + 1);
                $invoice = array_replace($request->data(), ['id' => $id, 'status' => 'New',
                    'additionalStatus' => 'None', 'checkoutLink' => "https://gateway.example/i/{$id}"], $this->createChanges);
                $this->invoices[$id] = $invoice;
                return Http::response($invoice, 201);
            }
            $this->assertSame('GET', $request->method());
            $this->assertStringStartsWith($url . '/', $request->url());
            return Http::response($this->invoices[basename($request->url())]);
        });
    }

    private function checkout(): TestResponse
    {
        return $this->postJson('/api/v1/user/order/checkout', ['trade_no' => $this->order->trade_no, 'method' => $this->gateway->id]);
    }

    private function notify(string $id): TestResponse
    {
        $body = json_encode(['invoiceId' => $id]);
        return $this->call('POST', '/api/v1/guest/payment/notify/BTCPay/' . $this->gateway->uuid, [], [], [], [
            'CONTENT_TYPE' => 'application/json', 'HTTP_BTCPAY_SIG' => 'sha256=' . hash_hmac('sha256', $body, 'webhook'),
        ], $body);
    }

    public function test_checkout_freezes_currency_and_fees_and_settles_only_its_original_quote(): void
    {
        admin_setting(['currency' => ' usd ']);
        $this->checkout()->assertOk();
        $invoice = $this->invoices['invoice-1'];
        $this->assertSame('USD', $invoice['currency']);
        $this->assertSame('10.25', $invoice['amount']);
        $this->assertSame(0, $invoice['checkout']['paymentTolerance']);
        $reference = $invoice['metadata']['orderId'];
        $this->assertDatabaseHas('v2_order_payment_attempts', ['merchant_reference' => $reference, 'quote_currency' => 'USD']);

        admin_setting(['currency' => 'EUR']);
        $this->checkout()->assertOk();
        $this->assertSame('EUR', $this->invoices['invoice-2']['currency']);
        $this->assertNotSame($reference, $this->invoices['invoice-2']['metadata']['orderId']);
        $settled = array_replace($invoice, ['status' => 'Settled']);
        foreach ([['currency' => 'EUR'], ['amount' => '10.00'], ['currency' => null], ['amount' => null],
            ['paidAmount' => '10.24'], ['additionalStatus' => 'PaidPartial'], ['additionalStatus' => 'Marked'],
            ['checkout' => []], ['checkout' => ['paymentTolerance' => 1.5]], ['checkout' => ['paymentTolerance' => null]]] as $change) {
            $this->invoices['invoice-1'] = array_replace($settled, $change);
            $this->assertGreaterThanOrEqual(400, $this->notify('invoice-1')->status());
            $this->assertSame(Order::STATUS_PENDING, $this->order->fresh()->status);
            $this->assertDatabaseCount(OrderPaymentReceipt::TABLE, 0);
        }
        $this->invoices['invoice-1'] = array_replace($settled, ['paidAmount' => '10.25', 'additionalStatus' => 'Marked']);
        $this->notify('invoice-1')->assertOk();
        $this->notify('invoice-1')->assertOk();
        $this->assertDatabaseHas(OrderPaymentReceipt::TABLE, ['quote_currency' => 'USD',
            'expected_amount' => 1025, 'verified_amount' => 1025, 'kind' => 'applied']);
        $this->assertDatabaseCount(OrderPaymentReceipt::TABLE, 1);
        Bus::assertDispatchedSync(OrderHandleJob::class, 1);
    }

    public function test_invalid_site_currency_or_a_gateway_changed_quote_cannot_return_a_payment_link(): void
    {
        admin_setting(['currency' => 'U SD']);
        $this->assertGreaterThanOrEqual(400, $this->checkout()->status());
        $this->assertCount(0, $this->invoices);
        admin_setting(['currency' => 'USD']);
        foreach ([['currency' => 'CNY'], ['amount' => '10.20']] as $change) {
            $this->createChanges = $change;
            $this->assertGreaterThanOrEqual(400, $this->checkout()->status());
        }
        $this->assertSame(Order::STATUS_PENDING, $this->order->fresh()->status);
    }

    public function test_old_unpriced_attempt_is_held_once_for_review_under_its_original_channel(): void
    {
        $old = OrderPaymentAttempt::quote($this->order, $this->gateway, true);
        $invoice = ['id' => 'old', 'amount' => '10.25', 'status' => 'Settled', 'currency' => 'CNY',
            'additionalStatus' => 'PaidLate', 'checkout' => ['paymentTolerance' => 0],
            'metadata' => ['orderId' => $old->merchant_reference]];
        admin_setting(['currency' => 'USD']);
        $this->gateway->update(['enable' => false]);
        foreach ([['currency' => 'USD'], ['amount' => '10.00']] as $change) {
            $this->invoices['old'] = array_replace($invoice, $change);
            $this->notify('old')->assertStatus(400);
            $this->assertDatabaseCount(OrderPaymentReceipt::TABLE, 0);
        }
        $this->invoices['old'] = $invoice;
        $this->notify('old')->assertOk();
        $this->notify('old')->assertOk();
        $this->assertSame(Order::STATUS_PENDING, $this->order->fresh()->status);
        $this->assertNull($old->fresh()->confirmed_at);
        $this->assertDatabaseCount(OrderPaymentReceipt::TABLE, 1);
        $this->assertDatabaseHas(OrderPaymentReceipt::TABLE, ['attempt_id' => $old->id, 'kind' => 'verify_history',
            'transaction_no' => 'old', 'expected_amount' => 1025, 'verified_amount' => 1025, 'quote_currency' => 'CNY']);
        $this->artisan('payment:review-additional', ['--trade-no' => $this->order->trade_no])
            ->expectsOutputToContain('verify_history')->assertSuccessful();
        Bus::assertNotDispatched(OrderHandleJob::class);
    }

    public function test_public_historical_invoice_needs_a_channel_binding_and_recorded_replays_do_not_fulfill(): void
    {
        $invoice = ['id' => 'old-public', 'amount' => '10.10', 'currency' => 'CNY', 'status' => 'Settled',
            'additionalStatus' => 'PaidOver', 'metadata' => ['orderId' => $this->order->trade_no]];
        $this->invoices['old-public'] = $invoice;
        $this->notify('old-public')->assertStatus(400);
        $this->assertDatabaseCount(OrderPaymentReceipt::TABLE, 0);

        $this->order->update(['payment_id' => $this->gateway->id, 'handling_amount' => 10]);
        $this->notify('old-public')->assertOk();
        $this->assertDatabaseHas(OrderPaymentReceipt::TABLE, ['attempt_id' => null, 'kind' => 'verify_history',
            'expected_amount' => 1010, 'verified_amount' => 1010]);
        $this->order->update(['paid_at' => time(), 'status' => Order::STATUS_COMPLETED, 'callback_no' => 'prior-payment']);
        $this->invoices['prior-payment'] = array_replace($invoice, ['id' => 'prior-payment']);
        $this->notify('prior-payment')->assertOk();
        $this->assertDatabaseCount(OrderPaymentReceipt::TABLE, 1);
        Bus::assertNotDispatched(OrderHandleJob::class);
    }
}
