<?php

namespace Tests\Feature\Order;

use App\Models\Order;
use App\Models\Coupon;
use App\Models\OrderPaymentAttempt;
use App\Models\Plan;
use App\Models\User;
use App\Services\OrderService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class CurrentPeriodCreditTest extends TestCase
{
    use RefreshDatabase;

    private CarbonImmutable $start;
    private Plan $plan;
    private Plan $target;
    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->start = CarbonImmutable::now('UTC')->startOfMonth();
        $fields = ['name' => 'Fixture', 'group_id' => 3, 'transfer_enable' => 100, 'prices' => ['monthly' => 100],
            'show' => true, 'sell' => true, 'capacity_limit' => null];
        $this->plan = Plan::create($fields);
        $this->target = Plan::create($fields);
        $this->user = User::create(['email' => 'credit@example.test', 'password' => 'fixture', 'token' => str_repeat('c', 32),
            'uuid' => '00000000-0000-4000-8000-000000000001', 'plan_id' => $this->plan->id, 'group_id' => 3,
            'transfer_enable' => 100 * 1073741824, 'expired_at' => $this->start->addMonth()->timestamp]);
        admin_setting(['surplus_enable' => 1, 'plan_change_enable' => 1, 'change_order_event_id' => 0]);
    }

    private function history(CarbonImmutable $date, array $fields = []): Order
    {
        return Order::create($fields + ['user_id' => $this->user->id, 'plan_id' => $this->plan->id,
            'type' => Order::TYPE_NEW_PURCHASE, 'period' => Plan::PERIOD_MONTHLY, 'trade_no' => uniqid('credit_'),
            'total_amount' => 1000, 'status' => Order::STATUS_COMPLETED, 'paid_at' => $date->timestamp,
            'created_at' => $date->timestamp]);
    }

    private function quoteHalfwayTo(CarbonImmutable $end): Order
    {
        $this->user->update(['expired_at' => $end->timestamp]);
        $duration = $end->timestamp - $this->start->timestamp;
        $this->travelTo($this->start->addSeconds(intdiv($duration, 2)));
        return OrderService::createFromRequest($this->user, $this->target, 'monthly')->fresh();
    }

    public function test_gap_excludes_lapsed_history_and_open_consumes_only_the_current_legacy_order(): void
    {
        $old = $this->history($this->start->subMonths(4));
        $current = $this->history($this->start, ['period' => 'month_price', 'type' => Order::TYPE_RENEWAL,
            'paid_at' => null, 'total_amount' => 0, 'balance_amount' => 3000]);
        $reset = $this->history($this->start->addDay(), ['period' => 'reset_price', 'type' => Order::TYPE_RESET_TRAFFIC]);
        $order = $this->quoteHalfwayTo($this->start->addMonth());
        $this->assertSame(1500, $order->surplus_amount);
        $this->assertSame(8500, $order->total_amount);
        $this->assertSame([$current->id], $order->surplus_order_ids);
        $this->assertTrue((new OrderService($order))->paid('fixture'));
        $this->assertSame(Order::STATUS_DISCOUNTED, $current->fresh()->status);
        $this->assertSame(Order::STATUS_COMPLETED, $old->fresh()->status);
        $this->assertSame(Order::STATUS_COMPLETED, $reset->fresh()->status);
        $this->assertSame($this->target->id, $this->user->fresh()->plan_id);
    }

    public function test_early_renewals_pool_only_what_was_paid_during_the_current_plan_segment(): void
    {
        $this->history($this->start->subDay(), ['period' => 'quarterly', 'total_amount' => 80000]);
        $first = $this->history($this->start, ['type' => Order::TYPE_UPGRADE, 'total_amount' => 1200,
            'balance_amount' => 500, 'surplus_amount' => 600, 'surplus_credit' => 300]);
        $second = $this->history($this->start->addDays(2), ['type' => Order::TYPE_RENEWAL,
            'total_amount' => 0, 'balance_amount' => 1000]);
        $free = $this->history($this->start->addDays(3), ['type' => Order::TYPE_RENEWAL, 'total_amount' => 0]);
        $order = $this->quoteHalfwayTo($this->start->addMonths(3));
        $this->assertSame([$first->id, $second->id, $free->id], $order->surplus_order_ids);
        $this->assertSame(1500, $order->surplus_amount);
    }

    public static function creditModes(): array
    {
        return ['time ratio with actual expiry' => [0, 1500], 'lesser of time and traffic' => [1, 600]];
    }

    #[DataProvider('creditModes')]
    public function test_real_expiry_and_configured_traffic_cap(int $event, int $credit): void
    {
        admin_setting(['change_order_event_id' => $event]);
        $this->user->update(['d' => 240 * 1073741824]);
        $paid = $this->history($this->start, ['period' => 'quarterly', 'total_amount' => 3000,
            'created_at' => $this->start->subDays(10)->timestamp]);
        $order = $this->quoteHalfwayTo($this->start->addMonths(2));
        $this->assertSame([$paid->id], $order->surplus_order_ids);
        $this->assertSame($credit, $order->surplus_amount);
    }

    public static function zeroCheckoutModes(): array
    {
        return [
            'time only despite exhausted quota' => [0, 100, false, true],
            'usage and time within original quote' => [1, 5, false, true],
            'usage no longer covers original quote' => [1, 90, false, false],
            'old quote with provable basis' => [1, 5, true, true],
            'old quote with insufficient basis' => [1, 90, true, false],
        ];
    }

    #[DataProvider('zeroCheckoutModes')]
    public function test_zero_checkout_uses_original_period_and_current_usage(int $event, int $used, bool $legacy, bool $accept): void
    {
        Sanctum::actingAs($this->user);
        admin_setting(['change_order_event_id' => $event]);
        $this->target->update(['prices' => ['monthly' => 2]]);
        $source = $this->history($this->start);
        Plan::whereKey($this->plan->id)->update(['updated_at' => $this->start->timestamp]);
        $order = $this->quoteHalfwayTo($this->start->addMonth());
        $this->assertSame(0, (int) $order->total_amount);
        $this->assertSame(500, (int) $order->surplus_amount);
        if ($legacy) {
            $order->update(['surplus_basis' => null]);
        }
        admin_setting(['change_order_event_id' => 1 - $event]);
        $this->travel(2)->days();
        $this->user->update(['d' => $used * 1073741824]);
        $this->postJson('/api/v1/user/order/checkout', ['trade_no' => $order->trade_no])
            ->assertStatus($accept ? 200 : 400);
        $this->assertSame($accept ? Order::STATUS_COMPLETED : Order::STATUS_PENDING, $order->fresh()->status);
        $this->assertSame($accept ? Order::STATUS_DISCOUNTED : Order::STATUS_COMPLETED, $source->fresh()->status);
        $this->assertSame($accept ? 300 : 0, (int) $this->user->fresh()->balance);
    }

    public function test_current_renewal_after_other_plan_and_discounted_history_is_the_only_eligible_order(): void
    {
        $this->history($this->start->subDays(5), ['period' => 'yearly']);
        $this->history($this->start->subDays(4), ['plan_id' => $this->target->id]);
        $this->history($this->start->subDays(3), ['type' => Order::TYPE_RENEWAL]);
        $this->history($this->start->subDays(2), ['status' => Order::STATUS_DISCOUNTED]);
        $paid = $this->history($this->start, ['type' => Order::TYPE_RENEWAL]);
        $order = $this->quoteHalfwayTo($this->start->addMonth());
        $this->assertSame(500, $order->surplus_amount);
        $this->assertSame([$paid->id], $order->surplus_order_ids);
    }

    public function test_lapsed_paid_history_does_not_fund_a_later_administrative_grant(): void
    {
        $this->history($this->start->subMonths(3));
        $order = $this->quoteHalfwayTo($this->start->addMonth());
        $this->assertSame(0, $order->surplus_amount);
        $this->assertSame([], $order->surplus_order_ids);
        $this->assertSame(10000, $order->total_amount);
    }

    public static function invalidTimeSources(): array
    {
        return array_map(fn ($reason) => [$reason], ['discounted', 'cancelled', 'missing', 'owner', 'plan', 'user moved', 'plan deleted', 'empty ids', 'invalid id']);
    }

    #[DataProvider('invalidTimeSources')]
    public function test_time_quote_requires_every_original_source_at_checkout(string $reason): void
    {
        Sanctum::actingAs($this->user);
        $this->target->update(['prices' => ['monthly' => 2]]);
        $first = $this->history($this->start);
        $second = $this->history($this->start->addDay(), ['type' => Order::TYPE_RENEWAL]);
        $upgrade = $this->quoteHalfwayTo($this->start->addMonths(2));
        $this->assertSame([$first->id, $second->id], $upgrade->surplus_order_ids);
        $this->assertSame(0, (int) $upgrade->total_amount);
        match ($reason) {
            'discounted' => $second->update(['status' => Order::STATUS_DISCOUNTED]),
            'cancelled' => $second->update(['status' => Order::STATUS_CANCELLED]),
            'missing' => $second->delete(),
            'owner' => $second->update(['user_id' => $this->user->id + 100]),
            'plan' => $second->update(['plan_id' => $this->target->id]),
            'user moved' => $this->user->update(['plan_id' => Plan::create(['name' => 'Other', 'group_id' => 3, 'transfer_enable' => 1])->id]),
            'plan deleted' => $this->plan->delete(),
            'empty ids' => $upgrade->update(['surplus_order_ids' => []]),
            'invalid id' => $upgrade->update(['surplus_order_ids' => [$first->id, $second->id . 'x']]),
        };
        $snapshot = fn () => [$upgrade->fresh()->getRawOriginal(), $this->user->fresh()->getRawOriginal(),
            $first->fresh()->getRawOriginal(), $second->fresh()?->getRawOriginal(), OrderPaymentAttempt::count()];
        $before = $snapshot();
        Queue::fake();
        $response = $this->postJson('/api/v1/user/order/checkout', ['trade_no' => $upgrade->trade_no])->assertStatus(400);
        $this->assertStringContainsString('取消', $response->json('message'));
        $this->assertSame($before, $snapshot());
        Queue::assertNothingPushed();
    }

    public function test_hidden_repriced_source_preserves_original_time_quote(): void
    {
        Sanctum::actingAs($this->user);
        $this->target->update(['prices' => ['monthly' => 2]]);
        $source = $this->history($this->start);
        $order = $this->quoteHalfwayTo($this->start->addMonth());
        $fields = ['surplus_amount', 'surplus_credit', 'balance_amount', 'discount_amount', 'total_amount', 'surplus_basis', 'surplus_order_ids'];
        $quote = $order->only($fields);
        $this->assertSame(500, (int) $quote['surplus_amount']);
        $this->assertSame(300, (int) $quote['surplus_credit']);
        $this->plan->update(['show' => false, 'sell' => false, 'prices' => ['monthly' => 1]]);
        $this->travel(2)->days();
        $this->user->update(['d' => 100 * 1073741824]);
        admin_setting(['change_order_event_id' => 1]);
        $this->postJson('/api/v1/user/order/checkout', ['trade_no' => $order->trade_no])->assertOk();
        $this->postJson('/api/v1/user/order/checkout', ['trade_no' => $order->trade_no])->assertStatus(400);
        $this->assertSame($quote, $order->fresh()->only($fields));
        $this->assertSame(Order::STATUS_COMPLETED, $order->fresh()->status);
        $this->assertSame(Order::STATUS_DISCOUNTED, $source->fresh()->status);
        $this->assertSame($this->target->id, $this->user->fresh()->plan_id);
        $this->assertSame(300, (int) $this->user->fresh()->balance);
    }

    public function test_rejected_time_quote_keeps_wallet_and_coupon_reserved_until_cancel(): void
    {
        Sanctum::actingAs($this->user);
        $source = $this->history($this->start);
        $this->travelTo($this->start->addSeconds(intdiv($this->user->expired_at - $this->start->timestamp, 2)));
        $this->user->update(['balance' => 400]);
        $this->target->update(['prices' => ['monthly' => 10]]);
        $coupon = Coupon::create(['code' => 'TIME', 'name' => 'Time', 'type' => 1, 'value' => 100, 'show' => true,
            'limit_use' => 1, 'started_at' => time() - 3600, 'ended_at' => time() + 3600]);
        $order = OrderService::createFromRequest($this->user, $this->target, 'monthly', $coupon->code)->fresh();
        $this->assertSame(0, (int) $order->total_amount);
        $this->assertSame(400, (int) $order->balance_amount);
        $source->update(['status' => Order::STATUS_DISCOUNTED]);
        $before = $order->getRawOriginal();
        $args = ['trade_no' => $order->trade_no];
        $this->postJson('/api/v1/user/order/checkout', $args)->assertStatus(400);
        $this->assertSame($before, $order->fresh()->getRawOriginal());
        $this->assertSame(0, (int) $coupon->fresh()->limit_use);
        $this->assertSame(0, (int) $this->user->fresh()->balance);
        foreach ([200, 400] as $status) {
            $this->postJson('/api/v1/user/order/cancel', $args)->assertStatus($status);
            $this->assertSame(1, (int) $coupon->fresh()->limit_use);
            $this->assertSame(400, (int) $this->user->fresh()->balance);
        }
    }
}
