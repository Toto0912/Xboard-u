<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\OrderPaymentAttempt;
use App\Models\Payment;
use App\Models\Plan;
use App\Models\User;
use App\Services\OrderService;
use App\Services\Plugin\HookManager;
use App\Services\Plugin\PluginManager;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DisabledPaymentCallbackTest extends TestCase
{
    use RefreshDatabase;

    private Payment $channel;
    private User $user;
    private Order $order;

    protected function setUp(): void
    {
        parent::setUp();
        require_once base_path('plugins-core/Epay/Plugin.php');
        $plugin = new \Plugin\Epay\Plugin('epay');
        $plugin->boot();
        $manager = $this->mock(PluginManager::class);
        $manager->shouldReceive('initializeEnabledPlugins')->andReturnNull();
        $manager->shouldReceive('getEnabledPaymentPlugins')->andReturn([$plugin]);
        $this->channel = $this->gateway();
        $this->user = User::create(['email' => 'buyer@example.test', 'password' => 'fixture',
            'uuid' => 'a5817b30-1099-43ca-a2a0-5b46bb4e9e7c', 'token' => str_repeat('c', 32)]);
        Sanctum::actingAs($this->user);
        $plan = Plan::create(['name' => 'Subscription', 'group_id' => 7, 'transfer_enable' => 8,
            'prices' => [Plan::PERIOD_MONTHLY => 10], 'capacity_limit' => null, 'show' => true, 'sell' => true]);
        $this->order = Order::create(['user_id' => $this->user->id, 'trade_no' => 'disabled-quote', 'plan_id' => $plan->id,
            'type' => Order::TYPE_NEW_PURCHASE, 'period' => Plan::PERIOD_MONTHLY, 'total_amount' => 1000, 'status' => Order::STATUS_PENDING]);
    }

    private function gateway(): Payment
    {
        return Payment::create(['name' => 'Channel', 'uuid' => bin2hex(random_bytes(16)), 'payment' => 'EPay',
            'enable' => true, 'handling_fee_fixed' => 25,
            'config' => ['pid' => '77', 'key' => 'test-key', 'url' => 'https://payments.invalid']]);
    }

    private function checkout(Payment $channel): TestResponse
    {
        return $this->postJson('/api/v1/user/order/checkout', ['trade_no' => $this->order->trade_no, 'method' => $channel->id]);
    }

    private function issueQuote(Payment $channel): string
    {
        $url = $this->checkout($channel)->assertOk()->json('data');
        parse_str(parse_url($url, PHP_URL_QUERY), $query);
        return $query['out_trade_no'];
    }

    private function notify(string $orderReference, bool $valid = true, string $transaction = 'settlement-91'): TestResponse
    {
        $data = ['pid' => '77', 'trade_status' => 'TRADE_SUCCESS', 'trade_no' => $transaction,
            'out_trade_no' => $orderReference, 'money' => '10.25'];
        ksort($data);
        $data['sign'] = $valid ? md5(urldecode(http_build_query($data)) . 'test-key') : 'invalid';
        return $this->postJson('/api/v1/guest/payment/notify/EPay/' . $this->channel->uuid, $data);
    }

    public function test_checkout_only_offers_enabled_channels_with_a_registered_method(): void
    {
        $unavailable = $this->gateway();
        $unavailable->update(['payment' => 'RemovedGateway']);
        $this->gateway()->update(['enable' => false]);

        $this->getJson('/api/v1/user/order/getPaymentMethod')->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $this->channel->id);
        $this->checkout($unavailable)->assertStatus(400);
        $this->assertDatabaseCount('v2_order_payment_attempts', 0);
        $this->assertNull($this->order->fresh()->payment_id);
        $this->assertNotEmpty($this->issueQuote($this->channel));
    }

    public function test_issued_quote_can_settle_once_after_disabling_even_if_the_buyer_switched_channels(): void
    {
        $reference = $this->issueQuote($this->channel);
        $this->issueQuote($this->gateway());
        $this->channel->update(['enable' => false]);
        $this->checkout($this->channel)->assertStatus(400);
        $this->assertDatabaseCount('v2_order_payment_attempts', 2);
        $this->notify($reference, false)->assertStatus(422);
        $this->assertDatabaseCount('v2_order_payment_receipts', 0);
        $this->notify($reference)->assertOk()->assertContent('success');
        $expires = $this->user->fresh()->expired_at;
        $this->assertGreaterThan(time(), $expires);
        $hooks = 0;
        HookManager::register('payment.notify.verified', function () use (&$hooks) { $hooks++; });
        HookManager::register('payment.notify.success', function () use (&$hooks) { $hooks++; });
        $this->notify($reference)->assertOk();
        $this->assertSame(0, $hooks);
        $this->assertSame($expires, $this->user->fresh()->expired_at);
        $this->assertEquals($this->order->plan_id, $this->user->fresh()->plan_id);
        $this->assertSame(Order::STATUS_COMPLETED, (int) $this->order->fresh()->status);
        $this->assertDatabaseHas('v2_order_payment_receipts', ['payment_id' => $this->channel->id, 'kind' => 'applied', 'expected_amount' => 1025]);
        $this->assertDatabaseCount('v2_order_payment_receipts', 1);
    }

    public function test_cancelled_public_quote_is_recorded_once_without_opening_the_order(): void
    {
        $this->order->update(['payment_id' => $this->channel->id, 'handling_amount' => 25]);
        $this->issueQuote($this->gateway()); // Preserves the original public quote before the channel switch.
        $this->assertTrue((new OrderService($this->order))->cancel());
        $this->channel->update(['enable' => false]);
        $this->notify($this->order->trade_no)->assertOk();
        $this->notify($this->order->trade_no)->assertOk();
        $this->assertSame(Order::STATUS_CANCELLED, (int) $this->order->fresh()->status);
        $this->assertNull($this->user->fresh()->plan_id);
        $this->assertDatabaseCount('v2_cancelled_order_payments', 1);
        $this->assertDatabaseCount('v2_order_payment_receipts', 1);
        $this->assertDatabaseHas('v2_order_payment_receipts', ['payment_id' => $this->channel->id, 'kind' => 'cancelled', 'expected_amount' => 1025]);
    }

    public function test_public_order_number_requires_a_matching_public_quote_or_an_order_predating_quotes(): void
    {
        $this->channel->update(['enable' => false]);
        $this->notify($this->order->trade_no)->assertStatus(400);
        $this->order->update(['payment_id' => $this->gateway()->id, 'handling_amount' => 25]);
        $this->notify($this->order->trade_no)->assertStatus(400);
        $this->assertDatabaseCount('v2_order_payment_receipts', 0);

        $this->order->update(['payment_id' => $this->channel->id]);
        $this->notify($this->order->trade_no)->assertOk();
        $this->assertDatabaseCount('v2_order_payment_attempts', 0);
        $this->assertDatabaseHas('v2_order_payment_receipts', ['payment_id' => $this->channel->id, 'expected_amount' => 1025]);
    }

    public function test_disabled_channel_cannot_use_another_channels_reference_or_substitute_a_public_order_number(): void
    {
        $other = $this->gateway();
        $this->order->update(['payment_id' => $other->id]);
        $wrongReference = $this->issueQuote($other);
        $this->issueQuote($this->channel);
        $this->channel->update(['enable' => false]);
        $this->notify($wrongReference)->assertStatus(400);
        $this->notify($this->order->trade_no)->assertStatus(400);
        $this->assertNull(OrderPaymentAttempt::where('order_id', $this->order->id)->max('confirmed_at'));
        $this->assertDatabaseCount('v2_order_payment_receipts', 0);
        $this->assertSame(Order::STATUS_PENDING, (int) $this->order->fresh()->status);
    }

    public function test_legacy_channel_binding_is_rechecked_on_the_locked_order(): void
    {
        $this->channel->update(['enable' => false]);
        $this->order->update(['payment_id' => $this->channel->id, 'handling_amount' => 25]);
        $other = $this->gateway();
        HookManager::register('payment.notify.verified', fn () => $this->order->update(['payment_id' => $other->id]));
        $this->notify($this->order->trade_no)->assertStatus(400);
        $this->assertDatabaseCount('v2_order_payment_receipts', 0);
        $this->assertSame(Order::STATUS_PENDING, (int) $this->order->fresh()->status);
    }

    public function test_already_recorded_legacy_payment_can_be_acknowledged_after_its_old_channel_was_disabled(): void
    {
        // Legacy checkout overwrote the selected channel without preserving the older quote.
        $this->order->update(['payment_id' => $this->gateway()->id]);
        $this->assertTrue((new OrderService($this->order))->cancel());
        $this->notify($this->order->trade_no)->assertOk();
        $this->channel->update(['enable' => false]);
        $hooks = 0;
        HookManager::register('payment.notify.verified', function () use (&$hooks) { $hooks++; });
        HookManager::register('payment.notify.success', function () use (&$hooks) { $hooks++; });
        $this->notify($this->order->trade_no)->assertOk();
        $this->notify($this->order->trade_no, transaction: 'new-transaction')->assertStatus(400);
        $this->assertDatabaseCount('v2_order_payment_receipts', 1);

        // Sites predating the general receipt ledger only have the cancelled-payment record.
        DB::table('v2_order_payment_receipts')->delete();
        $this->notify($this->order->trade_no)->assertOk();
        $this->assertSame(0, $hooks);
        $this->assertDatabaseCount('v2_order_payment_receipts', 0);
        $this->assertDatabaseCount('v2_cancelled_order_payments', 1);
        $this->assertSame(Order::STATUS_CANCELLED, (int) $this->order->fresh()->status);
    }

    public function test_public_order_reference_cannot_replay_a_receipt_that_records_a_private_attempt(): void
    {
        $reference = $this->issueQuote($this->channel);
        $this->channel->update(['enable' => false]);
        $this->notify($reference)->assertOk();
        $verified = 0;
        HookManager::register('payment.notify.verified', function () use (&$verified) { $verified++; });
        $this->notify($this->order->trade_no)->assertStatus(400);
        $this->assertSame(0, $verified);
        $this->assertDatabaseCount('v2_order_payment_receipts', 1);
    }
}
