<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('v2_cancelled_order_payments', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->integer('order_id');
            $table->string('trade_no', 36)->index();
            $table->integer('payment_id');
            $table->char('reference_hash', 64);
            $table->text('transaction_no');
            $table->text('callback_no');
            $table->bigInteger('expected_amount');
            $table->unsignedBigInteger('received_at');
            $table->unsignedBigInteger('reviewed_at')->nullable();
            $table->text('review_note')->nullable();
            $table->unique(['order_id', 'payment_id', 'reference_hash'], 'cancelled_payment_reference');
            $table->index(['reviewed_at', 'id'], 'cancelled_payment_review');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('v2_cancelled_order_payments');
    }
};
