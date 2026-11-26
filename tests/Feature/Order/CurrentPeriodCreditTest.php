<?php

namespace Tests\Feature\Order;

use App\Models\Order;
use App\Models\Plan;
use App\Models\User;
use App\Services\OrderService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
}
