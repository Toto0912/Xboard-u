<?php

namespace Tests\Unit\Services;

use App\Jobs\TrafficFetchJob;
use App\Jobs\StatUserJob;
use App\Jobs\StatServerJob;
use App\Models\Server;
use App\Models\StatUser;
use App\Models\StatServer;
use App\Models\ServerGroup;
use App\Http\Controllers\V2\Admin\Server\ManageController;
use Illuminate\Http\Request;
use App\Services\StatisticalService;
use App\Services\ServerService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PerformanceRegressionTest extends TestCase
{
    use RefreshDatabase;

    public function test_batched_traffic_and_stats_preserve_rates_and_accumulate_without_per_user_sql(): void
    {
        Bus::fake();
        $traffic = $users = [];
        for ($id = 1; $id <= 237; $id++) {
            $users[] = ['id' => $id, 'email' => "traffic-{$id}@example.test", 'password' => 'test',
                'uuid' => sprintf('00000000-0000-4000-8000-%012d', $id), 'token' => sprintf('%032d', $id),
                'u' => 100, 'd' => 200, 'created_at' => time(), 'updated_at' => time()];
            $traffic[$id] = [$id * 4, $id * 8];
        }
        foreach (array_chunk($users, 100) as $chunk) DB::table('v2_user')->insert($chunk);
        DB::enableQueryLog();
        (new TrafficFetchJob(['id' => 1, 'rate' => 1.25], $traffic, 'vless', time()))->handle();
        $writes = array_filter(DB::getQueryLog(), fn ($q) => str_starts_with(strtolower($q['query']), 'update'));
        $this->assertCount(3, $writes);
        $this->assertEquals(100 + 237 * 5, DB::table('v2_user')->where('id', 237)->value('u'));
        DB::flushQueryLog();
        $job = new StatUserJob(['id' => 1, 'rate' => 1.25], $traffic, 'vless');
        $job->handle();
        $job->handle();
        $this->assertSame(237, StatUser::count());
        $row = StatUser::where('user_id', 237)->firstOrFail();
        $this->assertEquals(237 * 10, $row->u);
        $this->assertEquals(237 * 20, $row->d);
        $this->assertLessThan(25, count(DB::getQueryLog()));
        DB::disableQueryLog();
    }

    public function test_statistic_constructor_preserves_memory_limit_and_rank_respects_the_date_range(): void
    {
        Bus::fake();
        $limit = ini_get('memory_limit');
        new StatisticalService;
        $this->assertSame($limit, ini_get('memory_limit'));
        $node = Server::create(['name' => 'rank', 'type' => 'vless', 'host' => 'example.test', 'port' => 443, 'server_port' => 443, 'rate' => 1]);
        foreach ([[100, 1000, 500, 'd'], [1000, 10, 5, 'd'], [1001, 5000, 5000, 'm']] as [$at, $u, $d, $type]) {
            StatServer::create(['server_id' => $node->id, 'server_type' => 'vless', 'record_at' => $at,
                'record_type' => $type, 'u' => $u, 'd' => $d]);
        }
        $result = StatisticalService::getServerRank(1000, 2000);
        $this->assertSame(15, $result[0]['total']);
    }

    public function test_server_list_uses_one_bulk_cache_read_and_keeps_the_snapshot_request_local(): void
    {
        Bus::fake();
        for ($i = 0; $i < 10; $i++) Server::create(['name' => "node-{$i}", 'type' => 'vless',
            'host' => 'example.test', 'port' => 443, 'server_port' => 443, 'rate' => 1]);
        Cache::shouldReceive('many')->once()->andReturnUsing(fn ($keys) => array_fill_keys($keys, null));
        Cache::shouldReceive('get')->never();
        $nodes = ServerService::getAllServers();
        $this->assertCount(10, $nodes->toArray());
        // Repeated derived accessors read the same explicitly loaded snapshot.
        foreach ($nodes as $node) { $node->is_online; $node->cache_key; $node->metrics; }
    }

    public function test_server_job_payload_is_small_and_old_serialized_data_still_runs(): void
    {
        Bus::fake();
        $node = Server::create(['name' => 'stat', 'type' => 'vless', 'host' => 'example.test', 'port' => 443, 'server_port' => 443, 'rate' => 1]);
        $job = new StatServerJob(['id' => $node->id], array_fill(0, 1000, [10, 20]), 'vless');
        $this->assertLessThan(2000, strlen(serialize($job)));
        $job->handle();
        $this->assertEquals(10000, $node->fresh()->u);
        $old = new StatServerJob(['id' => $node->id], [], 'vless');
        foreach (['totals' => null, 'data' => [[10,20]]] as $field => $value) {
            (new \ReflectionProperty($old, $field))->setValue($old, $value);
        }
        unserialize(serialize($old))->handle();
        $this->assertEquals(10010, $node->fresh()->u);
        $this->assertEquals(20020, $node->fresh()->d);
    }

    public function test_node_list_bulk_loads_groups_and_parents_without_n_plus_one_queries(): void
    {
        Bus::fake();
        $group = ServerGroup::forceCreate(['name' => 'list-group']);
        $base = ['type' => 'vless', 'host' => 'example.test', 'port' => 443, 'server_port' => 443,
            'rate' => 1, 'group_ids' => [(string) $group->id]];
        $parent = Server::create($base + ['name' => 'parent']);
        for ($i = 0; $i < 12; $i++) Server::create($base + ['name' => "child-{$i}", 'parent_id' => $parent->id]);
        DB::enableQueryLog();
        $response = (new ManageController)->getNodes(new Request);
        $queries = DB::getQueryLog();
        DB::disableQueryLog();
        $this->assertCount(3, $queries);
        $nodes = $response->getData(true)['data'];
        $this->assertCount(13, $nodes);
        $this->assertSame('list-group', $nodes[0]['groups'][0]['name']);
        $this->assertSame($parent->id, $nodes[1]['parent']['id']);
    }
}
