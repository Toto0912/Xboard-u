<?php

namespace Tests\Feature\Order;

use App\Jobs\OrderHandleJob;
use App\Models\Order;
use App\Models\OrderPaymentAttempt;
use App\Models\Payment;
use App\Models\Plan;
use App\Models\User;
use App\Services\OrderService;
use App\Services\Plugin\AbstractPlugin;
use App\Services\Plugin\HookManager;
use App\Services\Plugin\PluginManager;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PaymentAttemptTest extends TestCase
{
    use RefreshDatabase;

    private Order $order;
    private Payment $a;
    private Payment $b;

    protected function setUp(): void
    {
        parent::setUp();
        require_once base_path('plugins-core/Epay/Plugin.php');
        require_once base_path('plugins-core/CoinPayments/Plugin.php');
        $epay = new \Plugin\Epay\Plugin('epay');
        $epay->boot();
        $coin = new \Plugin\CoinPayments\Plugin('coin_payments');
        $coin->boot();
        // A third-party plugin can legitimately look up the panel order using trade_no.
        $legacy = new class('legacy') extends AbstractPlugin implements \App\Contracts\PaymentInterface {
            public function boot(): void {}
            public function form(): array { return []; }
            public function pay($order): array {
                Order::where('trade_no', $order['trade_no'])->firstOrFail();
                return $this->delegate()->pay($order);
            }
            public function notify($params) {
                $result = $this->delegate()->notify($params);
                if (is_array($result)) {
                    unset($result['transaction_no']); // Older plugins may return a delivery ID only.
                }
                return $result;
            }
            private function delegate(): \Plugin\Epay\Plugin {
                $epay = new \Plugin\Epay\Plugin('epay');
                $epay->setConfig($this->config);
                return $epay;
            }
        };
        HookManager::registerFilter('available_payment_methods', static fn($methods) => $methods + ['Legacy' => ['plugin_code'=>'legacy']]);
        $plugins = $this->mock(PluginManager::class);
        $plugins->shouldReceive('initializeEnabledPlugins')->andReturnNull();
        $plugins->shouldReceive('getEnabledPaymentPlugins')->andReturn([$epay, $legacy, $coin]);
        Bus::fake([OrderHandleJob::class]);
        $user = User::create(['email' => 'buyer@example.test', 'password' => 'fixture',
            'uuid' => '1ec79b57-0457-40b6-9e15-80189413e55b', 'token' => str_repeat('b', 32)]);
        $plan = Plan::create(['name'=>'Monthly', 'group_id'=>7, 'transfer_enable'=>5,
            'prices'=>[Plan::PERIOD_MONTHLY => 10], 'capacity_limit'=>null, 'show'=>true, 'sell'=>true]);
        Sanctum::actingAs($user);
        $this->order = Order::create(['user_id'=>$user->id, 'plan_id'=>$plan->id, 'trade_no'=>'order123',
            'period'=>Plan::PERIOD_MONTHLY, 'type'=>Order::TYPE_NEW_PURCHASE, 'total_amount'=>1000, 'status'=>0]);
        $this->a = $this->gateway('channel-a', 21);
        $this->b = $this->gateway('channel-b', 75);
    }

    private function gateway(string $name, int $fee): Payment
    {
        return Payment::create(['payment'=>'EPay', 'uuid'=>bin2hex(random_bytes(16)), 'name'=>$name,
            'enable'=>true, 'handling_fee_fixed'=>$fee,
            'config'=>['url'=>'https://gateway.invalid', 'pid'=>$name, 'key'=>'test-'.$name]]);
    }

    private function checkout(Payment $p): array
    {
        $r = $this->postJson('/api/v1/user/order/checkout', ['trade_no'=>$this->order->trade_no, 'method'=>$p->id]);
        $this->assertSame(200, $r->status(), $r->getContent());
        parse_str(parse_url($r->json('data'), PHP_URL_QUERY), $query);
        $this->assertSame($p->name, $query['pid']);
        $this->assertStringEndsWith('/#/order/'.$this->order->trade_no, $query['return_url']);
        return $query;
    }

    private function notify(Payment $p, array $link, string $gatewayId = 'gateway-a')
    {
        $message=['money'=>$link['money'], 'out_trade_no'=>$link['out_trade_no'], 'pid'=>$p->name,
            'trade_no'=>$gatewayId, 'trade_status'=>'TRADE_SUCCESS'];
        ksort($message);
        $message['sign']=md5(urldecode(http_build_query($message)).'test-'.$p->name);
        return $this->postJson('/api/v1/guest/payment/notify/'.$p->payment.'/'.$p->uuid, $message);
    }

    public function test_first_gateway_receipt_after_switch_settles_at_original_quote(): void
    {
        $first = $this->checkout($this->a);
        $second = $this->checkout($this->b);
        $this->assertEquals(10.21, $first['money']);
        $this->assertEquals(10.75, $second['money']);
        $this->a->update(['handling_fee_fixed'=>99]);
        $this->notify($this->a, $first)->assertOk()->assertContent('success');
        $this->notify($this->a, $first)->assertOk();
        $paid=$this->order->fresh();
        $this->assertEquals($this->a->id, $paid->payment_id);
        $this->assertSame(21, $paid->handling_amount);
        $this->assertSame('gateway-a', $paid->callback_no);
        Bus::assertDispatchedSync(OrderHandleJob::class, 1);
    }

    public function test_requoted_channel_has_immutable_amount_and_both_paid_links_leave_evidence(): void
    {
        $original = $this->checkout($this->a);
        $same = $this->checkout($this->a);
        $this->assertSame($original['out_trade_no'], $same['out_trade_no']);
        $this->a->update(['handling_fee_fixed'=>35]);
        $repriced = $this->checkout($this->a);
        $this->assertNotSame($original['out_trade_no'], $repriced['out_trade_no']);
        $this->assertEquals(10.35, $repriced['money']);
        $this->notify($this->b, $original)->assertStatus(400);
        $this->notify($this->a, array_replace($original, ['money'=>'10.35']))->assertStatus(400);
        $this->assertSame(0, OrderPaymentAttempt::whereNotNull('confirmed_at')->count());
        $this->notify($this->a, $original, 'first-receipt')->assertOk();
        $this->notify($this->a, $repriced, 'second-receipt')->assertOk();
        $this->assertEquals(2, OrderPaymentAttempt::whereNotNull('confirmed_at')->count());
        $this->assertSame(21, $this->order->fresh()->handling_amount);
        $this->assertSame('first-receipt', $this->order->fresh()->callback_no);
        $this->postJson('/api/v1/user/order/checkout', ['trade_no'=>$this->order->trade_no, 'method'=>$this->b->id])->assertStatus(400);
        Bus::assertDispatchedSync(OrderHandleJob::class, 1);
    }

    public function test_cancellation_uses_the_quote_for_each_actual_channel(): void
    {
        $a = $this->checkout($this->a);
        $b = $this->checkout($this->b);
        $this->assertTrue((new OrderService($this->order))->cancel());
        $this->notify($this->a, $a)->assertOk();
        $this->notify($this->a, $a)->assertOk();
        $this->notify($this->b, $b, 'gateway-b')->assertOk();
        $this->assertDatabaseCount('v2_cancelled_order_payments', 2);
        $this->assertDatabaseHas('v2_cancelled_order_payments', ['payment_id'=>$this->a->id, 'expected_amount'=>1021]);
        $this->assertDatabaseHas('v2_cancelled_order_payments', ['payment_id'=>$this->b->id, 'expected_amount'=>1075]);
        Bus::assertNotDispatched(OrderHandleJob::class);
    }

    public function test_two_real_payments_for_one_quote_are_reviewed_once_without_reopening_the_order(): void
    {
        $quote = $this->checkout($this->a);
        $this->notify($this->a, $quote, 'first-payment')->assertOk();
        $this->notify($this->a, $quote, 'first-payment')->assertOk();
        $this->assertDatabaseCount('v2_order_payment_receipts', 1);
        $this->order->update(['status' => Order::STATUS_COMPLETED]);
        $this->notify($this->a, $quote, 'extra-payment')->assertOk();
        $this->notify($this->a, $quote, 'extra-payment')->assertOk();
        $receipts = DB::table('v2_order_payment_receipts')->where('order_id', $this->order->id);
        $this->assertSame(2, $receipts->count());
        $first = (clone $receipts)->where('kind', 'applied')->sole();
        $this->assertSame('first-payment', $first->transaction_no);
        $this->artisan('payment:review-additional', ['--resolve' => (string) $first->id, '--note' => 'wrong row'])
            ->assertFailed();
        $extra = $receipts->where('kind', 'additional')->sole();
        $this->assertSame('extra-payment', $extra->transaction_no);
        $this->assertSame(1021, (int) $extra->expected_amount);
        $this->assertSame(1021, (int) $extra->verified_amount);
        $this->assertSame('first-payment', OrderPaymentAttempt::where('order_id', $this->order->id)->value('confirmed_transaction'));
        $this->assertSame('first-payment', $this->order->fresh()->callback_no);
        $this->assertSame(Order::STATUS_COMPLETED, (int) $this->order->fresh()->status);
        $this->artisan('payment:review-additional', ['--trade-no' => $this->order->trade_no])
            ->expectsOutputToContain('extra-payment')->assertSuccessful();
        $this->artisan('payment:review-additional', ['--resolve' => (string) $extra->id, '--note' => 'ticket 42'])
            ->assertSuccessful();
        $this->notify($this->a, $quote, 'extra-payment')->assertOk();
        $this->assertDatabaseHas('v2_order_payment_receipts', ['id' => $extra->id, 'review_note' => 'ticket 42']);
        $this->assertDatabaseCount('v2_cancelled_order_payments', 0);
        Bus::assertDispatchedSync(OrderHandleJob::class, 1);
    }

    public function test_verified_transaction_cannot_be_claimed_by_a_second_order_on_the_same_channel(): void
    {
        $first = $this->checkout($this->a);
        $this->notify($this->a, $first, 'one-settled-invoice')->assertOk();
        $this->order = Order::create(['user_id' => $this->order->user_id, 'plan_id' => $this->order->plan_id,
            'trade_no' => 'other-order', 'period' => Plan::PERIOD_MONTHLY, 'type' => Order::TYPE_NEW_PURCHASE,
            'total_amount' => 1000, 'status' => Order::STATUS_PENDING]);
        $second = $this->checkout($this->a);
        $this->notify($this->a, $second, 'one-settled-invoice')->assertStatus(400);
        $this->assertSame(Order::STATUS_PENDING, (int) $this->order->fresh()->status);
        $this->assertNull(OrderPaymentAttempt::where('order_id', $this->order->id)->value('confirmed_at'));
        $this->assertDatabaseCount('v2_order_payment_receipts', 1);
        $otherGateway = $this->checkout($this->b);
        $this->notify($this->b, $otherGateway, 'one-settled-invoice')->assertOk();
        $this->assertDatabaseCount('v2_order_payment_receipts', 2);
        Bus::assertDispatchedSync(OrderHandleJob::class, 2);
    }

    public function test_callback_only_plugins_do_not_treat_different_delivery_ids_as_real_payments(): void
    {
        $this->b->update(['payment' => 'Legacy']);
        $link = $this->checkout($this->b);
        $this->notify($this->b, $link, 'event-1')->assertOk();
        $this->notify($this->b, $link, 'event-2')->assertOk();
        $this->assertDatabaseCount('v2_order_payment_receipts', 0);
        $this->assertSame('event-1', $this->order->fresh()->callback_no);
        Bus::assertDispatchedSync(OrderHandleJob::class, 1);
    }

    public function test_first_delivery_after_upgrade_preserves_the_historical_payment_confirmation(): void
    {
        $quote = $this->checkout($this->a);
        $attempt = OrderPaymentAttempt::where('merchant_reference', $quote['out_trade_no'])->sole();
        $attempt->update(['confirmed_at' => time(), 'confirmed_transaction' => 'historical-external']);
        $this->order->update(['status' => Order::STATUS_COMPLETED, 'paid_at' => time(), 'callback_no' => 'historical-external']);
        $this->notify($this->a, $quote, 'historical-external')->assertOk();
        $this->assertDatabaseHas('v2_order_payment_receipts', ['kind' => 'historical', 'transaction_no' => 'historical-external']);
        $this->notify($this->a, $quote, 'later-external')->assertOk();
        $this->assertDatabaseHas('v2_order_payment_receipts', ['kind' => 'additional', 'transaction_no' => 'later-external']);
        Bus::assertNotDispatched(OrderHandleJob::class);
    }

    public function test_receipt_write_failure_is_retryable_without_confirming_or_opening_the_order(): void
    {
        $quote = $this->checkout($this->a);
        $unavailable = true;
        DB::connection()->beforeExecuting(function ($sql) use (&$unavailable) {
            if ($unavailable && str_starts_with(strtolower($sql), 'insert') && str_contains($sql, 'v2_order_payment_receipts')) {
                throw new \RuntimeException('receipt persistence unavailable');
            }
        });
        $this->notify($this->a, $quote, 'retry-me')->assertStatus(400);
        $this->assertNull(OrderPaymentAttempt::where('order_id', $this->order->id)->value('confirmed_at'));
        $this->assertSame(Order::STATUS_PENDING, (int) $this->order->fresh()->status);
        Bus::assertNotDispatched(OrderHandleJob::class);
        $unavailable = false;
        $this->notify($this->a, $quote, 'retry-me')->assertOk();
        $this->assertDatabaseCount('v2_order_payment_receipts', 1);
        Bus::assertDispatchedSync(OrderHandleJob::class, 1);
    }

    public function test_legacy_paid_order_without_comparable_first_receipt_is_flagged_for_review(): void
    {
        $quote = $this->checkout($this->a);
        $this->order->update(['status' => Order::STATUS_COMPLETED, 'paid_at' => time(), 'callback_no' => 'manual_operation']);
        $this->notify($this->a, $quote, 'external-receipt')->assertOk();
        $this->notify($this->a, $quote, 'external-receipt')->assertOk();
        $this->assertDatabaseHas('v2_order_payment_receipts', ['kind' => 'verify_history', 'transaction_no' => 'external-receipt']);
        $this->artisan('payment:review-additional', ['--trade-no' => $this->order->trade_no])
            ->expectsOutputToContain('verify_history')->assertSuccessful();
        Bus::assertNotDispatched(OrderHandleJob::class);
    }

    public function test_separate_verified_transactions_can_share_the_same_callback_number(): void
    {
        foreach ([true, false] as $usesQuote) {
            $order = $usesQuote ? $this->order : $this->order->replicate();
            if (!$usesQuote) {
                $order->trade_no = 'public-reference';
                $order->save();
            }
            $attempt = $usesQuote ? OrderPaymentAttempt::quote($order, $this->a, true) : null;
            $service = new OrderService($order);
            $first = $order->trade_no . '-first';
            $extra = $order->trade_no . '-extra';
            foreach ([$first, $first, $extra, $extra] as $transaction) {
                $this->assertTrue($service->paid('shared-delivery-id', $this->a->id, $transaction, $attempt));
            }
            $this->assertDatabaseHas('v2_order_payment_receipts', ['order_id' => $order->id,
                'transaction_no' => $extra, 'kind' => 'additional']);
            $this->assertSame(2, DB::table('v2_order_payment_receipts')->where('order_id', $order->id)->count());
        }
        Bus::assertDispatchedSync(OrderHandleJob::class, 2);
    }

    public function test_pre_upgrade_link_survives_new_checkout_and_custom_plugin_keeps_public_reference(): void
    {
        $this->order->update(['payment_id'=>$this->a->id, 'handling_amount'=>21]);
        $this->b->update(['payment'=>'Legacy']);
        $b = $this->checkout($this->b);
        $this->b->update(['handling_fee_fixed'=>90]);
        $repeated = $this->checkout($this->b);
        $this->assertSame($this->order->trade_no, $b['out_trade_no']);
        $this->assertSame($b['money'], $repeated['money']);
        $this->assertEquals(10.75, $repeated['money']);
        $this->notify($this->a, ['out_trade_no'=>$this->order->trade_no, 'money'=>'10.21'])->assertOk();
        $this->notify($this->b, $b, 'legacy-b')->assertOk();
        $this->assertSame(21, $this->order->fresh()->handling_amount);
        $this->assertEquals($this->a->id, $this->order->fresh()->payment_id);
        $this->assertDatabaseHas('v2_order_payment_attempts', ['payment_id'=>$this->b->id, 'confirmed_transaction'=>'legacy-b']);
        Bus::assertDispatchedSync(OrderHandleJob::class, 1);
    }

    public function test_verified_gross_recovers_fee_for_a_legacy_order_switched_before_upgrade(): void
    {
        $this->order->update(['payment_id'=>$this->b->id, 'handling_amount'=>75]);
        $this->notify($this->a, ['out_trade_no'=>$this->order->trade_no, 'money'=>'10.21'])->assertOk();
        $this->assertEquals($this->a->id, $this->order->fresh()->payment_id);
        $this->assertSame(21, $this->order->fresh()->handling_amount);
    }

    private function checkoutCoin(string $currency): array
    {
        $this->a->update(['payment' => 'CoinPayments', 'config' => ['coinpayments_merchant_id' => 'fixture-merchant',
            'coinpayments_ipn_secret' => 'ipn-fixture', 'coinpayments_currency' => $currency]]);
        $response = $this->postJson('/api/v1/user/order/checkout', ['trade_no' => $this->order->trade_no, 'method' => $this->a->id]);
        $response->assertOk();
        parse_str(parse_url($response->json('data'), PHP_URL_QUERY), $link);
        return ['item_number' => $link['item_number'], 'merchant' => $link['merchant'], 'txn_id' => 'fixture-receipt',
            'ipn_mode' => 'hmac', 'ipn_type' => 'simple', 'status' => '100', 'currency1' => $link['currency'], 'amount1' => $link['amountf']];
    }

    private function sendCoin(array $fields, ?string $signature = null, string $query = '', string $extraBody = '')
    {
        // Preserve original field order, escaped spaces, and a trailing optional field as received over HTTP.
        $body = http_build_query($fields).'&note=space%20and%2Bsign'.$extraBody;
        return $this->call('POST', '/api/v1/guest/payment/notify/CoinPayments/'.$this->a->uuid.$query, [], [], [], [
            'CONTENT_TYPE' => 'application/x-www-form-urlencoded',
            'HTTP_HMAC' => $signature ?? hash_hmac('sha512', $body, 'ipn-fixture'),
        ], $body);
    }

    public function test_coinpayments_matches_the_signed_original_amount_and_frozen_currency_before_order_effects(): void
    {
        $usd = $this->checkoutCoin('USD');
        $eur = $this->checkoutCoin('EUR');
        $this->assertSame('10.21', $usd['amount1']);
        $this->assertNotSame($usd['item_number'], $eur['item_number']);
        $this->assertSame($eur['item_number'], $this->checkoutCoin('EUR')['item_number']);
        $this->sendCoin($usd, 'invalid')->assertServerError();
        $this->sendCoin(array_replace($usd, ['merchant' => 'other']))->assertServerError();
        $this->sendCoin(array_replace($usd, ['ipn_type' => 'deposit']))->assertServerError();
        $this->sendCoin(array_replace($usd, ['status' => 'invalid']))->assertServerError();
        $this->sendCoin(array_diff_key($usd, ['currency1' => true]), null, '?currency1=USD')->assertServerError();
        $this->sendCoin($usd, null, '', '&currency1=USD')->assertServerError();
        $this->sendCoin(array_replace($usd, ['amount1' => '10.205']))->assertStatus(422);
        foreach ([['amount1' => '10.20'], ['amount1' => '10.22'], ['currency1' => 'EUR']] as $change) {
            $this->sendCoin(array_replace($usd, $change))->assertStatus(400);
        }
        $this->assertSame(Order::STATUS_PENDING, $this->order->fresh()->status);
        $this->assertSame(0, OrderPaymentAttempt::whereNotNull('confirmed_at')->count());
        Bus::assertNotDispatched(OrderHandleJob::class);
        $this->a->update(['handling_fee_fixed' => 77]);
        $settled = array_replace($usd, ['status' => '2', 'amount1' => '10.21000000', 'currency2' => 'BTC',
            'amount2' => '0.00010000', 'received_amount' => '0.0001']);
        $this->sendCoin($settled)->assertOk()->assertContent('IPN OK');
        $this->sendCoin($settled)->assertOk();
        $this->sendCoin(array_replace($eur, ['amount1' => '9.99']))->assertStatus(400);
        $this->assertSame(1, OrderPaymentAttempt::whereNotNull('confirmed_at')->count());
        $this->assertSame(21, $this->order->fresh()->handling_amount);
        Bus::assertDispatchedSync(OrderHandleJob::class, 1);
    }

    public function test_coinpayments_checks_reported_receipts_in_the_buyers_currency_at_full_precision(): void
    {
        $quote = $this->checkoutCoin('USD');
        $payable = ['currency2' => 'ETH', 'amount2' => '1.000000000000000002', 'received_amount' => '1.000000000000000002'];
        $this->sendCoin($quote + ['received_amount' => '1.000000000000000001'] + $payable)->assertServerError();
        $this->sendCoin($quote + ['received_amount' => '1', 'currency2' => 'ETH'])->assertServerError();
        $this->sendCoin($quote + ['received_amount' => '1', 'amount2' => '1'])->assertServerError();
        foreach ([
            ['currency2' => 'ETH USD'], ['received_amount' => ''], ['received_amount' => '1e1'],
            ['amount2' => '0'], ['amount2' => '-1'], ['amount2' => '1e0'],
        ] as $change) {
            $this->sendCoin($quote + $change + $payable)->assertServerError();
        }
        foreach ($payable as $name => $value) {
            $this->sendCoin($quote + $payable, null, '', '&'.$name.'='.$value)->assertServerError();
        }
        $this->assertSame(Order::STATUS_PENDING, $this->order->fresh()->status);
        $this->assertSame(0, OrderPaymentAttempt::whereNotNull('confirmed_at')->count());
        Bus::assertNotDispatched(OrderHandleJob::class);

        $payable['received_amount'] = '1.000000000000000003';
        $this->sendCoin($quote + $payable)->assertOk()->assertContent('IPN OK');
        $this->assertSame(1, OrderPaymentAttempt::whereNotNull('confirmed_at')->count());
        Bus::assertDispatchedSync(OrderHandleJob::class, 1);
    }

    public function test_coinpayments_can_settle_without_the_optional_received_amount(): void
    {
        $quote = $this->checkoutCoin('USD');
        $this->sendCoin($quote + ['currency2' => 'BTC', 'amount2' => '0.0001'])->assertOk()->assertContent('IPN OK');
        $this->assertSame(1, OrderPaymentAttempt::whereNotNull('confirmed_at')->count());
        Bus::assertDispatchedSync(OrderHandleJob::class, 1);
    }

    public function test_coinpayments_legacy_currency_is_not_guessed_and_cancelled_receipts_require_a_matching_quote(): void
    {
        $old = $this->checkoutCoin('USD');
        $attempt = OrderPaymentAttempt::where('merchant_reference', $old['item_number'])->firstOrFail();
        $attempt->update(['quote_currency' => null]);
        $this->sendCoin($old)->assertStatus(400);
        $public = array_replace($old, ['item_number' => $this->order->trade_no]);
        $this->sendCoin($public)->assertStatus(400);
        $new = $this->checkoutCoin('USD');
        $this->assertNotSame($old['item_number'], $new['item_number']);
        $this->assertTrue((new OrderService($this->order))->cancel());
        $this->sendCoin(array_replace($new, ['currency1' => 'EUR']))->assertStatus(400);
        $this->assertDatabaseCount('v2_cancelled_order_payments', 0);
        $this->assertSame(0, OrderPaymentAttempt::whereNotNull('confirmed_at')->count());
        $this->sendCoin($new)->assertOk();
        $this->assertDatabaseHas('v2_cancelled_order_payments', ['expected_amount' => 1021]);
        $this->sendCoin($public)->assertOk(); // Same gateway transaction already recorded for this cancelled order.
        $this->assertDatabaseCount('v2_cancelled_order_payments', 1);
        $this->order->update(['status' => Order::STATUS_COMPLETED, 'paid_at' => time(), 'callback_no' => $old['txn_id']]);
        $this->sendCoin($public)->assertOk();
        $this->sendCoin(array_replace($old, ['txn_id' => 'unrecorded']))->assertStatus(400);
        Bus::assertNotDispatched(OrderHandleJob::class);
    }
}
