<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('v2_server', function (Blueprint $table) {
            $table->json('cdn_settings')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('v2_server', function (Blueprint $table) {
            $table->dropColumn('cdn_settings');
        });
    }
};
