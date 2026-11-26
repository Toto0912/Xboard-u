<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('v2_order', fn (Blueprint $table) => $table->index(['user_id', 'created_at'], 'order_user_history'));
    }

    public function down(): void
    {
        Schema::table('v2_order', fn (Blueprint $table) => $table->dropIndex('order_user_history'));
    }
};
