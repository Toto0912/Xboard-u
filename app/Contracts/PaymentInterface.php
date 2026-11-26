<?php

namespace App\Contracts;

interface PaymentInterface
{
    public function form(): array;
    public function pay($order): array;
    /** Return transaction_no only for a verified, stable gateway payment ID shared by redeliveries. */
    public function notify($params);
}
