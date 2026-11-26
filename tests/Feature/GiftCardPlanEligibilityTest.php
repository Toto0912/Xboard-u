<?php

namespace Tests\Feature;

use App\Models\GiftCardCode;
use App\Models\GiftCardTemplate;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class GiftCardPlanEligibilityTest extends TestCase
{
    use RefreshDatabase;

    public static function allowedPlans(): array
    {
        return [
            'unsubscribed with restriction' => [null, [73], false],
            'other subscription' => [72, [73], false],
            'matching integer' => [73, [73], true],
            'matching legacy string' => [73, ['73'], true],
            'matching zero-padded legacy string' => [73, ['0073'], true],
            'invalid boolean is not a plan id' => [73, [true], false],
            'unrestricted' => [null, null, true],
            'explicit empty list' => [73, [], true],
        ];
    }

    #[DataProvider('allowedPlans')]
    public function test_balance_card_preview_and_redemption_follow_the_same_plan_list(
        ?int $userPlan, ?array $allowedPlans, bool $canRedeem
    ): void {
        $user = User::create([
            'email' => 'member@example.com', 'password' => 'fixture', 'uuid' => (string) Str::uuid(),
            'token' => Str::random(24), 'balance' => 100, 'plan_id' => $userPlan,
            'expired_at' => time() - 60,
        ]);
        $template = GiftCardTemplate::create([
            'name' => 'Balance gift', 'type' => GiftCardTemplate::TYPE_GENERAL, 'admin_id' => 1,
            'status' => true, 'rewards' => ['balance' => 25],
            'conditions' => $allowedPlans === null ? [] : ['allowed_plans' => $allowedPlans],
        ]);
        $code = GiftCardCode::create(['template_id' => $template->id, 'code' => 'PLANLIMITEDGIFT']);
        Sanctum::actingAs($user);
        $payload = ['code' => $code->code];
        $this->postJson('/api/v1/user/gift-card/check', $payload)
            ->assertOk()->assertJsonPath('data.can_redeem', $canRedeem);
        $this->postJson('/api/v1/user/gift-card/redeem', $payload)->assertStatus($canRedeem ? 200 : 400);

        $this->assertSame($canRedeem ? 125 : 100, (int) $user->fresh()->balance);
        $this->assertSame($canRedeem ? 1 : 0, (int) $code->fresh()->usage_count);
        $this->assertDatabaseCount('v2_gift_card_usage', $canRedeem ? 1 : 0);
    }
}
