<?php

namespace Tests\Feature\Server;

use App\Http\Controllers\V1\Server\UniProxyController;
use App\Http\Controllers\V2\Admin\UserController;
use App\Http\Middleware\ServerV2;
use App\Http\Requests\Admin\UserUpdate;
use App\Jobs\NodeUserSyncJob;
use App\Models\Plan;
use App\Models\Server;
use App\Models\User;
use App\Services\NodeSyncService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class NodeUserAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    private function user(int $id, array $attributes = []): User
    {
        return User::withoutEvents(fn () => User::forceCreate($attributes + [
            'id' => $id, 'email' => "node-user-{$id}@example.test", 'password' => 'test-hash',
            'uuid' => sprintf('00000000-0000-4000-8000-%012d', $id), 'token' => sprintf('%032d', $id),
            'group_id' => 7, 'plan_id' => 1, 'transfer_enable' => 100, 'u' => 30, 'd' => 69,
            'expired_at' => null, 'speed_limit' => 20, 'device_limit' => 3,
        ]));
    }

    private function onlineNode(): Server
    {
        $node = Server::withoutEvents(fn () => Server::create([
            'name' => 'node-access', 'type' => 'vless', 'host' => 'example.test',
            'port' => 443, 'server_port' => 443, 'rate' => 1, 'group_ids' => ['7', 8],
        ]));
        Cache::put(\App\WebSocket\NodeWorker::HEARTBEAT_CACHE_KEY, time(), 30);
        Cache::put("node_ws_alive:{$node->id}", true, 60);
        return $node;
    }

    public function test_rest_roster_and_ws_deltas_agree_at_authorization_boundaries(): void
    {
        $this->freezeTime();
        $now = now()->timestamp;
        admin_setting(['server_token' => 'node-access-test']);
        $node = $this->onlineNode();
        $fixtures = [
            1 => [], 2 => ['expired_at' => $now + 1, 'group_id' => 8],
            3 => ['plan_id' => null], 4 => ['expired_at' => $now], 5 => ['expired_at' => $now - 1],
            6 => ['d' => 70], 7 => ['d' => 71], 8 => ['banned' => true],
            9 => ['group_id' => null], 10 => ['group_id' => 9],
        ];
        $users = [];
        foreach ($fixtures as $id => $attributes) {
            $users[] = $this->user($id, $attributes);
        }
        $roster = $this->getJson("/api/v2/server/user?node_id={$node->id}&token=node-access-test")
            ->assertOk()->json('users');
        $this->assertEqualsCanonicalizing([1, 2], array_column($roster, 'id'));
        $this->assertEqualsCanonicalizing(['id', 'uuid', 'speed_limit', 'device_limit'], array_keys($roster[0]));

        $actions = [];
        Redis::shouldReceive('publish')->withArgs(function ($channel, $message) use (&$actions, $node) {
            $push = json_decode($message, true);
            $this->assertSame('node:push', $channel);
            $this->assertSame($node->id, $push['node_id']);
            $this->assertSame('sync.user.delta', $push['event']);
            $actions[$push['data']['users'][0]['id']] = $push['data']['action'];
            return true;
        })->times(8);
        foreach ($users as $user) {
            NodeSyncService::notifyUserChanged($user);
        }
        $this->assertSame([1 => 'add', 'add', 'remove', 'remove', 'remove', 'remove', 'remove', 'remove'], $actions);
    }

    public function test_admin_omitted_cleared_and_replaced_plans_update_node_access(): void
    {
        Bus::fake([NodeUserSyncJob::class]);
        Sanctum::actingAs($this->user(20, ['is_admin' => true, 'group_id' => null]));
        $node = $this->onlineNode();
        $oldPlan = Plan::create(['name' => 'old', 'group_id' => 7, 'transfer_enable' => 100]);
        $newPlan = Plan::create(['name' => 'new', 'group_id' => 8, 'transfer_enable' => 100]);
        $user = $this->user(21, ['plan_id' => $oldPlan->id]);
        $path = '/api/v2/' . hash('crc32b', config('app.key')) . '/user/update';

        $this->postJson($path, ['id' => $user->id, 'remarks' => 'updated'])->assertOk()->assertJsonPath('data', true);
        $this->assertDatabaseHas('v2_user', ['id' => $user->id, 'plan_id' => $oldPlan->id, 'group_id' => 7]);
        Bus::assertNotDispatched(NodeUserSyncJob::class);

        $this->postJson($path, ['id' => $user->id, 'plan_id' => null])->assertOk()->assertJsonPath('data', true);
        $this->assertDatabaseHas('v2_user', ['id' => $user->id, 'plan_id' => null, 'group_id' => null]);
        Bus::assertDispatchedTimes(NodeUserSyncJob::class, 1);
        $expected = ['node_id' => $node->id, 'event' => 'sync.user.delta',
            'data' => ['action' => 'remove', 'users' => [['id' => $user->id]]]];
        Redis::shouldReceive('publish')->once()->with('node:push', json_encode($expected));
        Bus::dispatched(NodeUserSyncJob::class)->first()->handle();

        $this->postJson($path, ['id' => $user->id, 'plan_id' => $newPlan->id])->assertOk()->assertJsonPath('data', true);
        $this->assertDatabaseHas('v2_user', ['id' => $user->id, 'plan_id' => $newPlan->id, 'group_id' => 8]);
    }

    public function test_replica_lag_cannot_restore_a_revoked_user_or_route_users_to_a_former_group(): void
    {
        admin_setting(['server_token' => 'roster-test']);
        $this->assertSame('roster-test', admin_setting('server_token'));
        $node = $this->onlineNode();
        $revoked = $this->user(31, ['plan_id' => null, 'group_id' => null]);
        $otherGroup = $this->user(32, ['group_id' => 9]);
        $replica = new \PDO('sqlite::memory:');
        $replica->exec('CREATE TABLE v2_user (id INTEGER, uuid TEXT, plan_id INTEGER, group_id INTEGER, u INTEGER,
            d INTEGER, transfer_enable INTEGER, banned INTEGER, expired_at INTEGER, speed_limit INTEGER, device_limit INTEGER)');
        foreach ([[$revoked, 7], [$otherGroup, 9]] as [$user, $group]) {
            $replica->prepare('INSERT INTO v2_user VALUES (?, ?, 1, ?, 0, 0, 100, 0, NULL, NULL, NULL)')
                ->execute([$user->id, $user->uuid, $group]);
        }
        $replica->exec('CREATE TABLE v2_server (id INTEGER, code TEXT, type TEXT, group_ids TEXT)');
        $replica->prepare('INSERT INTO v2_server VALUES (?, NULL, ?, ?)')->execute([$node->id, 'vless', '[9]']);
        $default = DB::getDefaultConnection();
        config(['database.connections.roster_split' => config("database.connections.{$default}")]);
        $split = DB::connection('roster_split');
        $split->setPdo(DB::connection($default)->getPdo())->setReadPdo($replica);
        DB::setDefaultConnection('roster_split');
        try {
            $this->assertTrue(User::findOrFail($revoked->id)->isAvailable());
            $this->assertSame([9], Server::findOrFail($node->id)->group_ids);
            $events = [];
            Redis::shouldReceive('publish')->andReturnUsing(function ($channel, $message) use (&$events) {
                $events[] = json_decode($message, true);
                return 1;
            });
            (new NodeUserSyncJob($revoked->id, 'updated', 7))->handle();
            (new NodeUserSyncJob($otherGroup->id, 'updated'))->handle();
            NodeSyncService::notifyUsersUpdatedByGroup(9);
            $this->assertSame([['node_id' => $node->id, 'event' => 'sync.user.delta',
                'data' => ['action' => 'remove', 'users' => [['id' => $revoked->id]]]]], $events);

            $request = Request::create('/api/v2/server/user', 'GET', ['token' => 'roster-test', 'node_id' => $node->id]);
            $response = (new ServerV2())->handle($request, fn ($req) => app(UniProxyController::class)->user($req));
            $this->assertSame(200, $response->getStatusCode());
            $this->assertSame(['users' => []], json_decode($response->getContent(), true));
        } finally {
            DB::setDefaultConnection($default);
            DB::purge('roster_split');
        }
    }

    public function test_admin_plan_edits_read_the_current_user_and_target_plan_from_primary(): void
    {
        Bus::fake([NodeUserSyncJob::class]);
        $oldPlan = Plan::create(['name' => 'old', 'group_id' => 7, 'transfer_enable' => 100]);
        $newPlan = Plan::create(['name' => 'new', 'group_id' => 8, 'transfer_enable' => 100]);
        $user = $this->user(41, ['plan_id' => $oldPlan->id]);
        $replica = new \PDO('sqlite::memory:');
        $replica->exec('CREATE TABLE v2_user (id INTEGER, plan_id INTEGER, group_id INTEGER)');
        $replica->prepare('INSERT INTO v2_user VALUES (?, NULL, NULL)')->execute([$user->id]);
        $replica->exec('CREATE TABLE v2_plan (id INTEGER, group_id INTEGER)');
        $replica->prepare('INSERT INTO v2_plan VALUES (?, 7)')->execute([$newPlan->id]);

        $default = DB::getDefaultConnection();
        config(['database.connections.admin_split' => config("database.connections.{$default}")]);
        $split = DB::connection('admin_split');
        $split->setPdo(DB::connection($default)->getPdo())->setReadPdo($replica);
        DB::setDefaultConnection('admin_split');
        try {
            $this->assertNull(User::findOrFail($user->id)->plan_id);
            $this->assertSame(7, Plan::findOrFail($newPlan->id)->group_id);
            foreach ([[null, null], [$newPlan->id, 8]] as [$planId, $group]) {
                $request = UserUpdate::create('/user/update', 'POST', ['id' => $user->id, 'plan_id' => $planId]);
                $request->setContainer($this->app)->setRedirector($this->app['redirect']);
                $request->validateResolved();
                $response = app(UserController::class)->update($request);
                $this->assertTrue($response->getData(true)['data']);
                $stored = User::query()->useWritePdo()->findOrFail($user->id);
                $this->assertSame($planId, $stored->plan_id);
                $this->assertSame($group, $stored->group_id);
            }
            Bus::assertDispatchedTimes(NodeUserSyncJob::class, 2);
        } finally {
            DB::setDefaultConnection($default);
            DB::purge('admin_split');
        }
    }
}
