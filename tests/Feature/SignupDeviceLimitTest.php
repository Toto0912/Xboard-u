<?php

namespace Tests\Feature;

use App\Models\Plan;
use App\Models\Server;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SignupDeviceLimitTest extends TestCase
{
    use RefreshDatabase;

    private function plan(?int $limit): Plan
    {
        return Plan::create([
            'name' => 'Device plan', 'group_id' => 7, 'transfer_enable' => 9,
            'speed_limit' => 12, 'device_limit' => $limit, 'capacity_limit' => null, 'prices' => ['monthly' => 5],
        ]);
    }

    public function test_trial_and_admin_accounts_publish_their_plan_limits_to_the_node(): void
    {
        $trialPlan = $this->plan(1);
        $paidPlan = $this->plan(3);
        admin_setting(['try_out_plan_id' => $trialPlan->id, 'server_token' => 'limit-test']);
        $node = Server::create([
            'name' => 'limit-node', 'type' => 'vless', 'host' => 'example.test', 'port' => 443,
            'server_port' => 443, 'rate' => 1, 'group_ids' => [7],
        ]);
        $this->postJson('/api/v1/passport/auth/register', [
            'email' => 'trial@example.com', 'password' => 'password123',
        ])->assertOk();

        $admin = User::create([
            'email' => 'admin@example.com', 'password' => 'fixture', 'uuid' => (string) Str::uuid(),
            'token' => Str::random(24), 'is_admin' => true,
        ]);
        Sanctum::actingAs($admin);
        $url = '/api/v2/' . hash('crc32b', config('app.key')) . '/user/generate';
        $explicit = ['plan_id' => $paidPlan->id, 'email_suffix' => 'example.com'];
        $this->postJson($url, $explicit + ['email_prefix' => 'manual'])->assertOk();
        $this->postJson($url, $explicit + ['email_prefix' => 'batch', 'generate_count' => 2])->assertOk();

        $roster = $this->getJson("/api/v2/server/user?node_id={$node->id}&token=limit-test")
            ->assertOk()->json('users');
        $deviceLimits = array_column($roster, 'device_limit', 'id');
        $expected = ['trial' => 1, 'manual' => 3, 'batch_1' => 3, 'batch_2' => 3];
        foreach ($expected as $local => $limit) {
            $user = User::byEmail("$local@example.com")->firstOrFail();
            $this->assertSame($limit, $user->device_limit);
            $this->assertSame($limit, $deviceLimits[$user->id]);
        }
    }

    public function test_unlimited_trial_preserves_the_plans_zero_or_null_limit(): void
    {
        foreach ([0, null] as $i => $unlimited) {
            $plan = $this->plan($unlimited);
            admin_setting(['try_out_plan_id' => $plan->id]);
            $email = "unlimited{$i}@example.com";
            $this->postJson('/api/v1/passport/auth/register', [
                'email' => $email, 'password' => 'password123',
            ])->assertOk();
            $user = User::byEmail($email)->firstOrFail();
            $this->assertEquals($plan->id, $user->plan_id);
            $this->assertSame($unlimited, $user->device_limit);
        }
    }
}
