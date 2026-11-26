<?php

namespace Tests\Feature\Order;

use App\Models\Coupon;
use App\Models\Order;
use App\Models\Plan;
use App\Models\User;
use App\Services\OrderService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class StackedDiscountTest extends TestCase
{
    use RefreshDatabase;

    private function plan(float $price): Plan
    {
        return Plan::create(['name' => 'Fixture', 'group_id' => 2, 'transfer_enable' => 20,
            'prices' => [Plan::PERIOD_MONTHLY => $price], 'show' => true, 'sell' => true, 'renew' => true,
            'capacity_limit' => null]);
    }

    private function customer(array $attributes): User
    {
        $user = User::create($attributes + ['email' => 'discount@example.test', 'password' => 'fixture',
            'uuid' => '00000000-0000-4000-8000-000000000001', 'token' => str_repeat('1', 32)]);
        Sanctum::actingAs($user);
        return $user;
    }

    private function placeOrder(Plan $plan, int $couponType, int $value): Order
    {
        $coupon = Coupon::create(['code' => 'DISCOUNT', 'name' => 'fixture', 'type' => $couponType,
            'value' => $value, 'show' => true, 'started_at' => time() - 60, 'ended_at' => time() + 3600,
            'limit_use' => 1]);
        $response = $this->postJson('/api/v1/user/order/save', [
            'plan_id' => $plan->id, 'period' => 'month_price', 'coupon_code' => $coupon->code,
        ]);
        $this->assertSame(200, $response->status(), $response->getContent());
        $order = Order::where('trade_no', $response->json('data'))->firstOrFail();
        $this->assertSame($coupon->id, $order->coupon_id);
        $this->assertSame(0, $coupon->fresh()->limit_use);
        return $order;
    }

    public static function discounts(): array
    {
        // 2001 cents, 25% VIP. Two 25% discounts sum to 1000.50 cents before rounding.
        return [
            'below price, fractional cents, partially wallet funded' => [2, 25, 1001, 250, 750],
            'exactly the price' => [2, 75, 2001, 0, 0],
            'fixed coupon plus VIP exceeds the price' => [1, 1800, 2001, 0, 0],
        ];
    }

    public static function quotedPrices(): array
    {
        return [
            'ordinary price' => [19.99, 1999, 201],
            'price below one unit' => [0.29, 29, 4],
            'legacy sub-cent price' => [1.1599, 115, 13],
        ];
    }

    #[DataProvider('quotedPrices')]
    public function test_order_quotes_plan_in_cents_before_applying_discounts(float $price, int $cents, int $discount): void
    {
        $this->customer(['discount' => 10, 'balance' => 0]);
        $order = $this->placeOrder($this->plan($price), 1, 1);
        $this->assertSame($discount, $order->discount_amount);
        $this->assertSame($cents - $discount, $order->total_amount);
    }

    #[DataProvider('discounts')]
    public function test_combined_discount_and_checkout_conserve_cents(
        int $couponType, int $couponValue, int $discount, int $wallet, int $due
    ): void {
        $user = $this->customer(['discount' => 25, 'balance' => 250]);
        $plan = $this->plan(20.01);
        $order = $this->placeOrder($plan, $couponType, $couponValue);
        $this->assertSame($discount, $order->discount_amount);
        $this->assertSame($wallet, $order->balance_amount ?? 0);
        $this->assertSame($due, $order->total_amount);
        $this->assertSame(0, $order->surplus_credit ?? 0);
        $this->assertSame(2001, $order->discount_amount + $order->balance_amount + $order->total_amount);

        if ($due === 0) {
            $this->postJson('/api/v1/user/order/checkout', ['trade_no' => $order->trade_no])
                ->assertOk()->assertJsonPath('data', true);
        } else {
            $this->assertTrue((new OrderService($order))->paid('fixture-payment'));
        }
        $this->assertSame(Order::STATUS_COMPLETED, $order->fresh()->status);
        $user->refresh();
        $this->assertSame($plan->id, $user->plan_id);
        $this->assertSame(250 - $wallet, $user->balance);
    }

    public static function tradeIns(): array
    {
        return [
            'partial discount' => [600, 1100, 1350],
            'capped discount' => [1800, 2000, 2250],
        ];
    }

    public function test_discount_on_an_upgrade_without_paid_history_cannot_create_wallet_credit(): void
    {
        admin_setting(['plan_change_enable' => 1, 'surplus_enable' => 1]);
        $oldPlan = $this->plan(30);
        $newPlan = $this->plan(20);
        $user = $this->customer(['plan_id' => $oldPlan->id, 'expired_at' => null, 'group_id' => 2,
            'transfer_enable' => 20 * 1073741824, 'discount' => 25, 'balance' => 125]);

        $order = $this->placeOrder($newPlan, 1, 1800);
        $this->assertSame(Order::TYPE_UPGRADE, $order->type);
        $this->assertSame(2000, $order->discount_amount);
        $this->assertSame(0, $order->surplus_amount ?? 0);
        $this->assertSame(0, $order->surplus_credit ?? 0);
        $this->assertSame(0, $order->total_amount);
        $this->postJson('/api/v1/user/order/checkout', ['trade_no' => $order->trade_no])
            ->assertOk()->assertJsonPath('data', true);
        $this->assertSame(Order::STATUS_COMPLETED, $order->fresh()->status);
        $this->assertSame(125, $user->fresh()->balance);
    }

    #[DataProvider('tradeIns')]
    public function test_upgrade_credits_only_unused_value_of_the_old_paid_plan(
        int $coupon, int $discount, int $credit
    ): void {
        admin_setting(['plan_change_enable' => 1, 'surplus_enable' => 1]);
        $oldPlan = $this->plan(30);
        $newPlan = $this->plan(20);
        $user = $this->customer(['plan_id' => $oldPlan->id, 'group_id' => 2, 'expired_at' => null,
            'transfer_enable' => 20 * 1073741824, 'd' => 5 * 1073741824, 'balance' => 125, 'discount' => 25]);
        $old = Order::create(['user_id' => $user->id, 'plan_id' => $oldPlan->id, 'trade_no' => 'old-fixture',
            'period' => Plan::PERIOD_ONETIME, 'type' => Order::TYPE_NEW_PURCHASE, 'status' => Order::STATUS_COMPLETED,
            'total_amount' => 2400, 'balance_amount' => 600]);

        $order = $this->placeOrder($newPlan, 1, $coupon);
        $this->assertSame(Order::TYPE_UPGRADE, $order->type);
        $this->assertSame($discount, $order->discount_amount);
        $this->assertSame(2250, $order->surplus_amount);
        $this->assertSame([$old->id], $order->surplus_order_ids);
        $this->assertSame($credit, $order->surplus_credit);
        $this->assertSame(0, $order->balance_amount ?? 0);
        $this->assertSame(0, $order->total_amount);
        $this->assertSame(125, $user->fresh()->balance);
        $this->postJson('/api/v1/user/order/checkout', ['trade_no' => $order->trade_no])
            ->assertOk()->assertJsonPath('data', true);
        $this->assertSame(Order::STATUS_COMPLETED, $order->fresh()->status);
        $this->assertSame(Order::STATUS_DISCOUNTED, $old->fresh()->status);
        $user->refresh();
        $this->assertSame($newPlan->id, $user->plan_id);
        $this->assertSame(125 + $credit, $user->balance);
    }
}
