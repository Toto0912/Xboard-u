<?php

namespace Tests\Feature\Server;

use App\Exceptions\ApiException;
use App\Http\Middleware\ServerV2;
use App\Models\ServerMachine;
use App\Models\User;
use App\Services\DeviceStateService;
use App\Services\NodeRegistry;
use App\Services\NodeSyncService;
use App\Services\ServerService;
use App\WebSocket\NodeWorker;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Tests\TestCase;
use Workerman\Connection\TcpConnection;

class MachineRevocationTest extends TestCase
{
    use RefreshDatabase;

    private NodeWorker $worker;

    protected function setUp(): void
    {
        parent::setUp();
        $this->worker = (new \ReflectionClass(NodeWorker::class))->newInstanceWithoutConstructor();
    }

    private function machine(): ServerMachine
    {
        return ServerMachine::create(['name' => 'machine', 'token' => 'initial-key', 'is_active' => true]);
    }

    private function connect(ServerMachine $machine, array &$events): TcpConnection
    {
        $conn = Mockery::mock(TcpConnection::class);
        $conn->shouldReceive('send')->andReturnUsing(function ($data) use (&$events) {
            $events[] = json_decode($data, true);
            return true;
        });
        $conn->shouldReceive('close')->andReturnUsing(function ($data = null) use (&$events) {
            $events[] = $data ? json_decode($data, true) : ['event' => 'close'];
        });
        $conn->shouldReceive('getRemoteIp')->andReturn('127.0.0.1');
        $this->worker->onWebSocketConnect($conn, '/?machine_id=' . $machine->id . '&token=' . $machine->token);
        return $conn;
    }

    public function test_admin_changes_publish_only_committed_invalidations_and_rest_rejects_old_credentials(): void
    {
        Sanctum::actingAs(User::create([
            'uuid' => '7f894d8b-0d1c-4612-a901-b1475c06f513', 'token' => str_repeat('a', 32),
            'email' => 'machine-admin@example.test', 'password' => bcrypt('password'), 'is_admin' => true,
        ]));
        $path = '/api/v2/' . hash('crc32b', config('app.key')) . '/server/machine';
        $machine = $this->machine();
        $events = [];
        Redis::shouldReceive('publish')->with('node:push', Mockery::type('string'))
            ->andReturnUsing(function ($channel, $data) use (&$events) {
                $events[] = json_decode($data, true);
                return 1;
            });
        $save = ['id' => $machine->id, 'name' => 'machine', 'is_active' => false];
        DB::beginTransaction();
        try {
            $this->postJson($path . '/save', $save)->assertOk();
            $this->assertSame([], $events);
        } finally {
            DB::rollBack();
        }
        $credentials = ['machine_id' => $machine->id, 'token' => $machine->token];
        $discovery = '/api/v2/server/machine/nodes';
        $this->postJson($discovery, $credentials)->assertOk();
        $this->postJson($path . '/save', $save)->assertOk();
        $this->postJson($discovery, $credentials)->assertForbidden();
        $this->postJson($path . '/save', array_merge($save, ['is_active' => true]))->assertOk();
        $newToken = $this->postJson($path . '/resetToken', ['id' => $machine->id])->assertOk()->json('data.token');
        $this->postJson($discovery, $credentials)->assertForbidden();
        $credentials['token'] = $newToken;
        $this->postJson($discovery, $credentials)->assertOk();
        $this->postJson($path . '/drop', ['id' => $machine->id])->assertOk();
        $this->postJson($discovery, $credentials)->assertForbidden();
        $this->assertSame(array_fill(0, 3, [
            'machine_id' => $machine->id, 'event' => NodeSyncService::MACHINE_AUTH_CHANGED, 'data' => [],
        ]), $events);
    }

    public function test_missed_notification_retires_node_mappings_and_empty_machines_on_heartbeat(): void
    {
        $machine = $this->machine();
        $empty = ServerMachine::create(['name' => 'empty', 'token' => 'empty-key', 'is_active' => true]);
        $events = $emptyEvents = [];
        $conn = $this->connect($machine, $events);
        $emptyConn = $this->connect($empty, $emptyEvents);
        NodeRegistry::refreshMachineNodes($machine->id, [42]);
        Cache::put('node_ws_alive:42', true);
        $this->mock(DeviceStateService::class)->shouldReceive('clearAllNodeDevices')->once()->with(42)->andReturn([]);
        try {
            $machine->update(['is_active' => false]);
            $empty->delete();
            $this->worker->revalidateMachineSessions();
            $this->assertNull(NodeRegistry::getMachine($machine->id));
            $this->assertNull(NodeRegistry::getMachine($empty->id));
            $this->assertFalse(NodeRegistry::send(42, 'sync.users', []));
            $this->worker->onMessage($conn, '{"event":"pong"}');
            $this->assertFalse(Cache::has('node_ws_alive:42'));
            foreach ([$events, $emptyEvents] as $sent) {
                $this->assertSame(['auth.success', 'sync.nodes', 'machine.revoked'], array_column($sent, 'event'));
                $this->assertSame([], $sent[1]['data']['nodes']);
                $this->assertSame(403, $sent[2]['data']['code']);
            }
        } finally {
            $this->worker->onClose($conn);
            $this->worker->onClose($emptyConn);
        }
    }

    public function test_new_token_connection_survives_late_notification_and_old_close(): void
    {
        $machine = $this->machine();
        $oldEvents = $newEvents = [];
        $old = $this->connect($machine, $oldEvents);
        NodeRegistry::refreshMachineNodes($machine->id, [41]);
        $this->mock(DeviceStateService::class)->shouldReceive('clearAllNodeDevices')->with(41)->andReturn([]);
        $machine->update(['token' => 'new-key']);
        $fresh = $this->connect($machine, $newEvents);
        try {
            NodeRegistry::refreshMachineNodes($machine->id, [41]);
            Cache::put('node_ws_alive:41', true);
            $this->worker->revalidateMachineSessions([$machine->id]);
            $this->worker->onClose($old);
            $this->assertSame($fresh, NodeRegistry::getMachine($machine->id));
            $this->assertSame($fresh, NodeRegistry::get(41));
            $this->assertTrue(Cache::has('node_ws_alive:41'));
            $this->assertSame('machine.revoked', end($oldEvents)['event']);
            $this->assertSame(['auth.success'], array_column($newEvents, 'event'));
        } finally {
            $this->worker->onClose($fresh);
        }
    }

    public function test_token_rotation_invalidates_existing_session_before_the_next_login(): void
    {
        $machine = $this->machine();
        $events = [];
        $conn = $this->connect($machine, $events);
        try {
            $machine->update(['token' => 'rotated-key']);
            $this->worker->revalidateMachineSessions([$machine->id]);
            $this->assertNull(NodeRegistry::getMachine($machine->id));
            $this->assertSame(['event' => 'machine.revoked', 'data' => ['code' => 403]], end($events));
        } finally {
            $this->worker->onClose($conn);
        }
    }

    public function test_same_token_reconnection_detaches_old_routes_before_its_socket_finishes_closing(): void
    {
        $machine = $this->machine();
        $oldEvents = $newEvents = [];
        $old = $this->connect($machine, $oldEvents);
        $this->mock(DeviceStateService::class)->shouldReceive('clearAllNodeDevices')->once()->with(41)->andReturn([]);
        NodeRegistry::refreshMachineNodes($machine->id, [41]);
        $fresh = $this->connect($machine, $newEvents);
        try {
            $this->assertFalse(NodeRegistry::send(41, 'sync.users', []));
            $this->worker->onMessage($old, '{"event":"pong"}');
            $this->assertFalse(Cache::has('node_ws_alive:41'));
            $this->worker->onClose($old);
            $this->assertSame($fresh, NodeRegistry::getMachine($machine->id));
            $this->assertSame(['auth.success', 'close'], array_column($oldEvents, 'event'));
            $machine->update(['is_active' => false]);
            $this->worker->revalidateMachineSessions();
            $this->assertSame('machine.revoked', end($newEvents)['event']);
        } finally {
            $this->worker->onClose($fresh);
        }
    }

    public function test_stale_read_replica_cannot_restore_credentials_or_node_membership(): void
    {
        $machine = $this->machine();
        $default = DB::getDefaultConnection();
        $primary = DB::connection()->getPdo();
        $replica = new \PDO('sqlite::memory:');
        $replica->exec('CREATE TABLE v2_server_machine (id INTEGER, token TEXT, is_active INTEGER)');
        $replica->prepare('INSERT INTO v2_server_machine VALUES (?, ?, 1)')->execute([$machine->id, 'old-key']);
        $replica->exec('CREATE TABLE v2_server (id INTEGER, machine_id INTEGER, enabled INTEGER, sort INTEGER)');
        $replica->prepare('INSERT INTO v2_server VALUES (42, ?, 1, 0)')->execute([$machine->id]);
        config(['database.connections.machine_split' => config("database.connections.{$default}")]);
        $split = DB::connection('machine_split');
        $split->setPdo($primary)->setReadPdo($replica);
        DB::setDefaultConnection('machine_split');
        try {
            $this->assertSame('old-key', ServerMachine::findOrFail($machine->id)->token);
            $this->assertNull(ServerMachine::findWithToken($machine->id, 'old-key'));
            $this->assertNotNull(ServerMachine::findWithToken($machine->id, $machine->token));
            $this->assertTrue(ServerService::getMachineNodes($machine)->isEmpty());

            $credentials = ['machine_id' => $machine->id, 'token' => $machine->token, 'node_id' => 42];
            try {
                (new ServerV2())->handle(Request::create('/api/v2/server/user', 'GET', $credentials),
                    fn () => $this->fail('A node visible only on the replica was authorized'));
                $this->fail('The unassigned node was accepted');
            } catch (ApiException $e) {
                $this->assertSame('Node not found on this machine', $e->getMessage());
            }
            $events = [];
            $conn = $this->connect($machine, $events);
            try {
                $this->assertSame([], $conn->machineNodeIds);
                $this->worker->revalidateMachineSessions();
                $this->assertSame($conn, NodeRegistry::getMachine($machine->id));
                $machine->update(['is_active' => false]);
                $this->worker->revalidateMachineSessions();
                $this->assertSame('machine.revoked', end($events)['event']);
            } finally {
                $this->worker->onClose($conn);
            }
        } finally {
            DB::setDefaultConnection($default);
            DB::purge('machine_split');
        }
    }
}
