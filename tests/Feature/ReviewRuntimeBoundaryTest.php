<?php

namespace Tests\Feature;

use App\Models\Server;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class ReviewRuntimeBoundaryTest extends TestCase
{
    use RefreshDatabase;

    public function test_legacy_user_lists_keep_the_worker_memory_limit(): void
    {
        admin_setting(['server_token' => 'fixture-legacy-token']);
        $original = ini_get('memory_limit');
        $testLimit = max(128, (int) ceil(memory_get_usage(true) / 1048576) + 32).'M';
        ini_set('memory_limit', $testLimit);
        try {
            foreach (['TrojanTidalab' => 'trojan', 'ShadowsocksTidalab' => 'shadowsocks'] as $path => $type) {
                $node = Server::withoutEvents(fn () => Server::create([
                    'name' => 'local', 'type' => $type, 'host' => '127.0.0.1', 'port' => 12345, 'server_port' => 12345,
                    'rate' => 1, 'group_ids' => [], 'protocol_settings' => [],
                ]));
                $params = http_build_query(['token' => 'fixture-legacy-token', 'node_id' => $node->id]);
                $this->getJson('/api/v1/server/'.$path.'/user?'.$params, ['If-None-Match' => '""'])
                    ->assertOk()->assertJsonPath('data', []);
                $this->assertSame($testLimit, ini_get('memory_limit'));
            }
        } finally {
            ini_set('memory_limit', $original);
        }
    }

    public function test_old_commission_status_downgrade_requires_review_of_null_rows(): void
    {
        $active = DB::getDefaultConnection();
        config(['database.connections.commission_history' => ['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => '']]);
        DB::setDefaultConnection('commission_history');
        try {
            Schema::create('v2_order', function (Blueprint $table) {
                $table->id();
                $table->integer('commission_status')->nullable();
            });
            DB::table('v2_order')->insert(['commission_status' => null]);
            $migration = require database_path('migrations/2025_01_01_130644_modify_commission_status_in_v2_order_table.php');
            try {
                $migration->down();
                $this->fail('Expected a preflight error for the historical NULL status.');
            } catch (\RuntimeException $exception) {
                $this->assertStringContainsString('NULL commission_status', $exception->getMessage());
            }
            $this->assertSame(1, DB::table('v2_order')->whereNull('commission_status')->count());
            DB::table('v2_order')->update(['commission_status' => 2]);
            $migration->down();
            $migration->up();
            $this->assertSame(2, (int) DB::table('v2_order')->value('commission_status'));
        } finally {
            DB::setDefaultConnection($active);
            DB::purge('commission_history');
        }
    }
}
