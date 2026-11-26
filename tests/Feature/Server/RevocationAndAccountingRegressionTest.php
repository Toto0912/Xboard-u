<?php

namespace Tests\Feature\Server;

use App\Jobs\TrafficFetchJob;
use App\Models\Server;
use App\Models\ServerMachine;
use App\Services\NodeRegistry;
use App\Services\ServerService;
use App\Support\Setting;
use App\WebSocket\NodeWorker;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Redis;
use Mockery;
use Tests\TestCase;
use Workerman\Connection\TcpConnection;

class RevocationAndAccountingRegressionTest extends TestCase
{
    use RefreshDatabase;

    private function node(array $fields = []): Server
    {
        return Server::withoutEvents(fn () => Server::forceCreate($fields + [
            'name' => 'node', 'type' => 'vmess', 'host' => '127.0.0.1', 'port' => 443,
            'server_port' => 443, 'rate' => 1, 'enabled' => true,
        ]));
    }

    public function test_only_authenticated_missing_node_reports_permanent_revocation(): void
    {
        admin_setting(['server_token' => '001230']);
        $node = $this->node(['code' => 'east-a']);
        $route = '/api/v1/server/UniProxy/user?node_id=east-a';
        $this->getJson($route . '&token=001230')->assertOk();
        $this->getJson($route . '&token=001230&node_type=trojan')->assertStatus(400)->assertHeaderMissing('X-Xboard-Node-State');
        $node->delete();
        $this->getJson($route . '&token=001230')->assertStatus(410)->assertHeader('X-Xboard-Node-State', 'revoked');
        $this->getJson($route . '&token=1230')->assertStatus(422)->assertHeaderMissing('X-Xboard-Node-State');
    }

    public function test_code_wins_numeric_collision_and_live_worker_reads_exact_rotated_token(): void
    {
        $first = $this->node();
        $second = $this->node(['code' => (string) $first->id]);
        $this->assertSame($second->id, ServerService::getServer($first->id)->id);
        $this->assertNull(ServerService::getServer('1non-numeric'));
        admin_setting(['server_token' => 'true']);
        $this->assertTrue(Setting::matchesNodeToken('true', true));
        $this->assertFalse(Setting::matchesNodeToken(true, true));
        admin_setting(['server_token' => '00123']);
        $this->assertFalse(Setting::matchesNodeToken('true', true));
        $this->assertTrue(Setting::matchesNodeToken('00123', true));
        $this->assertSame(['absent_array' => [1]], (new Setting)->getBatch(['absent_array' => [1]]));
    }

    public function test_machine_refresh_uses_current_membership_preserves_peer_and_orders_sync(): void
    {
        $left = ServerMachine::create(['name' => 'left', 'token' => 'l', 'is_active' => true]);
        $right = ServerMachine::create(['name' => 'right', 'token' => 'r', 'is_active' => true]);
        $node = $this->node(['machine_id' => $left->id]);
        $peer = $this->node(['machine_id' => $left->id]);
        $worker = (new \ReflectionClass(NodeWorker::class))->newInstanceWithoutConstructor();
        $events = [];
        foreach ([$left, $right] as $machine) {
            $conn = Mockery::mock(TcpConnection::class);
            $conn->machineId = $machine->id;
            $conn->wsOwner = 'test-connection-'.$machine->id;
            Cache::put("machine_ws_owner:{$machine->id}", $conn->wsOwner);
            $conn->machineTokenHash = hash('sha256', $machine->token);
            $conn->machineNodeIds = [];
            $conn->shouldNotReceive('close');
            $conn->shouldReceive('send')->andReturnUsing(function ($payload) use (&$events) {
                $events[] = json_decode($payload, true);
                return true;
            });
            NodeRegistry::addMachine($machine->id, $conn);
        }
        try {
            $worker->refreshMachineMembership($left->id);
            $events = [];
            Server::query()->whereKey($node->id)->update(['machine_id' => $right->id]);
            $worker->refreshMachineMembership($right->id);
            $this->assertSame(['sync.nodes', 'sync.config', 'sync.users'], array_column($events, 'event'));
            $worker->refreshMachineMembership($left->id);
            $this->assertSame(NodeRegistry::getMachine($left->id), NodeRegistry::get($peer->id));
            $this->assertSame(NodeRegistry::getMachine($right->id), NodeRegistry::get($node->id));
            $this->assertTrue(Cache::has("node_ws_alive:{$node->id}"));
        } finally {
            foreach ([$node, $peer] as $entry) NodeRegistry::remove($entry->id);
            foreach ([$left, $right] as $machine) NodeRegistry::removeMachine($machine->id);
        }
    }

    public function test_overnight_rate_and_malformed_legacy_traffic(): void
    {
        Bus::fake();
        $node = $this->node(['rate_time_enable' => true, 'rate_time_ranges' => [
            ['start' => '23:00', 'end' => '02:00', 'rate' => 3],
        ]]);
        foreach (['23:00' => 3, '01:59' => 3, '02:00' => 3, '02:01' => 1] as $at => $rate) {
            $this->assertSame((float) $rate, $node->getCurrentRate(new \DateTimeImmutable("2026-06-01 $at")));
        }
        ServerService::processTraffic($node, [1 => [-1, 0], 2 => [1.5, 0], 3 => ['u' => 3, 'd' => 1], -1 => [1, 1]]);
        Bus::assertNotDispatched(TrafficFetchJob::class);
        ServerService::processTraffic($node, [5 => ['12', 3]]);
        $this->assertDatabaseHas('v2_traffic_batches', ['raw_u' => 12, 'raw_d' => 3]);
    }

    public function test_quota_db_failure_preserves_claim_and_new_dirty_signal(): void
    {
        Redis::del('traffic:pending_check', 'traffic:checking', 'traffic:checking_generation');
        Redis::sadd('traffic:pending_check', 71);
        $fail = true;
        \Illuminate\Support\Facades\DB::listen(function ($query) use (&$fail) {
            if ($fail && str_contains($query->sql, 'u + d >= transfer_enable')) {
                $fail = false;
                Redis::sadd('traffic:pending_check', 71);
                throw new \RuntimeException('short database outage');
            }
        });
        try {
            $this->artisan('check:traffic-exceeded')->run();
            $this->fail('Expected the fixture to interrupt the scan');
        } catch (\RuntimeException $e) {
            $this->assertSame('short database outage', $e->getMessage());
        }
        $this->assertSame(1, (int) Redis::scard('traffic:checking'));
        $this->assertSame(1, (int) Redis::scard('traffic:pending_check'));
        $this->artisan('check:traffic-exceeded')->assertSuccessful();
        $this->assertSame(0, (int) Redis::scard('traffic:checking'));
        $this->assertSame(0, (int) Redis::scard('traffic:pending_check'));
        $this->assertSame(2, (int) Redis::get('traffic:checking_generation'));
    }

    public function test_quota_checker_acknowledges_multiple_pages_without_discarding_new_arrivals(): void
    {
        Redis::del('traffic:pending_check', 'traffic:checking', 'traffic:checking_generation');
        Redis::sadd('traffic:checking', ...range(1, 1150));
        Redis::set('traffic:checking_generation', 9);
        Redis::sadd('traffic:pending_check', 1);
        $this->artisan('check:traffic-exceeded')->assertSuccessful();
        $this->assertSame(0, (int) Redis::scard('traffic:checking'));
        $this->assertSame(0, (int) Redis::scard('traffic:pending_check'));
        $this->assertSame(10, (int) Redis::get('traffic:checking_generation'));
    }
}
