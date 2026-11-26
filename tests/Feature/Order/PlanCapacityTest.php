<?php

namespace Tests\Feature\Order;

use App\Exceptions\ApiException;
use App\Jobs\OrderHandleJob;
use App\Models\GiftCardCode;
use App\Models\GiftCardTemplate;
use App\Models\Order;
use App\Models\OrderPaymentAttempt;
use App\Models\Payment;
use App\Models\Plan;
use App\Models\User;
use App\Services\OrderService;
use App\Services\GiftCardService;
use App\Services\PlanService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PlanCapacityTest extends TestCase
{
    use RefreshDatabase;

    private function plan(?int $capacity = 1): Plan
    {
        return Plan::create(['name' => 'capacity', 'group_id' => 1, 'transfer_enable' => 100,
            'prices' => ['monthly' => 5, 'onetime' => 5, 'reset_traffic' => 1],
            'show' => true, 'sell' => true, 'renew' => true, 'capacity_limit' => $capacity]);
    }

    private function buyer(array $fields = []): User
    {
        return User::withoutEvents(fn () => User::create($fields + [
            'uuid' => (string) Str::uuid(), 'email' => Str::random(12) . '@example.test',
            'password' => 'fixture', 'token' => Str::random(22), 'balance' => 600,
        ]));
    }

    private function soldOut(callable $purchase): void
    {
        try {
            $purchase();
            $this->fail('Expected the last seat to be reserved');
        } catch (ApiException $e) {
            $this->assertSame(__('Current product is sold out'), $e->getMessage());
        }
    }

    private function gift(array $rewards, int $type = GiftCardTemplate::TYPE_GENERAL): GiftCardCode
    {
        $template = GiftCardTemplate::create(['name' => 'gift', 'type' => $type, 'status' => 1,
            'rewards' => $rewards, 'admin_id' => 1]);
        return GiftCardCode::create(['template_id' => $template->id, 'code' => Str::random(25)]);
    }

    public function test_reserved_seat_blocks_gift_and_trial_but_the_paying_buyer_still_opens(): void
    {
        $plan = $this->plan();
        $buyer = $this->buyer();
        $order = OrderService::createFromRequest($buyer, $plan, 'monthly');
        $recipient = $this->buyer();
        $rewards = ['plan_id' => $plan->id, 'plan_validity_days' => 30, 'balance' => 20];
        foreach ([$this->gift($rewards, GiftCardTemplate::TYPE_PLAN),
            $this->gift(['random_rewards' => [$rewards + ['weight' => 1]]], GiftCardTemplate::TYPE_MYSTERY)] as $code) {
            $this->soldOut(fn () => (new GiftCardService($code->code))->setUser($recipient)->redeem());
            $this->assertDatabaseHas('v2_gift_card_code', ['id' => $code->id, 'usage_count' => 0,
                'user_id' => null, 'actual_rewards' => null]);
            $this->assertDatabaseMissing('v2_gift_card_usage', ['code_id' => $code->id]);
        }
        $this->assertNull($recipient->fresh()->plan_id);
        $this->assertSame(600, (int) $recipient->fresh()->balance);
        admin_setting(['try_out_plan_id' => $plan->id]);
        $this->postJson('/api/v1/passport/auth/register', ['email' => 'trial@example.com',
            'password' => 'password123'])->assertOk();
        $trial = User::byEmail('trial@example.com')->firstOrFail();
        $this->assertNull($trial->plan_id);
        $this->assertSame(0, (int) $trial->transfer_enable);
        $this->assertTrue((new OrderService($order))->paid('transaction'));
        $this->assertSame(Order::STATUS_COMPLETED, $order->fresh()->status);
        $this->assertSame($plan->id, $buyer->fresh()->plan_id);
    }

    public function test_gift_extension_can_use_its_owners_seat_but_cannot_revive_an_expired_user_at_capacity(): void
    {
        $plan = $this->plan();
        $expireAt = time() - 300;
        $expired = $this->buyer(['plan_id' => $plan->id, 'expired_at' => $expireAt]);
        $owner = $this->buyer();
        OrderService::createFromRequest($owner, $plan, 'monthly');
        $extension = $this->gift(['expire_days' => 5]);
        $this->soldOut(fn () => (new GiftCardService($extension->code))->setUser($expired)->redeem());
        $this->assertSame($expireAt, (int) $expired->fresh()->expired_at);
        $this->assertSame(0, (int) $extension->fresh()->usage_count);

        $gift = $this->gift(['plan_id' => $plan->id, 'plan_validity_days' => 5]);
        (new GiftCardService($gift->code))->setUser($owner)->redeem();
        $this->assertSame($plan->id, $owner->fresh()->plan_id);
        $before = (int) $owner->fresh()->expired_at;
        (new GiftCardService($extension->code))->setUser($owner)->redeem();
        $this->assertSame($before + 5 * 86400, (int) $owner->fresh()->expired_at);
        $this->assertDatabaseCount('v2_gift_card_usage', 2);
    }

    public function test_generated_users_share_trial_capacity_and_explicit_admin_grants_remain_available(): void
    {
        Sanctum::actingAs($this->buyer(['is_admin' => true]));
        $url = '/api/v2/' . hash('crc32b', config('app.key')) . '/user/generate';
        $plan = $this->plan();
        admin_setting(['try_out_plan_id' => $plan->id, 'try_out_hour' => 3]);
        $this->postJson($url, ['email_suffix' => 'example.com', 'generate_count' => 2])->assertOk();
        $this->assertSame(1, User::where('plan_id', $plan->id)->count());
        $this->postJson($url, ['email_suffix' => 'example.com', 'email_prefix' => 'single'])->assertOk();
        $this->assertNull(User::byEmail('single@example.com')->firstOrFail()->plan_id);
        $plan->update(['capacity_limit' => 0]);
        $gift = $this->gift(['plan_id' => $plan->id, 'plan_validity_days' => 1]);
        $recipient = $this->buyer();
        $this->soldOut(fn () => (new GiftCardService($gift->code))->setUser($recipient)->redeem());
        $this->postJson($url, ['plan_id' => $plan->id, 'email_suffix' => 'example.com',
            'email_prefix' => 'explicit'])->assertOk();
        $this->assertSame($plan->id, User::byEmail('explicit@example.com')->firstOrFail()->plan_id);
        $plan->update(['capacity_limit' => null]);
        $this->postJson($url, ['email_suffix' => 'example.com', 'email_prefix' => 'unlimited',
            'generate_count' => 2])->assertOk();
        $this->assertSame(2, User::where('email', 'like', 'unlimited%')->where('plan_id', $plan->id)->count());
        (new GiftCardService($gift->code))->setUser($recipient)->redeem();
        $this->assertSame($plan->id, $recipient->fresh()->plan_id);
    }

    public function test_pending_order_reserves_seat_and_timeout_restores_seat_and_balance_once(): void
    {
        $plan = $this->plan();
        $first = $this->buyer();
        $second = $this->buyer();
        $order = OrderService::createFromRequest($first, $plan, 'monthly');
        $this->assertSame(100, (int) $first->fresh()->balance);
        $this->soldOut(fn () => OrderService::createFromRequest($second, $plan, 'monthly'));
        $this->assertSame(600, (int) $second->fresh()->balance);
        $this->assertFalse((new PlanService($plan))->hasCapacity($plan));

        Order::whereKey($order->id)->update(['created_at' => time() - 7205]);
        (new OrderHandleJob($order->trade_no))->handle();
        (new OrderHandleJob($order->trade_no))->handle();
        $this->assertSame(Order::STATUS_CANCELLED, $order->fresh()->status);
        $this->assertSame(600, (int) $first->fresh()->balance);
        $replacement = OrderService::createFromRequest($second, $plan, 'onetime');
        $this->assertTrue((new OrderService($replacement))->paid('internal-checkout'));
        $this->assertSame($plan->id, $second->fresh()->plan_id);
        $this->assertNull($second->fresh()->expired_at);
        $this->assertFalse((new PlanService($plan))->hasCapacity($plan));
    }

    public function test_active_renewal_and_reset_do_not_double_count_and_expired_buyer_needs_a_seat(): void
    {
        $plan = $this->plan(2);
        $member = $this->buyer(['plan_id' => $plan->id, 'group_id' => 1, 'expired_at' => null, 'transfer_enable' => 10000]);
        $renewal = OrderService::createFromRequest($member, $plan, 'monthly');
        $other = OrderService::createFromRequest($this->buyer(), $plan, 'monthly');
        $this->assertFalse((new PlanService($plan))->hasCapacity($plan));
        $this->assertTrue((new OrderService($renewal))->cancel());
        $reset = OrderService::createFromRequest($member->fresh(), $plan, 'reset_price');
        $this->assertSame(Order::TYPE_RESET_TRAFFIC, $reset->type);
        $expired = $this->buyer(['plan_id' => $plan->id, 'expired_at' => time() - 1]);
        $this->soldOut(fn () => OrderService::createFromRequest($expired, $plan, 'monthly'));
        $this->assertTrue((new OrderService($other))->cancel());
        $this->assertTrue((new PlanService($plan))->hasCapacity($plan));
        $this->assertNotNull(OrderService::createFromRequest($expired, $plan, 'monthly')->id);
    }

    public function test_processing_legacy_oversubscription_waits_for_older_reservation_including_on_replay(): void
    {
        $plan = $this->plan();
        $first = $this->buyer();
        $later = $this->buyer();
        $earlierOrder = OrderService::createFromRequest($first, $plan, 'monthly');
        $legacy = Order::create(['user_id' => $later->id, 'plan_id' => $plan->id, 'trade_no' => 'already-paid',
            'status' => Order::STATUS_PROCESSING, 'type' => Order::TYPE_NEW_PURCHASE, 'period' => 'monthly', 'total_amount' => 500]);
        (new OrderService($legacy))->open();
        $this->assertSame(Order::STATUS_PROCESSING, $legacy->fresh()->status);
        $this->assertNull($later->fresh()->plan_id);
        $this->assertTrue((new OrderService($earlierOrder))->cancel());
        (new OrderHandleJob($legacy->trade_no))->handle();
        (new OrderHandleJob($legacy->trade_no))->handle();
        $this->assertSame(Order::STATUS_COMPLETED, $legacy->fresh()->status);
        $this->assertSame($plan->id, $later->fresh()->plan_id);
        $this->assertSame(1, User::where('plan_id', $plan->id)->count());
    }

    public function test_legacy_excess_checkout_and_manual_payment_wait_but_a_real_receipt_is_retained(): void
    {
        $plan = $this->plan();
        $winner = OrderService::createFromRequest($this->buyer(), $plan, 'monthly');
        $later = $this->buyer(['balance' => 0]);
        $legacy = Order::create(['user_id' => $later->id, 'plan_id' => $plan->id, 'trade_no' => 'legacy-checkout',
            'status' => Order::STATUS_PENDING, 'type' => Order::TYPE_NEW_PURCHASE, 'period' => 'month_price',
            'payment_id' => 21, 'total_amount' => 500]);
        $this->soldOut(fn () => PlanService::validateCheckoutCapacity($legacy));
        $this->assertFalse((new OrderService($legacy))->paid('manual_operation'));
        $this->assertSame(Order::STATUS_PENDING, $legacy->fresh()->status);
        $this->assertTrue((new OrderService($legacy))->paid('verified-external', 21));
        $this->assertSame(Order::STATUS_PROCESSING, $legacy->fresh()->status);
        $this->assertSame('verified-external', $legacy->fresh()->callback_no);
        $this->assertNull($later->fresh()->plan_id);
        $this->assertTrue((new OrderService($winner))->cancel());
        (new OrderHandleJob($legacy->trade_no))->handle();
        $this->assertSame(Order::STATUS_COMPLETED, $legacy->fresh()->status);
        $this->assertSame($plan->id, $later->fresh()->plan_id);
    }

    public function test_switch_only_reserves_target_and_unlimited_and_zero_capacity_keep_their_meanings(): void
    {
        $original = $this->plan();
        $target = $this->plan();
        $member = $this->buyer(['plan_id' => $original->id, 'expired_at' => time() + 3000]);
        $change = OrderService::createFromRequest($member, $target, 'monthly');
        $this->assertFalse((new PlanService($original))->hasCapacity($original));
        $this->assertFalse((new PlanService($target))->hasCapacity($target));
        $this->assertTrue((new OrderService($change))->paid('manual_operation'));
        $this->assertTrue((new PlanService($original))->hasCapacity($original));
        $this->assertFalse((new PlanService($target))->hasCapacity($target));
        $unlimited = $this->plan(null);
        OrderService::createFromRequest($this->buyer(), $unlimited, 'monthly');
        $this->assertTrue((new PlanService($unlimited))->hasCapacity($unlimited));
        $closed = $this->plan(0);
        $this->soldOut(fn () => OrderService::createFromRequest($this->buyer(), $closed, 'onetime'));
    }

    public function test_listing_unlimited_plans_only_queries_plans(): void
    {
        foreach (range(1, 10) as $unused) {
            $this->plan(null);
        }
        DB::enableQueryLog();
        try {
            $this->assertCount(10, (new PlanService(new Plan()))->getAvailablePlans());
            $queries = DB::getQueryLog();
            $this->assertCount(1, $queries);
            $this->assertStringContainsString('v2_plan', $queries[0]['query']);
        } finally {
            DB::disableQueryLog();
            DB::flushQueryLog();
        }
    }

    public function test_purchase_lists_count_remaining_seats_once_and_preserve_capacity_limits(): void
    {
        $limited = $this->plan(100);
        $otherPlans = [];
        foreach (range(1, 12) as $index) {
            $otherPlans[] = $this->plan(10 + $index);
        }
        $unlimited = $this->plan(null);
        $closed = $this->plan(0);
        foreach (range(1, 98) as $unused) {
            $member = $this->buyer(['plan_id' => $limited->id, 'expired_at' => null]);
        }
        OrderService::createFromRequest($member, $limited, 'monthly');
        $pending = OrderService::createFromRequest($this->buyer(), $limited, 'monthly');

        foreach (['guest', 'user'] as $viewer) {
            if ($viewer === 'user') {
                Sanctum::actingAs($member);
            }
            DB::enableQueryLog();
            try {
                $rows = $this->getJson("/api/v1/$viewer/plan/fetch")->assertOk()->json('data');
                $counts = collect(DB::getQueryLog())->filter(fn ($query) => str_contains($query['query'], 'occupied'));
                $this->assertCount(1, $counts, 'Only the positive capacity requires an occupancy query.');
            } finally {
                DB::disableQueryLog();
                DB::flushQueryLog();
            }
            $this->assertTrue(array_is_list($rows));
            $plans = array_column($rows, null, 'id');
            $this->assertSame(100, $plans[$limited->id]['capacity_limit']);
            $this->assertSame(1, $plans[$limited->id]['remaining_capacity']);
            $this->assertNull($plans[$unlimited->id]['remaining_capacity']);
            foreach ($otherPlans as $otherPlan) {
                $this->assertSame($otherPlan->capacity_limit, $plans[$otherPlan->id]['remaining_capacity']);
            }
            $this->assertArrayNotHasKey($closed->id, $plans);
        }

        $this->assertTrue((new OrderService($pending))->cancel());
        $this->getJson('/api/v1/user/plan/fetch?id='.$limited->id)->assertOk()
            ->assertJsonPath('data.capacity_limit', 100)->assertJsonPath('data.remaining_capacity', 2);
    }

    public function test_member_can_view_a_fully_reserved_plan_and_renew_at_zero_remaining(): void
    {
        $plan = $this->plan(2);
        $member = $this->buyer(['plan_id' => $plan->id, 'expired_at' => null]);
        $order = OrderService::createFromRequest($this->buyer(), $plan, 'monthly');
        $order->update(['status' => Order::STATUS_PROCESSING]);
        $path = '/api/v1/user/plan/fetch?id='.$plan->id;
        $this->getJson('/api/v1/guest/plan/fetch')->assertOk()->assertJsonCount(0, 'data');
        Sanctum::actingAs($this->buyer());
        $this->getJson($path)->assertStatus(400);
        Sanctum::actingAs($member);
        $this->getJson($path)->assertOk()->assertJsonPath('data.capacity_limit', 2)
            ->assertJsonPath('data.remaining_capacity', 0);
        $this->assertNotNull(OrderService::createFromRequest($member, $plan, 'monthly')->id);
        $plan->update(['capacity_limit' => 0]);
        $this->getJson($path)->assertOk()->assertJsonPath('data.capacity_limit', __('Sold out'))
            ->assertJsonPath('data.remaining_capacity', 0);
    }

    public function test_receipt_from_a_previous_channel_after_cancellation_cannot_reclaim_reallocated_seat(): void
    {
        $plan = $this->plan();
        $buyer = $this->buyer(['balance' => 100]);
        $order = OrderService::createFromRequest($buyer, $plan, 'monthly');
        $channel = new Payment();
        $channel->id = 51;
        $channel->handling_fee_fixed = 13;
        $quote = OrderPaymentAttempt::quote($order, $channel, true);
        $order->update(['payment_id' => 52, 'handling_amount' => 29]);
        $this->assertTrue((new OrderService($order))->cancel());
        $other = $this->buyer();
        $winner = OrderService::createFromRequest($other, $plan, 'monthly');
        $this->assertTrue((new OrderService($winner))->paid('manual_operation'));
        foreach ([1, 2] as $repeat) {
            $this->assertTrue((new OrderService($order))->paid('verified-channel-51', 51, 'transaction-51', $quote, 413));
        }
        $this->assertDatabaseCount('v2_cancelled_order_payments', 1);
        $this->assertDatabaseHas('v2_cancelled_order_payments', [
            'order_id' => $order->id, 'payment_id' => 51, 'expected_amount' => 413,
        ]);
        $this->assertSame(100, (int) $buyer->fresh()->balance);
        $this->assertNull($buyer->fresh()->plan_id);
        $this->assertSame($plan->id, $other->fresh()->plan_id);
        $this->assertSame(1, User::where('plan_id', $plan->id)->count());
    }
}
