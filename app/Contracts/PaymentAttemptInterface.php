<?php

namespace App\Contracts;

/**
 * The gateway echoes the merchant trade_no supplied to pay() unchanged from notify().
 * Plugins can use 'order_trade_no' to look up the customer-facing order.
 * A verifier can return 'verified_order_gross' as a decimal in the order currency's major units.
 */
interface PaymentAttemptInterface extends PaymentInterface
{
}
