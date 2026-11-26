<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class LegacyMigrationBoundaryTest extends TestCase
{
    public function test_legacy_proxy_settings_and_optional_prices_round_trip(): void
    {
        $previous = DB::getDefaultConnection();
        config(['database.connections.legacy_fixture' => ['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => '']]);
        DB::setDefaultConnection('legacy_fixture');
        try {
            $files = glob(database_path('migrations/*.php'));
            sort($files, SORT_STRING);
            foreach ($files as $file) {
                if (basename($file) >= '2025_01_04') break;
                $this->artisan('migrate', ['--database' => 'legacy_fixture', '--path' => $file,
                    '--realpath' => true, '--force' => true])->assertSuccessful();
            }
            DB::table('v2_plan')->insert(['id' => 7, 'name' => 'legacy', 'group_id' => 1, 'transfer_enable' => 12,
                'month_price' => 123, 'reset_price' => 0, 'created_at' => 1, 'updated_at' => 1]);
            $plans = require database_path('migrations/2025_01_04_optimize_plan_table.php');
            $plans->up();
            $plans->down();
            $plan = DB::table('v2_plan')->where('id', 7)->first();
            $this->assertSame(123, (int) $plan->month_price);
            $this->assertNull($plan->quarter_price);
            $this->assertNotNull($plan->reset_price);
            $this->assertSame(0, (int) $plan->reset_price);
            $ws = ['path' => '/legacy-path', 'headers' => ['Host' => 'legacy.example']];
            foreach ([37 => null, 41 => 37] as $id => $parent) {
                DB::table('v2_server_trojan')->insert(['id' => $id, 'name' => 'legacy', 'group_id' => '[1]',
                    'parent_id' => $parent, 'rate' => '1', 'host' => '127.0.0.1', 'port' => 443, 'server_port' => 443,
                    'network' => 'ws', 'networkSettings' => json_encode($ws), 'created_at' => time(), 'updated_at' => time()]);
            }
            $servers = require database_path('migrations/2025_01_05_131425_create_v2_server_table.php');
            $servers->up();
            $child = DB::table('v2_server')->where('code', '41')->first();
            $this->assertEquals($ws, json_decode($child->protocol_settings, true)['network_settings']);
            $this->assertEquals(DB::table('v2_server')->where('code', '37')->value('id'), $child->parent_id);
            $servers->down();
            $restored = DB::table('v2_server_trojan')->find(41);
            $this->assertEquals($ws, json_decode($restored->networkSettings, true));
            $this->assertEquals(37, $restored->parent_id);
        } finally {
            DB::setDefaultConnection($previous);
            DB::purge('legacy_fixture');
        }
    }
}
