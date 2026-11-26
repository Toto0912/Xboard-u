<?php

namespace App\Contracts;

/** Settlement for this gateway requires a signed amount and currency matching the checkout quote. */
interface PaymentQuoteCurrencyInterface extends PaymentAttemptInterface
{
    public function quoteCurrency(): string;
}
