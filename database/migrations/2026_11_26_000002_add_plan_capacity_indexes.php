<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('v2_user', fn (Blueprint $table) => $table->index(['plan_id', 'expired_at'], 'plan_active_seats'));
        Schema::table('v2_order', fn (Blueprint $table) => $table->index(['plan_id', 'status'], 'plan_reserved_seats'));
    }

    public function down(): void
    {
        Schema::table('v2_order', fn (Blueprint $table) => $table->dropIndex('plan_reserved_seats'));
        Schema::table('v2_user', fn (Blueprint $table) => $table->dropIndex('plan_active_seats'));
    }
};
