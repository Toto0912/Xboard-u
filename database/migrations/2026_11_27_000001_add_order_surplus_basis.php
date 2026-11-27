<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('v2_order', fn (Blueprint $table) => $table->json('surplus_basis')->nullable());
    }

    public function down(): void
    {
        Schema::table('v2_order', fn (Blueprint $table) => $table->dropColumn('surplus_basis'));
    }
};
