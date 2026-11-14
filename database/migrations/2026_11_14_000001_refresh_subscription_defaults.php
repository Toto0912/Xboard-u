<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Exact known defaults only, tolerant of Windows line endings. Never
        // replace an administrator's edited template with the bundled version.
        $defaults = [
            'surge' => ['default.surge.conf', ['ccb5faa979bd151079355c1e308d100b857dac4ab89b6c5e039aa24839ae129b']],
            'singbox' => ['default.sing-box.json', ['3e80feca7c7ce76cc681c127929e4a88e5c8b4115cf9b30a90b67e3653331df9']],
            'clash' => ['default.clash.yaml', ['e1b07951bb834f3879a14b03929645dffdc912089ccd598efe49462ffc898826']],
            'clashmeta' => ['default.clashmeta.yaml', ['e1a838e83cfaa721fea66a7ca475e71ff6b8e4894bbff710ce4bd51ad1e468ae']],
            'stash' => ['default.clashmeta.yaml', ['e1a838e83cfaa721fea66a7ca475e71ff6b8e4894bbff710ce4bd51ad1e468ae']],
        ];
        foreach ($defaults as $name => [$file, $known]) {
            $content = file_get_contents(base_path('resources/rules/' . $file));
            DB::transaction(function () use ($name, $content, $known) {
                $row = DB::table('v2_subscribe_templates')->where('name', $name)->lockForUpdate()->first();
                if ($row === null) {
                    DB::table('v2_subscribe_templates')->insert([
                        'name' => $name, 'content' => $content, 'created_at' => now(), 'updated_at' => now(),
                    ]);
                } elseif (in_array(hash('sha256', trim(str_replace("\r\n", "\n", $row->content ?? ''))), $known, true)) {
                    DB::table('v2_subscribe_templates')->where('id', $row->id)
                        ->update(['content' => $content, 'updated_at' => now()]);
                }
            });
        }
        // The new cache generation also works when Redis is not running yet
        // during a Docker upgrade. Do not make migrations depend on Redis.
    }

    public function down(): void
    {
        // Data-only defaults update; preserve any later administrator edits.
    }
};
