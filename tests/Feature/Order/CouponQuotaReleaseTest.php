<?php

namespace Tests\Feature\Order;

use App\Jobs\OrderHandleJob;
use App\Models\Coupon;
use App\Models\Order;
use App\Models\Plan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CouponQuotaReleaseTest extends TestCase
{
    use RefreshDatabase;

    private Plan $plan;
    private User $user;
    private Coupon $coupon;

    protected function setUp(): void
    {
        parent::setUp();
        $this->plan = Plan::create([
            'name' => 'Monthly plan', 'group_id' => 1, 'transfer_enable' => 10,
            'prices' => [Plan::PERIOD_MONTHLY => 10], 'show' => true, 'sell' => true, 'renew' => true,
            'capacity_limit' => null,
        ]);
        $this->user = User::create([
            'email' => 'coupon@example.test', 'password' => 'fixture', 'token' => str_repeat('1', 32),
            'uuid' => '00000000-0000-4000-8000-000000000001', 'balance' => 1000,
        ]);
        Sanctum::actingAs($this->user);
        $this->coupon = Coupon::create([
            'code' => 'SAVE1', 'name' => 'Last use', 'type' => 1, 'value' => 100, 'show' => true,
            'limit_use' => 1, 'started_at' => time() - 3600, 'ended_at' => time() + 3600,
        ]);
    }

    private function buy(): TestResponse
    {
        return $this->postJson('/api/v1/user/order/save', [
            'plan_id' => $this->plan->id, 'period' => 'month_price', 'coupon_code' => $this->coupon->code,
        ]);
    }

    private function order(): Order
    {
        $response = $this->buy();
        $this->assertSame(200, $response->status(), $response->getContent());
        return Order::where('trade_no', $response->json('data'))->sole();
    }

    private function cancel(Order $order): TestResponse
    {
        return $this->postJson('/api/v1/user/order/cancel', ['trade_no' => $order->trade_no]);
    }

    public function test_last_use_is_reserved_released_and_spent_on_the_next_purchase(): void
    {
        $first = $this->order();
        $this->assertSame(0, $this->coupon->fresh()->limit_use);
        $this->assertSame(900, $first->balance_amount);
        $this->cancel($first)->assertOk();
        $this->cancel($first)->assertStatus(400);
        $this->assertSame(1, $this->coupon->fresh()->limit_use);
        $this->assertSame(1000, $this->user->fresh()->balance);

        $second = $this->order();
        $this->assertNotSame($first->id, $second->id);
        $this->assertSame(100, $second->discount_amount);
        $this->postJson('/api/v1/user/order/checkout', ['trade_no' => $second->trade_no])->assertOk();
        $this->assertSame(Order::STATUS_COMPLETED, $second->fresh()->status);
        $this->cancel($second)->assertStatus(400);
        $this->assertSame(0, $this->coupon->fresh()->limit_use);
        $this->assertSame(100, $this->user->fresh()->balance);
    }

    public function test_unlimited_coupon_changed_to_limited_is_not_credited(): void
    {
        $this->coupon->update(['limit_use' => null]);
        $order = $this->order();
        $this->coupon->update(['limit_use' => 3]);
        $this->cancel($order)->assertOk();
        $this->assertSame(3, $this->coupon->fresh()->limit_use);
    }

    public function test_pre_upgrade_order_without_deduction_marker_does_not_release_quota(): void
    {
        $this->coupon->update(['limit_use' => 0]);
        $legacy = Order::create([
            'user_id' => $this->user->id, 'plan_id' => $this->plan->id, 'period' => Plan::PERIOD_MONTHLY,
            'trade_no' => 'LEGACY-COUPON', 'type' => Order::TYPE_NEW_PURCHASE,
            'coupon_id' => $this->coupon->id, 'discount_amount' => 100, 'total_amount' => 900,
        ]);
        $this->cancel($legacy)->assertOk();
        $this->assertSame(0, $this->coupon->fresh()->limit_use);
        $this->assertSame(Order::STATUS_CANCELLED, $legacy->fresh()->status);
    }

    public function test_timeout_releases_quota_without_reactivating_an_expired_hidden_coupon(): void
    {
        $order = $this->order();
        Order::whereKey($order->id)->update(['created_at' => time() - 7201]);
        $this->coupon->update(['show' => false, 'ended_at' => time() - 1]);
        $job = new OrderHandleJob($order->trade_no);
        $job->handle();
        $job->handle();
        $this->assertSame(Order::STATUS_CANCELLED, $order->fresh()->status);
        $coupon = $this->coupon->fresh();
        $this->assertSame(1, $coupon->limit_use);
        $this->assertFalse($coupon->show);
        $this->assertLessThan(time(), $coupon->ended_at);
        $this->buy()->assertStatus(400);
    }

    public function test_admin_cancels_after_original_coupon_is_deleted_without_crediting_replacement(): void
    {
        $order = $this->order();
        $replacement = $this->coupon->replicate();
        $this->coupon->delete();
        $replacement->limit_use = 5;
        $replacement->saveOrFail();
        $this->user->update(['is_admin' => true]);
        Sanctum::actingAs($this->user->fresh());
        $this->postJson('/api/v2/'.hash('crc32b', config('app.key')).'/order/cancel', [
            'trade_no' => $order->trade_no,
        ])->assertOk();
        $this->assertSame(Order::STATUS_CANCELLED, $order->fresh()->status);
        $this->assertSame(1000, $this->user->fresh()->balance);
        $this->assertSame(5, $replacement->fresh()->limit_use);
        $this->assertDatabaseMissing('v2_coupon', ['id' => $this->coupon->id]);
    }

    public function test_coupon_changed_to_unlimited_stays_unlimited_on_cancel(): void
    {
        $order = $this->order();
        $this->coupon->update(['limit_use' => null]);
        $this->cancel($order)->assertOk();
        $this->assertNull($this->coupon->fresh()->limit_use);
    }

    public function test_quota_write_failure_rolls_back_cancellation_and_wallet_refund(): void
    {
        $order = $this->order();
        $reject = true;
        DB::connection()->beforeExecuting(function (string $sql) use (&$reject) {
            if ($reject && str_starts_with(strtolower($sql), 'update') && str_contains($sql, 'v2_coupon')) {
                throw new \RuntimeException('Coupon update unavailable');
            }
        });
        try {
            $this->cancel($order)->assertStatus(400);
        } finally {
            $reject = false;
        }
        $this->assertSame(Order::STATUS_PENDING, $order->fresh()->status);
        $this->assertSame(0, $this->coupon->fresh()->limit_use);
        $this->assertSame(100, $this->user->fresh()->balance);
        $this->cancel($order)->assertOk();
        $this->assertSame(1, $this->coupon->fresh()->limit_use);
        $this->assertSame(1000, $this->user->fresh()->balance);
    }
}
