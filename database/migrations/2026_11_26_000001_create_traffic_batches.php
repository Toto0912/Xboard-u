<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('v2_traffic_batches', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('server_id');
            $table->uuid('batch_id');
            $table->char('digest', 64);
            $table->unsignedBigInteger('received_at');
            $table->unsignedBigInteger('record_at');
            $table->string('activity_type', 32);
            $table->unsignedBigInteger('stat_server_id');
            $table->string('protocol', 32);
            $table->double('rate');
            $table->bigInteger('raw_u')->default(0);
            $table->bigInteger('raw_d')->default(0);
            $table->text('activity_users')->nullable();
            $table->longText('payload')->nullable();
            $table->unsignedBigInteger('completed_at')->nullable();
            $table->unsignedBigInteger('duplicate_count')->default(0);
            $table->unsignedBigInteger('conflict_count')->default(0);
            $table->unique(['server_id', 'batch_id'], 'traffic_node_batch');
        });

        Schema::create('v2_traffic_batch_tasks', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('receipt_id');
            $table->string('kind', 16);
            $table->unsignedBigInteger('available_at')->nullable();
            $table->unique(['receipt_id', 'kind'], 'traffic_batch_task');
            $table->index(['available_at', 'id'], 'traffic_due_tasks');
        });
    }

    public function down(): void
    {
        if (Schema::hasTable('v2_traffic_batches') && DB::table('v2_traffic_batches')->useWritePdo()->exists()) {
            throw new RuntimeException('Traffic receipts must survive application rollback. Keep the batch endpoint and retain the ledger.');
        }
        Schema::dropIfExists('v2_traffic_batch_tasks');
        Schema::dropIfExists('v2_traffic_batches');
    }
};
