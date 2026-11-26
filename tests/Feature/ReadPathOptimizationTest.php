<?php

namespace Tests\Feature;

use App\Exceptions\ApiException;
use App\Http\Controllers\V1\Server\UniProxyController;
use App\Models\Coupon;
use App\Models\Plan;
use App\Models\Server;
use App\Services\CouponService;
use App\Services\Plugin\HookManager;
use App\Services\TelegramService;
use App\Support\AbstractProtocol;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class ReadPathOptimizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_plan_reset_reuses_the_updated_plan_for_all_affected_users(): void
    {
        $plan = Plan::create(['name' => 'reset', 'group_id' => 1, 'transfer_enable' => 10,
            'reset_traffic_method' => Plan::RESET_TRAFFIC_NEVER]);
        foreach (range(1, 4) as $id) {
            DB::table('v2_user')->insert(['email' => "reset$id@example.test", 'password' => 'fixture',
                'uuid' => (string) \Illuminate\Support\Str::uuid(), 'token' => bin2hex(random_bytes(16)),
                'plan_id' => $plan->id, 'banned' => $id === 4, 'expired_at' => time() + 86400 * 200,
                'created_at' => time(), 'updated_at' => time()]);
        }
        DB::enableQueryLog();
        try {
            $plan->update(['reset_traffic_method' => Plan::RESET_TRAFFIC_FIRST_DAY_MONTH]);
            $selects = array_filter(DB::getQueryLog(), static function ($entry) {
                return str_starts_with(strtolower($entry['query']), 'select') && str_contains($entry['query'], 'v2_plan');
            });
            $this->assertCount(0, $selects);
        } finally {
            DB::disableQueryLog();
            DB::flushQueryLog();
        }
        $this->assertSame(3, DB::table('v2_user')->where('plan_id', $plan->id)->whereNotNull('next_reset_at')->count());
        $this->assertTrue(Schema::hasIndex('v2_order', ['user_id', 'created_at']));
    }

    public function test_coupon_preview_and_purchase_resolve_the_same_duplicate_with_different_locks(): void
    {
        $coupon = Coupon::create(['name' => 'first', 'code' => 'mixed_Case', 'type' => 1, 'value' => 5,
            'started_at' => time() - 1, 'ended_at' => time() + 3600]);
        $coupon->replicate()->save();
        $this->assertTrue(Schema::hasIndex('v2_coupon', 'coupon_code_lookup'));
        DB::enableQueryLog();
        try {
            $this->assertSame($coupon->id, (new CouponService('mixed_Case', false))->getId());
            $this->assertSame($coupon->id, (new CouponService('mixed_Case'))->getId());
            [$read, $write] = array_slice(DB::getQueryLog(), -2);
            $this->assertStringNotContainsString('for update', strtolower($read['query']));
            if (DB::getDriverName() !== 'sqlite') {
                $this->assertStringContainsString('for update', strtolower($write['query']));
            }
        } finally {
            DB::disableQueryLog();
            DB::flushQueryLog();
        }
    }

    public function test_uniproxy_response_encodes_once_keeps_content_type_and_revalidates_exact_bytes(): void
    {
        $node = Server::create(['name' => 'node', 'type' => 'vmess', 'host' => '127.0.0.1', 'port' => 8888,
            'server_port' => 8888, 'rate' => 1, 'group_ids' => [1], 'enabled' => true]);
        $entry = new class implements \JsonSerializable {
            public int $calls = 0;
            public function jsonSerialize(): array
            {
                $this->calls++;
                return ['uuid' => '測試/測試'];
            }
        };
        $users = [$entry];
        HookManager::registerFilter('server.users.get', function () use (&$users) { return $users; });
        $request = Request::create('/users');
        $request->attributes->set('node_info', $node);
        $controller = app(UniProxyController::class);
        try {
            $first = $controller->user($request);
            $this->assertSame(1, $entry->calls);
            $expected = json_encode(['users' => [['uuid' => '測試/測試']]]);
            $this->assertSame($expected, $first->getContent());
            $this->assertSame('application/json', $first->headers->get('Content-Type'));
            $etag = '"' . sha1($expected) . '"';
            $this->assertSame($etag, $first->headers->get('ETag'));
            $request->headers->set('If-None-Match', $etag);
            $this->assertSame(304, $controller->user($request)->getStatusCode());
            $users = [];
            $this->assertNotSame($etag, $controller->user($request)->headers->get('ETag'));
        } finally {
            HookManager::remove('server.users.get');
        }
    }

    public function test_telegram_username_cache_is_per_bot_and_only_caches_valid_responses(): void
    {
        Http::fake([
            '*/botA/getMe' => Http::sequence()
                ->push(['ok' => true, 'result' => []])
                ->push(['ok' => true, 'result' => ['username' => 'a_bot']])
                ->push(['ok' => true, 'result' => ['username' => 'renamed_bot']]),
            '*/botB/getMe' => Http::response(['ok' => true, 'result' => ['username' => 'b_bot']]),
        ]);
        $bot = new TelegramService('A');
        try {
            $bot->getBotUsername();
            $this->fail('Expected incomplete response to be rejected.');
        } catch (ApiException $e) {
            $this->assertStringContainsString('Telegram', $e->getMessage());
        }
        $this->assertSame('a_bot', $bot->getBotUsername());
        $this->assertSame('a_bot', (new TelegramService('A'))->getBotUsername());
        $this->assertSame('b_bot', (new TelegramService('B'))->getBotUsername());
        Http::assertSentCount(3);
        $this->travel(301)->seconds();
        $this->assertSame('renamed_bot', $bot->getBotUsername());
        Http::assertSentCount(4);
    }

    public function test_protocol_hook_changes_are_projected_every_time_and_do_not_cross_users(): void
    {
        $make = fn ($nodes) => new class([], $nodes) extends AbstractProtocol {
            public function handle() { return $this->servers; }
        };
        $one = [['type' => 'vless', 'name' => 'one', 'protocol_settings' => ['network' => 'tcp']]];
        $calls = 0;
        HookManager::registerFilter('protocol.servers.filtered', function (array $nodes) use (&$calls) {
            $calls++;
            $nodes[0]['protocol_settings'] = ['network' => 'raw', 'reality_settings' => ['private_key' => 'hidden']];
            return $nodes;
        });
        try {
            $other = $one;
            $other[0]['name'] = 'two';
            foreach ([$one, $other] as $input) {
                $result = $make($input)->handle()[0];
                $this->assertSame($input[0]['name'], $result['name']);
                $this->assertSame('tcp', $result['protocol_settings']['network']);
                $this->assertArrayNotHasKey('private_key', $result['protocol_settings']['reality_settings']);
            }
            $this->assertSame(2, $calls);
        } finally {
            HookManager::remove('protocol.servers.filtered');
        }
        $this->assertSame('one', $make($one)->handle()[0]['name']);
    }
}
