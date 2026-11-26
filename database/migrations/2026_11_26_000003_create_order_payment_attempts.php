<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('v2_order_payment_attempts', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->integer('order_id')->index();
            $table->integer('payment_id');
            // NULL means the gateway uses the public order number.
            $table->string('merchant_reference', 32)->nullable()->unique();
            $table->boolean('legacy_quote')->default(false);
            $table->bigInteger('total_amount');
            $table->bigInteger('handling_amount')->nullable();
            $table->text('confirmed_transaction')->nullable();
            $table->unsignedBigInteger('confirmed_at')->nullable();
            $table->unsignedBigInteger('created_at');
        });
        Schema::table('v2_cancelled_order_payments', function (Blueprint $table) {
            $table->bigInteger('expected_amount')->nullable()->change();
        });
    }

    public function down(): void
    {
        if (DB::table('v2_order_payment_attempts')->useWritePdo()->exists()
            || DB::table('v2_cancelled_order_payments')->useWritePdo()->whereNull('expected_amount')->exists()) {
            throw new RuntimeException('Keep payment references and review records for outstanding gateway callbacks.');
        }
        Schema::table('v2_cancelled_order_payments', function (Blueprint $table) {
            $table->bigInteger('expected_amount')->nullable(false)->change();
        });
        Schema::dropIfExists('v2_order_payment_attempts');
    }
};
