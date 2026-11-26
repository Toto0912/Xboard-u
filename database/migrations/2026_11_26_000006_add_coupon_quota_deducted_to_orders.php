<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('v2_order', function (Blueprint $table) {
            // Older orders have no record of whether their coupon had a finite quota.
            $table->boolean('coupon_quota_deducted')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('v2_order', function (Blueprint $table) {
            $table->dropColumn('coupon_quota_deducted');
        });
    }
};
