<?php

namespace Tests\Feature\Traffic;

use App\Models\Server;
use App\Models\ServerMachine;
use App\Jobs\StatServerJob;
use App\Jobs\StatUserJob;
use App\Jobs\TrafficFetchJob;
use App\Services\Plugin\HookManager;
use App\Services\TrafficBatchCapability;
use App\Utils\CacheKey;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class TrafficBatchIngressTest extends TestCase
{
    use RefreshDatabase;

    private const URL = '/api/v2/server/traffic-batch';
    private const UUID = 'e862bdd6-14c1-4dc4-a053-71b19d3fbe74';
    private Server $node;

    protected function setUp(): void
    {
        parent::setUp();
        Bus::fake();
        config(['app.key' => 'base64:' . base64_encode(str_repeat('a', 32))]);
        admin_setting(['server_token' => 'test-token', 'server_ws_enable' => 0]);
        $this->node = $this->createNode();
    }

    private function createNode(?int $machineId = null): Server
    {
        return Server::create(['name' => 'batch-test', 'type' => Server::TYPE_VMESS, 'host' => 'localhost',
            'port' => 443, 'server_port' => 443, 'rate' => 0.5, 'machine_id' => $machineId, 'enabled' => true]);
    }

    private function payload(array $rows): array
    {
        return ['token' => 'test-token', 'node_id' => $this->node->id, 'batch_id' => self::UUID, 'traffic' => $rows];
    }

    public function test_receipt_freezes_first_rate_day_and_filtered_traffic_before_ack(): void
    {
        $calls = 0;
        HookManager::registerFilter('traffic.process.before', 'array_values', 5);
        HookManager::registerFilter('traffic.process.before', function ($input) use (&$calls) {
            $calls++;
            $this->assertSame(['server_id' => $this->node->id, 'batch_id' => self::UUID], $input[0]['traffic_batch']);
            $input[2][1][1] = 8;
            return $input;
        });
        $rows = [[2, 65536, 11], [1, 5, 7]];
        $this->travelTo(Carbon::parse('2026-11-26 23:59:59'));
        $this->postJson(self::URL, $this->payload($rows))->assertOk()->assertExactJson(['batch_id' => self::UUID]);
        $this->node->update(['rate' => 5]);
        $this->travel(2)->seconds();
        $this->postJson(self::URL, $this->payload(array_reverse($rows)))->assertOk();
        $this->postJson(self::URL, $this->payload([[1, 5, 8], [2, 65536, 11]]))->assertConflict();
        $this->assertDatabaseCount('v2_traffic_batches', 1);
        $this->assertDatabaseCount('v2_traffic_batch_tasks', 5);
        $receipt = DB::table('v2_traffic_batches')->first();
        $this->assertEquals(0.5, $receipt->rate);
        $this->assertEquals(Carbon::parse('2026-11-26')->timestamp, $receipt->record_at);
        $this->assertEquals(1, $receipt->duplicate_count);
        $this->assertEquals(1, $receipt->conflict_count);
        $this->assertSame(1, $calls);
        $this->assertSame([1 => [5, 8], 2 => [65536, 11]], json_decode($receipt->payload, true));
        $this->assertSame(['2'], json_decode($receipt->activity_users, true));
    }

    public function test_handshake_and_discovery_follow_the_completed_migration(): void
    {
        $machine = ServerMachine::create(['name' => 'batch-machine', 'token' => 'machine-a', 'is_active' => true]);
        $auth = ['machine_id' => $machine->id, 'token' => 'machine-a'];
        $check = function (bool $enabled) use ($auth) {
            $this->postJson('/api/v2/server/handshake', ['token' => 'test-token'])
                ->assertOk()->assertJsonPath('capabilities.traffic_batch_v1', $enabled);
            $this->postJson('/api/v2/server/machine/nodes', $auth)
                ->assertOk()->assertJsonPath('capabilities.traffic_batch_v1', $enabled);
        };
        $check(true);
        config(['database.migrations' => ['table' => 'not_installed_yet']]);
        $check(false);
        config(['database.migrations' => 'migrations']);
        $marker = DB::table('migrations')->where('migration', '2026_11_26_000001_create_traffic_batches');
        $row = (array) $marker->sole();
        $marker->delete();
        $check(false);
        DB::table('migrations')->insert($row);
        $check(true);
    }

    public function test_readiness_uses_primary_with_a_custom_migration_table_and_prefix(): void
    {
        $default = DB::getDefaultConnection();
        $name = 'batch_readiness_split';
        config(["database.connections.$name" => ['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => 'tenant_'],
            'database.migrations' => ['table' => 'custom_migrations']]);
        $primary = new \PDO('sqlite::memory:');
        $replica = new \PDO('sqlite::memory:');
        $primary->exec('CREATE TABLE tenant_custom_migrations (migration TEXT)');
        $primary->exec("INSERT INTO tenant_custom_migrations VALUES ('2026_11_26_000001_create_traffic_batches')");
        DB::connection($name)->setPdo($primary)->setReadPdo($replica);
        DB::setDefaultConnection($name);
        try {
            $this->assertTrue(TrafficBatchCapability::available());
            $primary->exec('DELETE FROM tenant_custom_migrations');
            $replica->exec('CREATE TABLE tenant_custom_migrations (migration TEXT)');
            $replica->exec("INSERT INTO tenant_custom_migrations VALUES ('2026_11_26_000001_create_traffic_batches')");
            $this->assertFalse(TrafficBatchCapability::available());
        } finally {
            DB::setDefaultConnection($default);
            DB::purge($name);
        }
    }

    public function test_readiness_failure_returns_a_retryable_error_for_both_negotiation_paths(): void
    {
        $machine = ServerMachine::create(['name' => 'batch-machine', 'token' => 'machine-a', 'is_active' => true]);
        DB::connection()->beforeExecuting(function (string $sql) {
            if (str_contains($sql, 'migrations')) {
                $denied = new \PDOException('SELECT command denied on the migration table');
                $denied->errorInfo = ['42000', 1142, $denied->getMessage()];
                throw $denied;
            }
        });
        $this->postJson('/api/v2/server/handshake', ['token' => 'test-token'])->assertStatus(503)
            ->assertJsonMissingPath('capabilities.traffic_batch_v1');
        $this->postJson('/api/v2/server/machine/nodes', ['machine_id' => $machine->id, 'token' => 'machine-a'])
            ->assertStatus(503)->assertJsonMissingPath('capabilities.traffic_batch_v1');
    }

    public function test_readiness_reports_a_malformed_migration_table_as_unavailable(): void
    {
        // An existing table without the required column is a database error.
        config(['database.migrations' => $this->node->getTable()]);
        $this->postJson('/api/v2/server/handshake', ['token' => 'test-token'])
            ->assertStatus(503)->assertJsonMissingPath('capabilities.traffic_batch_v1');
        config(['database.migrations' => 'migrations']);
        $this->assertTrue(TrafficBatchCapability::available());
    }

    public function test_machine_token_rotation_and_node_scoping(): void
    {
        $machine = ServerMachine::create(['name' => 'batch-machine', 'token' => 'machine-a', 'is_active' => true]);
        $auth = ['machine_id' => $machine->id, 'token' => 'machine-a'];
        $direct = $this->payload([[1, 11, 17]]);
        $this->postJson(self::URL, $auth + $direct)->assertStatus(400);
        $this->assertDatabaseCount('v2_traffic_batches', 0);
        $this->postJson(self::URL, $direct)->assertOk();
        $child = $this->createNode($machine->id);
        $childRequest = ['node_id' => $child->id] + $auth + $direct;
        $this->postJson(self::URL, $childRequest)->assertOk();
        $machine->update(['token' => 'machine-b']);
        DB::table('migrations')->where('migration', '2026_11_26_000001_create_traffic_batches')->delete();
        $this->postJson(self::URL, $childRequest)->assertUnauthorized();
        $this->postJson(self::URL, ['token' => 'machine-b'] + $childRequest)->assertOk();
        $this->assertDatabaseCount('v2_traffic_batches', 2);
        $this->assertDatabaseHas('v2_traffic_batches', ['server_id' => $child->id, 'duplicate_count' => 1]);
    }

    public function test_invalid_input_is_rejected_before_recording_and_filter_failure_rolls_back(): void
    {
        $badRows = [[], [[1, 0, 0]], [[2147483648, 1, 1]], [['1', 1, 1]], [[true, 1, 1]], [[1, -1, 0]], [[1, 1.5, 0]],
            [[1, 1, 0], [1, 1, 0]], [[1, PHP_INT_MAX, 0], [2, 1, 1]], array_fill(0, 1001, [1, 1, 1])];
        foreach ($badRows as $rows) {
            $this->postJson(self::URL, $this->payload($rows))->assertUnprocessable();
        }
        $good = $this->payload([[1, 11, 17]]);
        $this->postJson(self::URL, ['batch_id' => 'invalid'] + $good)->assertUnprocessable();
        $this->postJson(self::URL, ['padding' => str_repeat('x', 131072)] + $good)->assertStatus(413);
        HookManager::registerFilter('traffic.before_process', function ($input) {
            $input[0]['rate'] = -1;
            return $input;
        });
        $this->postJson(self::URL, $good)->assertUnprocessable();
        $this->assertDatabaseCount('v2_traffic_batches', 0);
        $this->assertDatabaseCount('v2_traffic_batch_tasks', 0);
    }

    public function test_zero_rate_window_keeps_raw_node_bytes_and_largest_supported_batch(): void
    {
        $this->node->update(['rate' => 0.75, 'rate_time_enable' => true, 'rate_time_ranges' => [
            ['start' => '00:00', 'end' => '01:00', 'rate' => 0],
        ]]);
        $this->travelTo(Carbon::parse('2026-11-26 00:30:00'));
        $rows = array_map(static fn ($id) => [$id, 11, 17], range(1, 1000));
        $this->postJson(self::URL, $this->payload($rows))->assertOk();
        $this->travel(1)->hour();
        $this->postJson(self::URL, $this->payload($rows))->assertOk();
        $this->assertDatabaseHas('v2_traffic_batches', ['rate' => 0, 'raw_u' => 11000, 'raw_d' => 17000,
            'duplicate_count' => 1]);
        $newId = 'c84064ba-22c8-445c-8a33-ce8169cc37b7';
        $this->postJson(self::URL, ['batch_id' => $newId] + $this->payload([[1, 11, 17]]))->assertOk();
        $this->assertDatabaseHas('v2_traffic_batches', ['batch_id' => $newId, 'rate' => 0.75, 'raw_u' => 11, 'raw_d' => 17]);
    }

    public function test_migrated_panel_accepts_legacy_traffic_and_live_telemetry(): void
    {
        $auth = ['token' => 'test-token', 'node_id' => $this->node->id];
        $this->postJson('/api/v2/server/report', $auth + ['traffic' => [1 => [11, 17]], 'status' => ['cpu' => 12]])
            ->assertOk()->assertJsonPath('data', true);
        $this->postJson('/api/v2/server/report', $auth + ['status' => ['cpu' => 34]])->assertOk();
        $key = CacheKey::get('SERVER_' . strtoupper($this->node->type) . '_LOAD_STATUS', $this->node->id);
        $this->assertEquals(34, cache($key)['cpu']);
        Bus::assertDispatchedTimes(TrafficFetchJob::class, 1);
        Bus::assertDispatchedTimes(StatUserJob::class, 1);
        Bus::assertDispatchedTimes(StatServerJob::class, 1);
        $this->assertDatabaseCount('v2_traffic_batches', 0);
    }

    public function test_migration_rollback_preserves_accepted_and_completed_receipts(): void
    {
        $this->postJson(self::URL, $this->payload([[1, 11, 17]]))->assertOk();
        DB::table('v2_traffic_batch_tasks')->delete();
        DB::table('v2_traffic_batches')->update(['completed_at' => time(), 'payload' => null, 'activity_users' => null]);
        $migration = require database_path('migrations/2026_11_26_000001_create_traffic_batches.php');
        try {
            $migration->down();
            $this->fail('Rollback discarded a completed receipt');
        } catch (\RuntimeException $exception) {
            $this->assertStringContainsString('retain the ledger', $exception->getMessage());
        }
        $this->postJson(self::URL, $this->payload([[1, 11, 17]]))->assertOk();
        $this->assertDatabaseHas('v2_traffic_batches', ['batch_id' => self::UUID, 'duplicate_count' => 1]);
        $this->assertDatabaseCount('v2_traffic_batch_tasks', 0);
    }
}
