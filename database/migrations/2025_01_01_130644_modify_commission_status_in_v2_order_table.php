<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('v2_order', function (Blueprint $table) {
            $table->integer('commission_status')->nullable()->default(null)->comment('0待确认1发放中2有效3无效')->change();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (DB::table('v2_order')->useWritePdo()->whereNull('commission_status')->exists()) {
            throw new RuntimeException('Cannot roll back while orders have NULL commission_status. Reconcile these rows or restore a compatible backup.');
        }

        Schema::table('v2_order', function (Blueprint $table) {
            $table->integer('commission_status')->default(0)->comment('0待确认1发放中2有效3无效')->change();
        });
    }
};
