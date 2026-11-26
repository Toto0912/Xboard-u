<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('v2_plan', function (Blueprint $table) {
            $table->unsignedInteger('capacity_limit')->nullable()->default(null)
                ->comment('NULL for unlimited, zero for no new seats')->change();
        });
    }

    public function down(): void
    {
        Schema::table('v2_plan', function (Blueprint $table) {
            $table->unsignedInteger('capacity_limit')->nullable()->default(0)
                ->comment('0 for unlimited')->change();
        });
    }
};
