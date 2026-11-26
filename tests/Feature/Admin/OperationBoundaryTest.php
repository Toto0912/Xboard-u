<?php

namespace Tests\Feature\Admin;

use App\Console\Commands\CheckExpiredUsers;
use App\Http\Middleware\ApplyRuntimeSettings;
use App\Models\Plan;
use App\Models\Server;
use App\Models\TrafficResetLog;
use App\Models\User;
use App\Services\MailService;
use App\Services\NodeSyncService;
use App\Services\ServerService;
use App\Services\TrafficResetService;
use App\WebSocket\NodeWorker;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Facades\URL;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class OperationBoundaryTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private string $root;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = User::withoutEvents(fn () => User::forceCreate([
            'email' => 'boundaries@example.test', 'password' => 'unused', 'is_admin' => 1, 'uuid' => (string) \Illuminate\Support\Str::uuid(),
            'token' => str_repeat('a', 32), 'group_id' => 1, 'transfer_enable' => 400,
        ]));
        Sanctum::actingAs($this->admin);
        $this->root = '/api/v2/' . hash('crc32b', config('app.key'));
    }

    private function node(array $fields = []): Server
    {
        return Server::withoutEvents(fn () => Server::forceCreate($fields + ['name' => 'parent',
            'type' => 'vmess', 'host' => '127.0.0.1', 'port' => 80, 'server_port' => 80, 'group_ids' => [1],
            'rate' => 1, 'show' => true, 'enabled' => true]));
    }

    public function test_list_fields_are_bounded_and_frontend_sort_fields_work(): void
    {
        foreach (['user', 'order', 'ticket', 'coupon'] as $resource) {
            $url = $this->root . '/' . $resource . '/fetch?';
            $this->getJson($url . http_build_query(['filter' => [['id' => 'nonexistent', 'value' => 'example']]]))->assertStatus(422);
            $this->getJson($url . http_build_query(['sort' => [['id' => 'nonexistent', 'desc' => 'false']]]))->assertStatus(422);
        }
        foreach (['total_used', 'online_count'] as $field) {
            $this->getJson($this->root . '/user/fetch?' . http_build_query(['sort' => [['id' => $field, 'desc' => 'false']]]))->assertOk();
        }
        foreach (['pending' => null, 'settled' => time()] as $trade => $paidAt) {
            \Illuminate\Support\Facades\DB::table('v2_order')->insert(['user_id' => $this->admin->id, 'plan_id' => 1,
                'type' => 1, 'period' => 'monthly', 'trade_no' => $trade, 'total_amount' => 100,
                'created_at' => time(), 'updated_at' => time(), 'paid_at' => $paidAt]);
        }
        foreach (['null:' => 'pending', 'notnull:' => 'settled'] as $op => $expected) {
            $this->getJson($this->root . '/order/fetch?' . http_build_query(['filter' => [['id' => 'paid_at', 'value' => $op]]]))
                ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.trade_no', $expected);
        }
    }

    public function test_missing_and_malformed_user_requests_and_compatibility_routes(): void
    {
        $this->getJson('/api/v1/user/ticket/fetch?id=999999')->assertJsonPath('status', 'fail');
        $this->postJson('/api/v1/user/gift-card/check', ['code' => ['bad']])->assertStatus(422);
        $this->getJson('/api/v1/user/knowledge/getCategory?language=en-US')->assertOk();
        $this->getJson($this->root . '/stat/getRanking?type=unknown')->assertStatus(422);
        $this->getJson($this->root . '/stat/getRanking?type=invite_rank&limit=3')->assertOk();
        $this->postJson($this->root . '/notice/update', ['title' => 'sample', 'content' => 'body'])->assertStatus(422);
    }

    public function test_manual_reset_locks_current_values_and_deduplicates_optional_operation_id(): void
    {
        $plan = Plan::forceCreate(['name' => 'monthly', 'group_id' => 1, 'transfer_enable' => 1]);
        $this->admin->forceFill(['plan_id' => $plan->id, 'expired_at' => null])->saveQuietly();
        User::query()->whereKey($this->admin->id)->update(['u' => 123, 'd' => 234]);
        $service = app(TrafficResetService::class);
        $meta = ['admin_id' => $this->admin->id, 'reason' => 'manual correction', 'operation_id' => (string) \Illuminate\Support\Str::uuid()];
        $this->assertTrue($service->manualReset($this->admin, $meta));
        $this->assertTrue($service->manualReset($this->admin, $meta));
        $record = TrafficResetLog::query()->sole();
        $this->assertSame(357, (int) $record->old_total);
        $this->assertEquals($meta, $record->metadata);
        $this->assertTrue($service->manualReset($this->admin, ['reason' => 'independent action']));
        $this->assertSame(2, TrafficResetLog::count());
    }

    public function test_hidden_enabled_route_changes_publish_after_commit_only(): void
    {
        $route = \App\Models\ServerRoute::create(['remarks' => 'route', 'match' => ['example.org'], 'action' => 'block']);
        $hidden = $this->node(['show' => false, 'route_ids' => [(string) $route->id]]);
        $inactive = $this->node(['enabled' => false, 'route_ids' => [$route->id]]);
        Cache::put(NodeWorker::HEARTBEAT_CACHE_KEY, time(), 30);
        foreach ([$hidden, $inactive] as $node) Cache::put("node_ws_alive:{$node->id}", true, 120);
        $messages = [];
        Redis::shouldReceive('publish')->andReturnUsing(function ($key, $msg) use (&$messages) {
            $messages[] = json_decode($msg, true);
            return 1;
        });
        $db = $route->getConnection();
        $db->beginTransaction();
        $route->update(['match' => ['discarded.example']]);
        $db->rollBack();
        $this->assertSame([], $messages);
        $db->transaction(function () use ($route, &$messages) {
            $route->refresh()->update(['match' => ['committed.example']]);
            $this->assertSame([], $messages);
        });
        $this->assertSame([$hidden->id], array_column($messages, 'node_id'));
        $this->assertSame('sync.config', $messages[0]['event']);
    }

    public function test_late_publish_failure_keeps_watermark_and_pending_generation(): void
    {
        $node = $this->node();
        Cache::put("node_ws_alive:{$node->id}", true, 120);
        $this->assertFalse(NodeSyncService::isNodeOnline($node->id));
        Cache::put(NodeWorker::HEARTBEAT_CACHE_KEY, time(), 30);
        $this->assertTrue(NodeSyncService::isNodeOnline($node->id));
        $this->admin->forceFill(['expired_at' => time() - 20])->saveQuietly();
        $start = time() - 120;
        Cache::put(CheckExpiredUsers::WATERMARK_CACHE_KEY, $start);
        Redis::shouldReceive('publish')->once()->andThrow(new \RuntimeException('isolated outage'));
        try {
            $this->artisan('check:expired-users')->run();
            $this->fail('Expected publish failure');
        } catch (\RuntimeException $e) {
            $this->assertSame('isolated outage', $e->getMessage());
        }
        $this->assertSame($start, Cache::get(CheckExpiredUsers::WATERMARK_CACHE_KEY));
        Redis::shouldReceive('publish')->once()->andReturn(0);
        $this->artisan('check:expired-users')->assertSuccessful();
        $this->assertGreaterThan($start, Cache::get(CheckExpiredUsers::WATERMARK_CACHE_KEY));
    }

    public function test_bulk_ban_only_revokes_the_selected_locked_rows(): void
    {
        $make = static fn (string $name) => User::withoutEvents(fn () => User::forceCreate([
            'uuid' => (string) \Illuminate\Support\Str::uuid(), 'token' => \Illuminate\Support\Str::random(32),
            'password' => 'sample', 'email' => "$name@example.test", 'group_id' => 777, 'banned' => false,
        ]));
        $before = $make('before');
        $beforeToken = $before->createToken('existing')->accessToken->id;
        $late = null;
        $armed = true;
        \Illuminate\Support\Facades\DB::listen(function ($query) use (&$armed, &$late, $make) {
            $sql = str_replace(['"', chr(96)], '', strtolower($query->sql));
            if ($armed && str_contains($sql, 'select id, group_id from v2_user')) {
                $armed = false;
                $late = $make('late');
                $late->createToken('after-selection');
            }
        });
        $this->postJson($this->root . '/user/ban', ['scope' => 'filtered',
            'filter' => [['id' => 'group_id', 'value' => 'eq:777']]])->assertOk();
        $this->assertNotNull($late);
        $this->assertTrue((bool) $before->fresh()->banned);
        $this->assertDatabaseMissing('personal_access_tokens', ['id' => $beforeToken]);
        $this->assertFalse((bool) $late->fresh()->banned);
        $this->assertSame(1, $late->tokens()->count());
    }

    public function test_parent_deletion_and_orphan_subscription(): void
    {
        $parent = $this->node();
        $child = $this->node(['parent_id' => $parent->id]);
        $url = $this->root . '/server/manage';
        $this->postJson($url . '/drop', ['id' => $parent->id])->assertJsonPath('status', 'fail');
        $this->assertNotNull($parent->fresh());
        Server::whereKey($child->id)->update(['parent_id' => 999999]);
        $this->assertSame([$parent->id], array_column(ServerService::getAvailableServers($this->admin), 'id'));
        $this->postJson($url . '/copy', ['id' => $parent->id])->assertOk();
        $copy = Server::latest('id')->firstOrFail();
        $this->assertFalse((bool) $copy->enabled);
        $this->assertNull($copy->machine_id);
    }

    public function test_site_url_and_mail_settings_do_not_leak_to_next_operation(): void
    {
        $mw = new ApplyRuntimeSettings;
        $request = Request::create('http://local.invalid/');
        admin_setting(['app_url' => 'https://tenant.example', 'force_https' => true]);
        $mw->handle($request, fn () => null);
        $this->assertStringStartsWith('https://tenant.example/', URL::to('login'));
        admin_setting(['app_url' => '', 'force_https' => false]);
        $mw->handle($request, fn () => null);
        $this->assertStringNotContainsString('tenant.example', URL::to('login'));
        $original = config('mail');
        $factory = new \ReflectionMethod(MailService::class, 'deliveryMailer');
        admin_setting(['email_host' => 'smtp1.example', 'email_port' => 2525]);
        $one = $factory->invoke(null)->getSymfonyTransport();
        admin_setting(['email_host' => 'smtp2.example']);
        $two = $factory->invoke(null)->getSymfonyTransport();
        $this->assertStringContainsString('smtp1.example', (string) $one);
        $this->assertStringContainsString('smtp2.example', (string) $two);
        admin_setting(['email_host' => '']);
        $this->assertSame(app('mail.manager'), $factory->invoke(null));
        $this->assertSame($original, config('mail'));
    }
}
