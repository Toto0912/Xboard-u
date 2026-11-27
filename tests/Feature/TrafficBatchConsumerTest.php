<?php

namespace Tests\Feature;

use App\Jobs\ProcessTrafficBatchTask;
use App\Jobs\StatServerJob;
use App\Jobs\StatUserJob;
use App\Jobs\TrafficFetchJob;
use App\Models\Server;
use App\Services\TrafficBatchOutbox;
use App\Support\Setting;
use Illuminate\Contracts\Cache\Repository;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Str;
use RuntimeException;
use Tests\TestCase;

class TrafficBatchConsumerTest extends TestCase
{
    use RefreshDatabase;

    private const TRAFFIC = [41 => [120, 340], 42 => [11, 17]];
    private const DAY = 1704067200;
    private const STAGES = ['usage', 'user_stat', 'server_stat', 'quota_check', 'activity'];

    public function test_prune_previews_and_rechecks_only_completed_legacy_receipts(): void
    {
        $table = DB::table('v2_traffic_batches');
        $age = now()->subDays(100)->timestamp;
        $ids = [];
        foreach ([['legacy', $age], ['client', $age], [null, $age], ['legacy', null],
            ['legacy', now()->timestamp], ['legacy', $age]] as [$source, $completion]) {
            $ids[] = $table->insertGetId(['server_id' => 1, 'batch_id' => (string) Str::uuid(),
                'digest' => str_repeat('a', 64), 'source' => $source, 'received_at' => $age,
                'record_at' => $age, 'activity_type' => 'vless', 'protocol' => 'vless', 'stat_server_id' => 1,
                'rate' => 1, 'completed_at' => $completion]);
        }
        DB::table('v2_traffic_batch_tasks')->insert(['receipt_id' => $ids[5], 'kind' => 'usage', 'available_at' => $age]);
        $this->artisan('traffic:prune-legacy')->assertSuccessful();
        $this->assertSame(6, $table->count());
        for ($i = 0; $i < 2; $i++) {
            $this->artisan('traffic:prune-legacy --execute')->assertSuccessful();
            $this->assertEquals(array_slice($ids, 1), $table->orderBy('id')->pluck('id')->all());
        }
    }

    private function receipt(float $rate = 1): array
    {
        Bus::fake();
        $node = Server::create(['name' => 'receipt', 'type' => 'vless', 'host' => 'example.test',
            'port' => 443, 'server_port' => 443, 'rate' => $rate]);
        foreach (array_keys(self::TRAFFIC) as $uid) {
            DB::table('v2_user')->insert(['id' => $uid, 'email' => "receipt-{$uid}@example.test",
                'password' => 'test', 'uuid' => (string) Str::uuid(), 'token' => bin2hex(random_bytes(16)),
                'created_at' => time(), 'updated_at' => time()]);
        }
        $id = DB::table('v2_traffic_batches')->insertGetId([
            'server_id' => $node->id, 'batch_id' => (string) Str::uuid(), 'digest' => str_repeat('a', 64),
            'received_at' => time(), 'record_at' => self::DAY, 'activity_type' => 'vless',
            'stat_server_id' => $node->id, 'rate' => $rate, 'protocol' => 'vless',
            'raw_u' => 131, 'raw_d' => 357, 'payload' => json_encode(self::TRAFFIC), 'activity_users' => '[]'
        ]);
        $jobs = [];
        foreach (self::STAGES as $kind) {
            $task = DB::table('v2_traffic_batch_tasks')->insertGetId(['receipt_id' => $id, 'kind' => $kind,
                'available_at' => $kind === 'quota_check' ? null : time()]);
            $jobs[$kind] = new ProcessTrafficBatchTask($id, $task);
        }
        return [$id, $node->id, $jobs];
    }

    public function test_cold_request_reads_authoritative_node_settings_when_cache_is_offline(): void
    {
        admin_setting(['server_token' => 'test-current-token', 'batch_test_nested' => ['rate' => 2]]);
        $offline = \Mockery::mock(Repository::class);
        $offline->shouldReceive('rememberForever')->once()->andThrow(new RuntimeException('Redis offline'));
        Cache::shouldReceive('store')->once()->with('redis')->andReturn($offline);
        $settings = new Setting();
        $this->assertSame('test-current-token', $settings->get('server_token'));
        $this->assertSame(['rate' => 2], $settings->get('batch_test_nested'));
    }

    public function test_replayed_tasks_and_overlapping_legacy_reports_keep_all_four_ledgers_additive(): void
    {
        [$id, $node, $jobs] = $this->receipt(1.25);
        // Establish the existing driver's fractional rounding for each ledger.
        $server = ['id' => $node, 'rate' => 1.25];
        (new TrafficFetchJob($server, self::TRAFFIC, 'vless', self::DAY))->handle();
        (new StatUserJob($server, self::TRAFFIC, 'vless', 'd', self::DAY))->handle();
        (new StatServerJob($server, self::TRAFFIC, 'vless', 'd', self::DAY))->handle();
        $read = function () use ($node) {
            $rows = DB::table('v2_user')->whereIn('id', [41, 42])->orderBy('id')->get(['u', 'd'])
                ->concat(DB::table('v2_stat_user')->where('record_at', self::DAY)->orderBy('user_id')->get(['u', 'd']))
                ->concat(DB::table('v2_stat_server')->where('record_at', self::DAY)->where('server_id', $node)->get(['u', 'd']))
                ->concat(DB::table('v2_server')->where('id', $node)->get(['u', 'd']));
            return $rows->flatMap(fn ($row) => [(float) $row->u, (float) $row->d])->all();
        };
        $baseline = $read();
        $this->assertCount(12, $baseline);
        $this->assertSame([131.0, 357.0, 131.0, 357.0], array_slice($baseline, -4));
        foreach (['quota_check', 'user_stat', 'user_stat', 'server_stat', 'usage', 'usage', 'quota_check', 'activity'] as $stage) {
            $jobs[$stage]->handle();
        }
        foreach ($jobs as $job) {
            $job->handle();
        }
        $this->assertEquals(array_map(fn ($n) => 2 * $n, $baseline), $read());
        $receipt = DB::table('v2_traffic_batches')->find($id);
        $this->assertNotNull($receipt->completed_at);
        $this->assertNull($receipt->payload);
        $this->assertNull($receipt->activity_users);
        $this->assertSame(0, DB::table('v2_traffic_batch_tasks')->count());
    }

    public function test_failure_between_debit_and_marker_rolls_back_and_redis_failure_retries_only_quota(): void
    {
        [$id, , $jobs] = $this->receipt();
        $failOnce = true;
        DB::listen(function (QueryExecuted $event) use (&$failOnce) {
            if ($failOnce && str_starts_with(strtolower($event->sql), 'delete from') && str_contains($event->sql, 'v2_traffic_batch_tasks')) {
                $failOnce = false;
                throw new RuntimeException('injected interruption');
            }
        });
        try {
            $jobs['usage']->handle();
            $this->fail('The database interruption was not injected');
        } catch (RuntimeException $failure) {
            $this->assertSame('injected interruption', $failure->getMessage());
        }
        $usage = fn () => (int) DB::table('v2_user')->where('id', 41)->value('u');
        $quota = fn () => DB::table('v2_traffic_batch_tasks')->where('receipt_id', $id)->where('kind', 'quota_check')->first();
        $this->assertSame(0, $usage());
        $this->assertNull($quota()->available_at);
        $jobs['usage']->handle();
        $this->assertSame(120, $usage());
        Redis::shouldReceive('sadd')->once()->with('traffic:pending_check', 41, 42)->andThrow(new RuntimeException('redis unavailable'));
        Redis::shouldReceive('sadd')->once()->with('traffic:pending_check', 41, 42)->andReturn(2);
        try {
            $jobs['quota_check']->handle();
            $this->fail('The Redis interruption was not injected');
        } catch (RuntimeException $failure) {
            $this->assertSame('redis unavailable', $failure->getMessage());
        }
        $this->assertNotNull($quota());
        $jobs['usage']->handle();
        $jobs['quota_check']->handle();
        $this->assertNull($quota());
        $this->assertSame(120, $usage());
    }

    public function test_failed_dispatch_releases_its_lease_immediately(): void
    {
        [$id] = $this->receipt();
        Bus::shouldReceive('dispatch')->once()->andThrow(new RuntimeException('isolated queue unavailable'));
        try {
            TrafficBatchOutbox::dispatchDue($id, 'usage');
            $this->fail('Expected queue failure');
        } catch (RuntimeException $error) {
            $this->assertSame('isolated queue unavailable', $error->getMessage());
        }
        Bus::shouldReceive('dispatch')->once();
        $this->assertSame(1, TrafficBatchOutbox::dispatchDue($id, 'usage'));
        $this->assertSame(0, TrafficBatchOutbox::dispatchDue($id, 'usage'));
    }

    public function test_scheduler_recovers_lost_jobs_without_readvertising_an_active_lease(): void
    {
        [$id] = $this->receipt();
        $this->assertSame(4, TrafficBatchOutbox::dispatchDue());
        $this->assertSame(0, TrafficBatchOutbox::dispatchDue());
        DB::table('v2_traffic_batch_tasks')->where('receipt_id', $id)->where('kind', 'usage')->update(['available_at' => time() - 1]);
        $this->artisan('traffic:batches')->expectsOutput('Dispatched: 1')->assertSuccessful();
        Bus::assertDispatchedTimes(ProcessTrafficBatchTask::class, 5);
        $this->artisan('traffic:batches --status')->expectsOutput('Receipts: 1, duplicate requests: 0, conflicts: 0')->assertSuccessful();
    }
}
