<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('v2_order_payment_receipts', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->integer('order_id');
            $table->string('trade_no', 36)->index();
            $table->integer('payment_id');
            $table->unsignedBigInteger('attempt_id')->nullable();
            $table->char('reference_hash', 64);
            $table->text('transaction_no');
            $table->text('callback_no');
            $table->string('kind', 16);
            $table->bigInteger('expected_amount')->nullable();
            $table->bigInteger('verified_amount')->nullable();
            $table->string('quote_currency', 32)->nullable();
            $table->unsignedBigInteger('received_at');
            $table->unsignedBigInteger('reviewed_at')->nullable();
            $table->text('review_note')->nullable();
            $table->unique(['payment_id', 'reference_hash'], 'gateway_receipt_identity');
            $table->index(['order_id', 'kind'], 'gateway_receipt_order');
            $table->index(['kind', 'reviewed_at', 'id'], 'gateway_receipt_review');
        });
    }

    public function down(): void
    {
        if (DB::table('v2_order_payment_receipts')->useWritePdo()->exists()) {
            throw new RuntimeException('Preserve gateway transaction identities and their review history before rollback.');
        }
        Schema::dropIfExists('v2_order_payment_receipts');
    }
};
