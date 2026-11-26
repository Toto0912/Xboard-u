<?php

namespace Tests\Feature\Order;

use App\Models\Order;
use App\Models\Plan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class ResetPackagePurchaseTest extends TestCase
{
    use RefreshDatabase;

    private Plan $plan;
    private User $member;

    protected function setUp(): void
    {
        parent::setUp();
        $this->plan = Plan::create([
            'name' => 'Retired plan', 'group_id' => 1, 'transfer_enable' => 1,
            'prices' => ['monthly' => 10, 'onetime' => 50, 'reset_traffic' => 2.50],
            'show' => false, 'sell' => false, 'renew' => false, 'capacity_limit' => 0,
            'reset_traffic_method' => Plan::RESET_TRAFFIC_NEVER,
        ]);
        $this->member = User::withoutEvents(fn () => User::create([
            'email' => 'member@example.test', 'password' => 'fixture', 'token' => str_repeat('a', 32),
            'uuid' => '00000000-0000-4000-8000-000000000001', 'plan_id' => $this->plan->id,
            'group_id' => 1, 'transfer_enable' => 1024, 'u' => 500, 'd' => 524,
            'balance' => 1000, 'expired_at' => time() + 86400,
        ]));
        Sanctum::actingAs($this->member);
    }

    public function test_current_member_can_buy_only_a_reset_after_renewals_stop(): void
    {
        $this->getJson('/api/v1/user/getSubscribe')->assertOk()
            ->assertJsonPath('data.can_purchase_reset', true)->assertJsonPath('data.plan.renew', false);
        $this->getJson('/api/v1/user/plan/fetch')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/user/plan/fetch?id='.$this->plan->id)->assertOk()
            ->assertJsonPath('data.month_price', null)->assertJsonPath('data.onetime_price', null)
            ->assertJsonPath('data.reset_price', 250)->assertJsonPath('data.remaining_capacity', 0);
        $this->postJson('/api/v1/user/order/save', ['plan_id' => $this->plan->id, 'period' => 'month_price'])
            ->assertStatus(400);
        $trade = $this->postJson('/api/v1/user/order/save', ['plan_id' => $this->plan->id, 'period' => 'reset_price'])
            ->assertOk()->json('data');
        $this->postJson('/api/v1/user/order/checkout', ['trade_no' => $trade])->assertOk();
        $order = Order::where('trade_no', $trade)->sole();
        $this->assertSame(Order::TYPE_RESET_TRAFFIC, $order->type);
        $this->assertSame(Order::STATUS_COMPLETED, $order->status);
        $this->assertSame(250, $order->balance_amount);
        $updated = $this->member->fresh();
        $this->assertSame(750, $updated->balance);
        $this->assertSame(0, $updated->u + $updated->d);
        $this->assertSame(1, $updated->reset_count);
        $this->assertSame($this->member->expired_at, $updated->expired_at);
        $this->assertSame($this->plan->id, $updated->plan_id);
        $this->assertSame(10, $this->plan->fresh()->prices['monthly']);
    }

    public function test_permanent_subscriber_can_select_an_explicitly_free_reset(): void
    {
        $this->member->update(['expired_at' => null]);
        $this->plan->update(['prices' => ['reset_traffic' => 0]]);
        $this->getJson('/api/v1/user/getSubscribe')->assertOk()->assertJsonPath('data.can_purchase_reset', true);
        $this->getJson('/api/v1/user/plan/fetch?id='.$this->plan->id)->assertOk()->assertJsonPath('data.reset_price', 0);
        $this->postJson('/api/v1/user/order/save', ['plan_id' => $this->plan->id, 'period' => 'reset_price'])->assertOk();
    }

    public static function ineligibleMembers(): array
    {
        return [
            'expired' => [['expired_at' => 1]],
            'banned' => [['banned' => true]],
            'no traffic allowance' => [['transfer_enable' => 0]],
            'no plan' => [['plan_id' => null]],
            'missing reset price' => [[], ['monthly' => 10]],
            'null reset price' => [[], ['monthly' => 10, 'reset_traffic' => null]],
        ];
    }

    #[DataProvider('ineligibleMembers')]
    public function test_eligibility_is_enforced_at_every_entry(array $attributes, ?array $prices = null): void
    {
        $this->member->update($attributes);
        if ($prices !== null) {
            $this->plan->update(['prices' => $prices]);
        }
        $this->getJson('/api/v1/user/getSubscribe')->assertOk()->assertJsonPath('data.can_purchase_reset', false);
        $this->getJson('/api/v1/user/plan/fetch?id='.$this->plan->id)->assertStatus(400);
        $this->postJson('/api/v1/user/order/save', ['plan_id' => $this->plan->id, 'period' => 'reset_price'])
            ->assertStatus(400);
        $this->assertSame(0, Order::count());
    }

    public function test_public_plan_offers_normal_periods_to_new_buyers_and_only_resets_to_existing_members(): void
    {
        $this->plan->update(['show' => true, 'sell' => true, 'capacity_limit' => null]);
        $path = '/api/v1/user/plan/fetch?id='.$this->plan->id;
        $this->getJson($path)->assertOk()->assertJsonPath('data.month_price', null)->assertJsonPath('data.reset_price', 250);
        $this->plan->update(['renew' => true]);
        $this->getJson($path)->assertOk()->assertJsonPath('data.month_price', 1000)->assertJsonPath('data.reset_price', 250);
        $this->plan->update(['renew' => false]);
        $this->member->update(['plan_id' => null]);
        $this->getJson($path)->assertOk()->assertJsonPath('data.month_price', 1000)->assertJsonPath('data.reset_price', null);
        $this->postJson('/api/v1/user/order/save', ['plan_id' => $this->plan->id, 'period' => 'reset_price'])->assertStatus(400);
        $this->postJson('/api/v1/user/order/save', ['plan_id' => $this->plan->id, 'period' => 'month_price'])->assertOk();
    }
}
