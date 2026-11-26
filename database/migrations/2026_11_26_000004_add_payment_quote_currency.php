<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('v2_order_payment_attempts', function (Blueprint $table) {
            // Pre-upgrade links have no trustworthy record of their original currency.
            $table->string('quote_currency', 32)->nullable();
        });
    }

    public function down(): void
    {
        if (DB::table('v2_order_payment_attempts')->useWritePdo()->whereNotNull('quote_currency')->exists()) {
            throw new RuntimeException('Keep the original quote currencies for outstanding and confirmed payments.');
        }
        Schema::table('v2_order_payment_attempts', function (Blueprint $table) {
            $table->dropColumn('quote_currency');
        });
    }
};
