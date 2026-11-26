<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\Plan;
use App\Models\User;
use App\Services\OrderService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class OneTimeSurplusValueTest extends TestCase
{
    use RefreshDatabase;

    private const GIB = 1073741824;

    private function plan(int $price, int $quota = 20, string $period = Plan::PERIOD_ONETIME): Plan
    {
        return Plan::create(['name' => 'Test package', 'group_id' => 1, 'transfer_enable' => $quota,
            'prices' => [$period => $price], 'show' => true, 'sell' => true, 'renew' => true,
            'capacity_limit' => null]);
    }

    private function customer(bool $admin = false): User
    {
        return User::create(['email' => Str::uuid().'@example.test', 'password' => 'fixture',
            'uuid' => (string) Str::uuid(), 'token' => Str::random(32), 'is_admin' => $admin]);
    }

    private function order(Plan $plan, string $period = 'onetime_price'): Order
    {
        $response = $this->postJson('/api/v1/user/order/save', ['period' => $period, 'plan_id' => $plan->id])
            ->assertOk();
        return Order::where('trade_no', $response->json('data'))->sole();
    }

    private function settle(Order $order): void
    {
        if ((int) $order->total_amount === 0) {
            $this->postJson('/api/v1/user/order/checkout', ['trade_no' => $order->trade_no])->assertOk();
        } else {
            $this->assertTrue((new OrderService($order))->paid('test-'.$order->trade_no));
        }
        $this->assertSame(Order::STATUS_COMPLETED, $order->fresh()->status);
    }

    public static function purchases(): array
    {
        return [
            '60 trade-in and 40 paid, all remaining' => [60, 0, 20, 0, 0, 10000],
            'cash, balance and trade-in, 75 percent remaining' => [60, 1750, 20, 2 * self::GIB, 3 * self::GIB, 7500],
            'fully trade-in funded' => [100, 0, 20, 0, 0, 10000],
            'excess 50 previously returned to wallet' => [150, 0, 20, 0, 0, 10000],
            'all bytes used' => [60, 0, 20, 20 * self::GIB, 0, 0],
            'quota exceeded' => [60, 0, 20, 20 * self::GIB, 1, 0],
            'one byte consumed from a BIGINT quota' => [60, 0, 52428800, 1, 0, 9999],
        ];
    }

    #[DataProvider('purchases')]
    public function test_repeated_switch_conserves_paid_value_and_wallet_credit(
        int $firstPrice, int $wallet, int $quota, int $upload, int $download, int $credit
    ): void {
        $user = $this->customer();
        Sanctum::actingAs($user);
        $first = $this->order($this->plan($firstPrice));
        $this->settle($first);

        $user->refresh()->update(['balance' => $wallet]);
        $second = $this->order($this->plan(100, $quota));
        $walletRefund = max(0, ($firstPrice - 100) * 100);
        $this->assertSame($firstPrice * 100, $second->surplus_amount);
        $this->assertSame(max(0, 10000 - $firstPrice * 100 - $wallet), $second->total_amount);
        $this->assertSame($wallet, (int) $second->balance_amount);
        $this->assertSame($walletRefund, (int) $second->surplus_credit);
        $this->settle($second);
        $this->assertSame(Order::STATUS_DISCOUNTED, $first->fresh()->status);
        $this->assertSame($walletRefund, $user->fresh()->balance);

        $user->refresh()->update(['u' => $upload, 'd' => $download]);
        $third = $this->order($this->plan(200));
        $this->assertSame($credit, $third->surplus_amount);
        $this->assertSame(20000 - $credit - $walletRefund, $third->total_amount);
        $this->assertSame($walletRefund, (int) $third->balance_amount);
        $this->assertSame([$second->id], $third->surplus_order_ids);
        $this->settle($third);
        $this->assertSame(Order::STATUS_DISCOUNTED, $second->fresh()->status);
        $this->assertSame(0, $user->fresh()->balance);
    }

    public static function usageAfterMonthlyExpiry(): array
    {
        return [
            '15 of 20 GiB remaining' => [5, 7500],
            'all 20 GiB consumed' => [20, 0],
        ];
    }

    #[DataProvider('usageAfterMonthlyExpiry')]
    public function test_one_time_switch_preserves_expired_monthly_order(int $usedGiB, int $expectedCredit): void
    {
        $user = $this->customer();
        Sanctum::actingAs($user);
        $monthly = $this->order($this->plan(60, period: Plan::PERIOD_MONTHLY), 'month_price');
        $this->settle($monthly);

        // Place the completed month in the past without changing its order status.
        $start = now()->startOfMonth()->subMonths(2);
        $monthly->update(['created_at' => $start->timestamp, 'paid_at' => $start->timestamp]);
        $user->refresh()->update(['expired_at' => $start->copy()->addMonth()->timestamp]);

        $pack = $this->order($this->plan(100));
        $this->assertSame(Order::TYPE_NEW_PURCHASE, $pack->type);
        $this->assertSame(10000, $pack->total_amount);
        $this->settle($pack);
        $user->refresh()->update(['d' => $usedGiB * self::GIB]);

        $next = $this->order($this->plan(200));
        $this->assertSame($expectedCredit, $next->surplus_amount);
        $this->assertSame(20000 - $expectedCredit, $next->total_amount);
        $this->assertSame([$pack->id], $next->surplus_order_ids);
        $this->settle($next);
        $this->assertSame(Order::STATUS_COMPLETED, $monthly->fresh()->status);
        $this->assertSame(Order::STATUS_DISCOUNTED, $pack->fresh()->status);

        Sanctum::actingAs($this->customer(admin: true));
        $this->postJson('/api/v2/'.hash('crc32b', config('app.key')).'/order/detail', ['id' => $next->id])
            ->assertOk()
            ->assertJsonCount(1, 'data.surplus_orders')
            ->assertJsonPath('data.surplus_orders.0.id', $pack->id);
    }

    public function test_legacy_one_time_order_qualifies_but_legacy_reset_stays_completed(): void
    {
        $user = $this->customer();
        Sanctum::actingAs($user);
        $first = $this->order($this->plan(60));
        $this->settle($first);
        $first->update(['period' => 'onetime_price']);
        $reset = Order::create(['user_id' => $user->id, 'plan_id' => $first->plan_id, 'trade_no' => (string) Str::uuid(),
            'period' => 'reset_price', 'total_amount' => 800, 'type' => Order::TYPE_RESET_TRAFFIC,
            'status' => Order::STATUS_COMPLETED]);
        $next = $this->order($this->plan(100));
        $this->assertSame(6000, $next->surplus_amount);
        $this->assertSame([$first->id], $next->surplus_order_ids);
        $this->settle($next);
        $this->assertSame(Order::STATUS_COMPLETED, $reset->fresh()->status);
    }

    public function test_admin_reassigning_a_plan_does_not_transfer_an_unrelated_purchase(): void
    {
        $user = $this->customer();
        Sanctum::actingAs($user);
        $original = $this->order($this->plan(60));
        $this->settle($original);
        // Both invoices remain completed if trade-ins were disabled on the earlier switch.
        admin_setting(['surplus_enable' => 0]);
        $current = $this->order($this->plan(100));
        $this->settle($current);
        $this->assertSame(Order::STATUS_COMPLETED, $original->fresh()->status);
        admin_setting(['surplus_enable' => 1]);
        Sanctum::actingAs($this->customer(admin: true));
        $this->postJson('/api/v2/'.hash('crc32b', config('app.key')).'/user/update',
            ['id' => $user->id, 'plan_id' => $original->plan_id])->assertOk();
        Sanctum::actingAs($user->fresh());
        $next = $this->order($this->plan(120));
        $this->assertSame(0, (int) $next->surplus_amount);
        $this->assertSame(12000, $next->total_amount);
        $this->assertSame(Order::STATUS_COMPLETED, $current->fresh()->status);
    }
}
