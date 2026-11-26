<?php

namespace Tests\Feature\Admin;

use App\Models\Plan;
use App\Models\Server;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PlanForcedRosterTest extends TestCase
{
    use RefreshDatabase;

    private function subscriber(int $id, array $fields): User
    {
        return User::withoutEvents(fn () => User::forceCreate($fields + [
            'id' => $id, 'email' => "sub-{$id}@example.test", 'password' => 'fixture',
            'uuid' => sprintf('00000000-0000-4000-8000-%012d', $id),
            'token' => sprintf('%032d', $id), 'transfer_enable' => 1073741824, 'expired_at' => null,
        ]));
    }

    private function node(array $groups, bool $online = true): int
    {
        $node = Server::withoutEvents(fn () => Server::create(['name' => 'roster', 'type' => 'vless',
            'host' => 'example.test', 'port' => 443, 'server_port' => 443, 'rate' => 1,
            'group_ids' => $groups]));
        if ($online) Cache::put("node_ws_alive:{$node->id}", true, 60);
        return $node->id;
    }

    private function savePlan(Plan $plan, bool $force, int $group, int $speed): void
    {
        $this->postJson('/api/v2/'.hash('crc32b', config('app.key')).'/plan/save', [
            'id' => $plan->id, 'name' => $plan->name, 'group_id' => $group,
            'transfer_enable' => 2, 'speed_limit' => $speed, 'device_limit' => 3, 'force_update' => $force,
        ])->assertOk()->assertJsonPath('data', true);
    }

    public function test_force_refreshes_each_affected_online_node_once_after_commit(): void
    {
        Sanctum::actingAs($this->subscriber(10, ['is_admin' => true]));
        $plan = Plan::create(['name' => 'scope', 'transfer_enable' => 1, 'group_id' => 7]);
        $this->subscriber(11, ['plan_id' => $plan->id, 'group_id' => 7]);
        $this->subscriber(12, ['plan_id' => $plan->id, 'group_id' => 9]);
        $this->subscriber(13, ['plan_id' => $plan->id, 'group_id' => 7, 'banned' => true]);
        $this->subscriber(14, ['plan_id' => 999, 'group_id' => 7]);
        $old = $this->node(['7']);
        $custom = $this->node([9]);
        $new = $this->node([8]);
        $overlap = $this->node([7, '8', 9]);
        $this->node([25]);
        $this->node([8], false);
        $messages = [];
        Redis::shouldReceive('publish')->andReturnUsing(function ($channel, $payload) use (&$messages) {
            $message = json_decode($payload, true);
            $this->assertSame('node:push', $channel);
            $this->assertSame('sync.users', $message['event']);
            $messages[$message['node_id']][] = $message['data']['users'];
            return 1;
        });
        DB::beginTransaction();
        $this->savePlan($plan, true, 8, 30);
        $this->assertSame([], $messages);
        DB::rollBack();
        $this->assertSame([], $messages);
        $this->assertSame(7, (int) User::find(11)->group_id);

        $this->savePlan($plan, false, 8, 30);
        $this->assertSame([], $messages);
        $this->savePlan($plan, true, 8, 30);
        $this->assertEqualsCanonicalizing([$old, $custom, $new, $overlap], array_keys($messages));
        foreach ($messages as $payloads) $this->assertCount(1, $payloads);
        $this->assertSame([], $messages[$custom][0]);
        $this->assertSame([14], array_column($messages[$old][0], 'id'));
        $this->assertEqualsCanonicalizing([11, 12, 14], array_column($messages[$overlap][0], 'id'));
        $this->assertEqualsCanonicalizing([11, 12], array_column($messages[$new][0], 'id'));
        foreach ($messages[$new][0] as $user) {
            $this->assertEquals(30, $user['speed_limit']);
            $this->assertEquals(3, $user['device_limit']);
        }
        $this->assertDatabaseHas('v2_user', ['id' => 12, 'group_id' => 8, 'transfer_enable' => 2147483648]);
        $messages = [];
        $this->savePlan($plan, true, 8, 45);
        $this->assertEqualsCanonicalizing([$new, $overlap], array_keys($messages));
        $this->assertEquals(45, $messages[$new][0][0]['speed_limit']);
    }
}
