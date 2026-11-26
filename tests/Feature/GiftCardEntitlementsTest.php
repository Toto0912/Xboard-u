<?php

namespace Tests\Feature;

use App\Models\GiftCardCode;
use App\Models\GiftCardTemplate;
use App\Models\GiftCardUsage;
use App\Models\Plan;
use App\Models\User;
use App\Services\Plugin\HookManager;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class GiftCardEntitlementsTest extends TestCase
{
    use RefreshDatabase;

    private const GIB = 1073741824;
    private const URL = '/api/v1/user/gift-card/';

    private function plan(?int $deviceLimit): Plan
    {
        return Plan::create(['name' => 'Gift plan', 'group_id' => 1, 'transfer_enable' => 100,
            'prices' => ['onetime' => 10], 'device_limit' => $deviceLimit, 'capacity_limit' => null]);
    }

    private function member(array $attributes = []): User
    {
        return User::withoutEvents(fn () => User::create($attributes + [
            'email' => Str::random(10).'@example.test', 'uuid' => (string) Str::uuid(),
            'password' => 'fixture', 'token' => Str::random(32), 'balance' => 0,
        ]));
    }

    private function gift(array $rewards, int $type = GiftCardTemplate::TYPE_GENERAL): GiftCardCode
    {
        $template = GiftCardTemplate::create(['name' => 'Gift', 'type' => $type, 'status' => true,
            'rewards' => $rewards, 'admin_id' => 1]);
        return GiftCardCode::create(['template_id' => $template->id, 'code' => GiftCardCode::generateCode()]);
    }

    public function test_permanent_expiry_and_unlimited_devices_reject_pure_topups_without_spending_codes(): void
    {
        $plan = $this->plan(null);
        foreach ([null, 0] as $unlimited) {
            $user = $this->member(['plan_id' => $plan->id, 'expired_at' => null, 'device_limit' => $unlimited]);
            Sanctum::actingAs($user);
            foreach ([['expire_days' => 7], ['device_limit' => 1]] as $reward) {
                $card = $this->gift($reward);
                $params = ['code' => $card->code];
                $this->postJson(self::URL.'check', $params)->assertOk()->assertJsonPath('data.can_redeem', false);
                $this->postJson(self::URL.'redeem', $params)->assertStatus(400);
                $this->assertNull($user->fresh()->expired_at);
                $this->assertSame($unlimited, $user->fresh()->device_limit);
                $this->assertSame(0, (int) $card->fresh()->usage_count);
                $this->assertSame(GiftCardCode::STATUS_UNUSED, (int) $card->fresh()->status);
            }
        }
        $this->assertDatabaseCount('v2_gift_card_usage', 0);
    }

    public function test_mixed_topup_records_and_previews_only_the_entitlements_that_can_be_applied(): void
    {
        $plan = $this->plan(null);
        $user = $this->member(['plan_id' => $plan->id, 'expired_at' => null, 'device_limit' => 0]);
        $card = $this->gift(['expire_days' => 7, 'device_limit' => 1, 'balance' => 250]);
        Sanctum::actingAs($user);
        $params = ['code' => $card->code];
        $this->postJson(self::URL.'check', $params)->assertOk()->assertJsonPath('data.can_redeem', true)
            ->assertJsonPath('data.reward_preview', ['balance' => 250]);
        $this->postJson(self::URL.'redeem', $params)->assertOk()->assertJsonPath('data.rewards', ['balance' => 250]);
        $user->refresh();
        $this->assertNull($user->expired_at);
        $this->assertSame(0, (int) $user->device_limit);
        $this->assertSame(250, (int) $user->balance);
        $this->assertSame(['balance' => 250], GiftCardUsage::sole()->rewards_given);
        $this->assertSame(1, (int) $card->fresh()->usage_count);
    }

    public function test_device_card_can_set_the_initial_limit_on_an_empty_account_but_protects_standalone_quota(): void
    {
        $user = $this->member(['plan_id' => null, 'transfer_enable' => 0, 'device_limit' => null]);
        $card = $this->gift(['device_limit' => 2]);
        Sanctum::actingAs($user);
        $this->postJson(self::URL.'redeem', ['code' => $card->code])->assertOk()->assertJsonPath('data.rewards.device_limit', 2);
        $this->assertSame(2, (int) $user->fresh()->device_limit);

        $custom = $this->member(['plan_id' => null, 'transfer_enable' => self::GIB, 'device_limit' => null]);
        $card = $this->gift(['device_limit' => 2]);
        Sanctum::actingAs($custom);
        $this->postJson(self::URL.'redeem', ['code' => $card->code])->assertStatus(400);
        $this->assertNull($custom->fresh()->device_limit);
        $this->assertSame(0, (int) $card->fresh()->usage_count);
    }

    public function test_topups_still_extend_a_finite_expiry_and_increment_a_positive_device_limit(): void
    {
        $expires = time() + 86400;
        $user = $this->member(['plan_id' => $this->plan(2)->id, 'expired_at' => $expires,
            'device_limit' => 2, 'transfer_enable' => self::GIB, 'u' => 100]);
        $card = $this->gift(['expire_days' => 7, 'device_limit' => 1, 'transfer_enable' => 200, 'reset_package' => true]);
        $quotaAtReset = null;
        HookManager::register('traffic.reset.after', function (User $resetUser) use (&$quotaAtReset) {
            $quotaAtReset = (int) $resetUser->transfer_enable;
        });
        Sanctum::actingAs($user);
        $this->postJson(self::URL.'redeem', ['code' => $card->code])->assertOk();
        $user->refresh();
        $this->assertSame($expires + 7 * 86400, (int) $user->expired_at);
        $this->assertSame(3, (int) $user->device_limit);
        $this->assertSame(0, (int) $user->u);
        $this->assertSame(self::GIB + 200, $quotaAtReset);
        $this->assertSame($quotaAtReset, (int) $user->transfer_enable);
    }

    public function test_plan_card_assigns_base_then_adds_traffic_and_devices_and_sets_initial_expiry(): void
    {
        $plan = $this->plan(2);
        $user = $this->member(['expired_at' => null, 'device_limit' => null]);
        $bonus = 20 * self::GIB;
        $card = $this->gift(['plan_id' => $plan->id, 'plan_validity_days' => 7,
            'transfer_enable' => $bonus, 'device_limit' => 1], GiftCardTemplate::TYPE_PLAN);
        Sanctum::actingAs($user);
        $started = time();
        $this->postJson(self::URL.'redeem', ['code' => $card->code])->assertOk()
            ->assertJsonPath('data.rewards.transfer_enable', $bonus)->assertJsonPath('data.rewards.device_limit', 1);
        $user->refresh();
        $this->assertSame((int) $plan->id, (int) $user->plan_id);
        $this->assertSame(120 * self::GIB, (int) $user->transfer_enable);
        $this->assertSame(3, (int) $user->device_limit);
        $this->assertGreaterThanOrEqual($started + 7 * 86400, (int) $user->expired_at);
        $this->assertLessThanOrEqual(time() + 7 * 86400, (int) $user->expired_at);
        $this->assertSame($bonus, GiftCardUsage::sole()->rewards_given['transfer_enable']);
    }

    public function test_new_unlimited_plan_keeps_its_limit_when_a_mystery_card_adds_extra_devices(): void
    {
        $plan = $this->plan(null);
        $user = $this->member(['device_limit' => 3]);
        $card = $this->gift(['random_rewards' => [['weight' => 1, 'plan_id' => $plan->id,
            'plan_validity_days' => 7, 'device_limit' => 1, 'transfer_enable' => self::GIB]]],
            GiftCardTemplate::TYPE_MYSTERY);
        Sanctum::actingAs($user);
        $this->postJson(self::URL.'redeem', ['code' => $card->code])->assertOk()
            ->assertJsonMissingPath('data.rewards.device_limit');
        $this->assertNull($user->fresh()->device_limit);
        $this->assertSame(101 * self::GIB, (int) $user->fresh()->transfer_enable);
        $this->assertArrayNotHasKey('device_limit', $card->fresh()->actual_rewards);
        $this->assertArrayNotHasKey('device_limit', GiftCardUsage::sole()->rewards_given);
    }

    public function test_mystery_draw_that_cannot_increase_an_unlimited_entitlement_is_consumed_once(): void
    {
        $user = $this->member(['plan_id' => $this->plan(0)->id, 'expired_at' => null, 'device_limit' => 0]);
        $card = $this->gift(['random_rewards' => [['weight' => 1, 'device_limit' => 1]]],
            GiftCardTemplate::TYPE_MYSTERY);
        Sanctum::actingAs($user);
        $params = ['code' => $card->code];
        $this->postJson(self::URL.'redeem', $params)->assertOk()->assertJsonPath('data.rewards', []);
        $this->postJson(self::URL.'redeem', $params)->assertStatus(400);
        $this->assertSame(0, (int) $user->fresh()->device_limit);
        $this->assertSame(1, (int) $card->fresh()->usage_count);
        $this->assertSame([], GiftCardUsage::sole()->rewards_given);
    }
}
