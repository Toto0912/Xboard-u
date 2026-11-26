<?php

namespace Tests\Feature;

use App\Jobs\ProcessTrafficBatchTask;
use App\Jobs\StatServerJob;
use App\Jobs\StatUserJob;
use App\Jobs\TrafficFetchJob;
use App\Models\Server;
use App\Services\TrafficBatchReceiver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class PostgresTrafficAccountingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        if (DB::getDriverName() !== 'pgsql') {
            $this->markTestSkipped('PostgreSQL BIGINT and native prepared statement regression');
        }
    }

    public function test_postgres_counts_wide_and_fractional_deltas_for_both_protocols(): void
    {
        Bus::fake();
        foreach ([
            // Raw up/down, rate, expected quota up/down, expected user-stat up/down.
            [[2147483647, 2147483648], 1, [2147483647, 2147483648], [2147483647, 2147483648]],
            [[1, 1073741825], 2, [2, 2147483650], [2, 2147483650]],
            [[3, 1], 0.5, [2, 1], [1, 0]],
            [[5, 7], 0.25, [1, 2], [1, 1]],
            [[2147483649, 1], 0, [0, 0], [0, 0]],
            [[9007199254740993, 9007199254740995], 0.75,
                [6755399441055745, 6755399441055746], [6755399441055744, 6755399441055746]],
            [[9007199254740993, 41], 1, [9007199254740993, 41], [9007199254740993, 41]],
            [[PHP_INT_MAX, 0], 0.5, [4611686018427387904, 0], [4611686018427387903, 0]],
        ] as [$raw, $rate, $quota, $daily]) {
            foreach (['batch', 'legacy'] as $protocol) {
                $node = Server::create(['name' => 'pg', 'type' => 'vless', 'host' => 'example.test',
                    'port' => 443, 'server_port' => 443, 'rate' => $rate]);
                $uid = DB::table('v2_user')->insertGetId(['email' => Str::uuid().'@example.test',
                    'password' => 'test', 'uuid' => (string) Str::uuid(), 'token' => Str::random(32),
                    'created_at' => time(), 'updated_at' => time()]);
                if ($protocol === 'batch') {
                    $id = (string) Str::uuid();
                    $rows = [[$uid, ...$raw]];
                    $receiver = app(TrafficBatchReceiver::class);
                    $this->assertSame($id, $receiver->accept($node, $id, $rows));
                    $receipt = DB::table('v2_traffic_batches')->where('batch_id', $id);
                    $tasks = DB::table('v2_traffic_batch_tasks')->where('receipt_id', $receipt->value('id'));
                    $jobs = $tasks->orderBy('id')->get();
                    $this->assertCount(5, $jobs);
                    foreach ($jobs as $task) {
                        $job = new ProcessTrafficBatchTask($task->receipt_id, $task->id);
                        $job->handle();
                        $job->handle();
                    }
                    $this->assertSame($id, $receiver->accept($node, $id, $rows));
                    $this->assertSame(0, $tasks->count());
                    $this->assertNotNull($receipt->value('completed_at'));
                    $this->assertSame(1, (int) $receipt->value('duplicate_count'));
                } else {
                    $server = ['id' => $node->id, 'rate' => $rate];
                    $traffic = [$uid => $raw];
                    $day = today()->timestamp;
                    (new TrafficFetchJob($server, $traffic, 'vless', $day))->handle();
                    (new StatUserJob($server, $traffic, 'vless', 'd', $day))->handle();
                    (new StatServerJob($server, $traffic, 'vless', 'd', $day))->handle();
                }
                foreach ([
                    ['v2_user', 'id', $uid, $quota], ['v2_stat_user', 'user_id', $uid, $daily],
                    ['v2_server', 'id', $node->id, $raw], ['v2_stat_server', 'server_id', $node->id, $raw],
                ] as [$table, $key, $value, $expected]) {
                    $row = DB::table($table)->where($key, $value)->sole(['u', 'd']);
                    $this->assertSame($expected, [(int) $row->u, (int) $row->d], "$protocol $table at rate $rate");
                }
            }
        }
    }

    public function test_usage_updates_only_the_target_rows_in_groups_of_one_hundred(): void
    {
        $users = $traffic = $expected = [];
        for ($id = 1; $id <= 202; ++$id) {
            $users[] = ['id' => $id, 'email' => "$id@example.test", 'password' => 'test',
                'uuid' => (string) Str::uuid(), 'token' => Str::random(32), 'u' => 10, 'd' => 20,
                'created_at' => time(), 'updated_at' => time()];
            $expected[$id] = [10, 20];
            if ($id <= 201) {
                $up = 2147483648 + $id;
                $down = 4294967297 - $id;
                $traffic[$id] = [$up, $down];
                $expected[$id] = [10 + intdiv($up + 1, 2), 20 + intdiv($down + 1, 2)];
            }
        }
        DB::table('v2_user')->insert($users);

        DB::enableQueryLog();
        try {
            (new TrafficFetchJob(['id' => 1, 'rate' => 0.5], array_reverse($traffic, true), 'vless', time()))->handle();
            $updates = array_filter(DB::getQueryLog(), fn ($query) => str_starts_with($query['query'], 'UPDATE "v2_user" SET'));
            $this->assertCount(3, $updates);
        } finally {
            DB::disableQueryLog();
        }
        foreach (DB::table('v2_user')->orderBy('id')->get(['id', 'u', 'd']) as $user) {
            $this->assertSame($expected[$user->id], [(int) $user->u, (int) $user->d]);
        }
    }
}
