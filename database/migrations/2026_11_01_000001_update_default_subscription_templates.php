<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Match only the pinned upstream defaults (LF/CRLF tolerant). Existing
        // administrator templates must survive upgrades byte for byte.
        $legacyClash = '7a5fbbf6a56faa20ece8644ce307cca6e2eb7ff637544ce4d055cc16f94f1fed';
        $legacySingbox = 'c37f5ce96bf56c9c88f7780e0c001bee3f940ca8abff906d6d7956456194bec2';
        $hash = static fn (string $content): string => hash('sha256', trim(str_replace("\r\n", "\n", $content)));
        $clash = file_get_contents(base_path('resources/rules/default.clash.yaml'));
        foreach ([
            'singbox' => ['default.sing-box.json', [$legacySingbox]],
            'clash' => ['default.clash.yaml', [$legacyClash]],
            // Fresh installs seeded these two from default.clash.yaml in the
            // historical migration. Correct that mapping without changing it.
            'clashmeta' => ['default.clashmeta.yaml', [$legacyClash, $hash($clash)]],
            'stash' => ['default.clashmeta.yaml', [$legacyClash, $hash($clash)]],
        ] as $name => [$file, $knownDefaults]) {
            $content = file_get_contents(base_path('resources/rules/' . $file));
            DB::transaction(function () use ($name, $content, $knownDefaults, $hash) {
                $row = DB::table('v2_subscribe_templates')->where('name', $name)->lockForUpdate()->first();
                if ($row === null) {
                    DB::table('v2_subscribe_templates')->insert([
                        'name' => $name, 'content' => $content, 'created_at' => now(), 'updated_at' => now(),
                    ]);
                } elseif (in_array($hash($row->content ?? ''), $knownDefaults, true)) {
                    DB::table('v2_subscribe_templates')->where('id', $row->id)
                        ->update(['content' => $content, 'updated_at' => now()]);
                }
            });
        }
    }

    public function down(): void
    {
        // Data-only defaults update. Never overwrite subsequent admin edits.
    }
};
