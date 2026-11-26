<?php

namespace Tests\Feature\Order;

use App\Console\Commands\CheckCommission;
use App\Models\CommissionLog;
use App\Models\Order;
use App\Models\User;
use App\Support\Setting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CommissionSettlementTest extends TestCase
{
    use RefreshDatabase;

    private function settings(array $overrides = []): void
    {
        $values = $overrides + [
            'commission_auto_check_enable' => 0,
            'commission_distribution_enable' => 0,
            'withdraw_close_enable' => 0,
        ];
        $this->mock(Setting::class)->shouldReceive('get')->andReturnUsing(fn ($key) => $values[$key] ?? null);
    }

    private function inviter(?User $parent = null): User
    {
        return User::withoutEvents(fn () => User::create([
            'email' => Str::random(12) . '@example.test', 'password' => 'fixture',
            'uuid' => (string) Str::uuid(), 'token' => Str::random(32), 'invite_user_id' => $parent?->id,
        ]));
    }

    private function order(User $inviter): Order
    {
        return Order::create([
            'user_id' => 900, 'plan_id' => 1, 'type' => Order::TYPE_NEW_PURCHASE,
            'period' => 'month_price', 'trade_no' => (string) Str::uuid(), 'total_amount' => 1000,
            'status' => Order::STATUS_COMPLETED, 'invite_user_id' => $inviter->id,
            'commission_status' => 1, 'commission_balance' => 300,
        ]);
    }

    public function test_only_fulfilled_orders_can_be_approved_and_paid_including_previously_discounted_orders(): void
    {
        $this->settings();
        $inviter = $this->inviter();
        $inviter->update(['is_admin' => true]);
        Sanctum::actingAs($inviter);
        $endpoint = '/api/v2/' . hash('crc32b', config('app.key')) . '/order/update';
        $ineligible = [];
        foreach ([Order::STATUS_PENDING, Order::STATUS_PROCESSING, Order::STATUS_CANCELLED] as $status) {
            $order = $this->order($inviter);
            $order->update(['status' => $status, 'commission_status' => 0]);
            $this->postJson($endpoint, ['trade_no' => $order->trade_no, 'commission_status' => 1])->assertStatus(409);
            $this->assertSame(0, (int) $order->fresh()->commission_status);
            $order->update(['commission_status' => 1]); // Approval saved by an older version.
            $ineligible[] = $order;
        }
        $this->artisan('check:commission')->assertSuccessful();
        $this->assertSame(0, (int) $inviter->fresh()->balance);
        $this->assertSame(0, (int) $inviter->fresh()->commission_balance);
        $this->assertSame(0, CommissionLog::count());
        foreach ($ineligible as $order) {
            $this->assertSame(1, (int) $order->fresh()->commission_status);
        }

        foreach (Order::COMMISSION_ELIGIBLE_STATUSES as $status) {
            $order = $this->order($inviter);
            $order->update(['status' => $status, 'commission_status' => 0]);
            $this->postJson($endpoint, ['trade_no' => $order->trade_no, 'commission_status' => 1])->assertOk();
        }
        $this->artisan('check:commission')->assertSuccessful();
        $this->assertSame(600, (int) $inviter->fresh()->commission_balance);
        $this->assertSame(2, CommissionLog::count());
    }

    public function test_retry_and_late_manual_approval_cannot_pay_a_settled_order_again(): void
    {
        $this->settings();
        $inviter = $this->inviter();
        $order = $this->order($inviter);
        $this->artisan('check:commission')->assertSuccessful();

        $inviter->is_admin = true;
        $inviter->save();
        Sanctum::actingAs($inviter);
        $this->postJson('/api/v2/' . hash('crc32b', config('app.key')) . '/order/update', [
            'trade_no' => $order->trade_no, 'commission_status' => 1,
        ])->assertStatus(409);
        $this->artisan('check:commission')->assertSuccessful();

        $this->assertSame(300, (int) $inviter->fresh()->commission_balance);
        $this->assertSame(2, (int) $order->refresh()->commission_status);
        $this->assertSame(300, (int) $order->actual_commission_balance);
        $this->assertCount(1, $order->commission_log);
        $this->assertSame(300, (int) $order->commission_log->first()->get_amount);
    }

    public function test_later_level_ledger_failure_rolls_back_all_credits_then_retry_succeeds(): void
    {
        $this->settings([
            'withdraw_close_enable' => 1, 'commission_distribution_enable' => 1,
            'commission_distribution_l1' => 50, 'commission_distribution_l2' => 0, 'commission_distribution_l3' => 50,
        ]);
        $top = $this->inviter();
        $middle = $this->inviter($top);
        $first = $this->inviter($middle);
        $order = $this->order($first);
        $order->update(['commission_balance' => 301]);
        $reject = true;
        CommissionLog::creating(function ($log) use ($top, &$reject) {
            return !$reject || $log->invite_user_id !== $top->id;
        });

        try {
            app(CheckCommission::class)->autoPayCommission();
            $this->fail('Expected the second ledger entry to fail');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('Failed to record commission', $e->getMessage());
        }
        $this->assertSame(0, (int) $first->fresh()->balance);
        $this->assertSame(0, (int) $top->fresh()->balance);
        $this->assertSame(1, (int) $order->refresh()->commission_status);
        $this->assertNull($order->actual_commission_balance);
        $this->assertSame(0, $order->commission_log()->count());

        $reject = false;
        $this->artisan('check:commission')->assertSuccessful();
        $this->assertSame(151, (int) $first->fresh()->balance);
        $this->assertSame(0, (int) $middle->fresh()->balance);
        $this->assertSame(150, (int) $top->fresh()->balance);
        $this->assertSame(2, (int) $order->refresh()->commission_status);
        $this->assertSame(301, (int) $order->actual_commission_balance);
        $this->assertSame([151, 150], $order->commission_log()->orderBy('id')->pluck('get_amount')->map(fn ($amount) => (int) $amount)->all());
    }

    public function test_configured_shares_above_one_hundred_percent_remain_payable(): void
    {
        $this->settings([
            'commission_distribution_enable' => 1, 'commission_distribution_l1' => 75,
            'commission_distribution_l2' => 50, 'commission_distribution_l3' => 0,
        ]);
        $second = $this->inviter();
        $first = $this->inviter($second);
        $order = $this->order($first);
        $order->update(['commission_balance' => 301]);
        $this->artisan('check:commission')->assertSuccessful();
        $this->assertSame(226, (int) $first->fresh()->commission_balance);
        $this->assertSame(150, (int) $second->fresh()->commission_balance);
        $this->assertSame(376, (int) $order->fresh()->actual_commission_balance);
        $this->assertSame(376, (int) $order->commission_log()->sum('get_amount'));
    }

    public function test_self_invited_legacy_order_is_flagged_without_blocking_next_order_or_touching_past_payouts(): void
    {
        $this->settings();
        $buyer = $this->inviter();
        $old = $this->order($buyer);
        $this->artisan('check:commission')->assertSuccessful();
        $old->update(['user_id' => $buyer->id]); // Settled history is outside the current payout run.
        $bad = $this->order($buyer);
        $bad->update(['user_id' => $buyer->id]);
        $valid = $this->order($buyer);
        $this->artisan('check:commission')->assertSuccessful();
        $this->artisan('check:commission')->assertSuccessful();
        $this->assertSame(3, (int) $bad->fresh()->commission_status);
        $this->assertSame(0, (int) $bad->fresh()->actual_commission_balance);
        $this->assertSame(0, $bad->commission_log()->count());
        foreach ([$old, $valid] as $payable) {
            $this->assertSame(2, (int) $payable->fresh()->commission_status);
            $this->assertSame(1, $payable->commission_log()->count());
        }
        $this->assertSame(600, (int) $buyer->fresh()->commission_balance);
    }

    public function test_multilevel_cycle_invalidates_the_entire_order_and_can_be_reviewed_after_repair(): void
    {
        $this->settings(['withdraw_close_enable' => 1, 'commission_distribution_enable' => 1,
            'commission_distribution_l1' => 50, 'commission_distribution_l2' => 0, 'commission_distribution_l3' => 50]);
        $first = $this->inviter();
        $second = $this->inviter($first);
        $first->update(['invite_user_id' => $second->id]);
        $order = $this->order($first);
        $this->artisan('check:commission')->assertSuccessful();
        $this->assertSame(3, (int) $order->fresh()->commission_status);
        $this->assertSame(0, $order->commission_log()->count());
        $this->assertSame(0, (int) $first->fresh()->balance);
        $this->assertSame(0, (int) $second->fresh()->balance);
        $top = $this->inviter();
        $second->update(['invite_user_id' => $top->id]);
        $top->update(['is_admin' => true]);
        Sanctum::actingAs($top);
        $this->postJson('/api/v2/' . hash('crc32b', config('app.key')) . '/order/update', [
            'trade_no' => $order->trade_no, 'commission_status' => 1,
        ])->assertOk();
        $this->artisan('check:commission')->assertSuccessful();
        $this->assertSame(2, (int) $order->fresh()->commission_status);
        $this->assertSame(150, (int) $first->fresh()->balance);
        $this->assertSame(0, (int) $second->fresh()->balance);
        $this->assertSame(150, (int) $top->fresh()->balance);
        $this->assertSame(300, (int) $order->commission_log()->sum('get_amount'));
    }
}
