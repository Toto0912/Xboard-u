<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('v2_traffic_batches', function (Blueprint $table) {
            $table->string('source', 12)->nullable();
            $table->index(['source', 'completed_at', 'id'], 'traffic_receipt_retention');
        });
    }

    public function down(): void
    {
        Schema::table('v2_traffic_batches', function (Blueprint $table) {
            $table->dropIndex('traffic_receipt_retention');
            $table->dropColumn('source');
        });
    }
};
