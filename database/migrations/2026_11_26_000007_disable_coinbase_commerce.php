<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::transaction(function () {
            DB::table('v2_payment')->where('payment', 'Coinbase')->update(['enable' => false]);
            DB::table('v2_plugins')->where('code', 'coinbase')->update(['is_enabled' => false]);
        });
    }

    public function down(): void
    {
        // Keep the retired gateway disabled, including channels disabled before the upgrade.
    }
};
