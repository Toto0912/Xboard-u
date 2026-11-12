<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Replace only the shipped, incompatible Clash default. Never touch an
        // administrator template or the separate Stash/Mihomo defaults.
        DB::transaction(function () {
            $row = DB::table('v2_subscribe_templates')->where('name', 'clash')->lockForUpdate()->first();
            if ($row === null) {
                return;
            }
            $hash = hash('sha256', trim(str_replace("\r\n", "\n", $row->content ?? '')));
            if ($hash === 'f76765bcbf2213c1c52c2c85ef504cbc51b52278f370220724ff5fe80fa7eb7d') {
                DB::table('v2_subscribe_templates')->where('id', $row->id)->update([
                    'content' => file_get_contents(base_path('resources/rules/default.clash.yaml')),
                    'updated_at' => now(),
                ]);
            }
        });
    }

    public function down(): void
    {
        // Do not restore a broken template or overwrite subsequent admin edits.
    }
};
