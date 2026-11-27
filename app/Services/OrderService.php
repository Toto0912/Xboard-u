<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Jobs\OrderHandleJob;
use App\Models\Coupon;
use App\Models\Order;
use App\Models\OrderPaymentAttempt;
use App\Models\OrderPaymentReceipt;
use App\Models\Plan;
use App\Models\TrafficResetLog;
use App\Models\User;
use App\Services\Plugin\HookManager;
use App\Utils\Helper;
use Brick\Math\BigInteger;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Carbon\Carbon;
use App\Services\PlanService;

class OrderService
{
    const STR_TO_TIME = [
        Plan::PERIOD_MONTHLY => 1,
        Plan::PERIOD_QUARTERLY => 3,
        Plan::PERIOD_HALF_YEARLY => 6,
        Plan::PERIOD_YEARLY => 12,
        Plan::PERIOD_TWO_YEARLY => 24,
        Plan::PERIOD_THREE_YEARLY => 36
    ];
    public $order;
    public $user;

    public function __construct(Order $order)
    {
        $this->order = $order;
    }

    private function lockCurrentOrder(): ?Order
    {
        return Order::whereKey($this->order->id)
            ->lockForUpdate()
            ->first();
    }

    private function lockCurrentOrderWhenStatus(int $status): ?Order
    {
        return Order::whereKey($this->order->id)
            ->where('status', $status)
            ->lockForUpdate()
            ->first();
    }

    /**
     * Create an order from a request.
     *
     * @param User $user
     * @param Plan $plan
     * @param string $period
     * @param string|null $couponCode
     * @return Order
     * @throws ApiException
     */
    public static function createFromRequest(
        User $user,
        Plan $plan,
        string $period,
        ?string $couponCode = null,
    ): Order {
        $userService = app(UserService::class);
        $planService = new PlanService($plan);

        $planService->validatePurchase($user, $period);
        HookManager::call('order.create.before', [$user, $plan, $period, $couponCode]);

        return DB::transaction(function () use ($user, $plan, $period, $couponCode, $userService) {
            // Lock the sale terms before the buyer, as in an admin's forced plan update.
            $plan = PlanService::lockForSale($plan);
            $user = User::lockForUpdate()->find($user->id);
            if (!$user) {
                throw new ApiException(__('The user does not exist'));
            }

            if ($userService->isNotCompleteOrderByUserId($user->id)) {
                throw new ApiException(__('You have an unpaid or pending order, please try again later or cancel it'));
            }

            (new PlanService($plan))->validatePurchase($user, $period);

            $newPeriod = PlanService::getPeriodKey($period);
            $price = (float) ($plan->prices[$newPeriod] ?? 0);
            $cents = $price * 100;
            // Prices entered by the admin have two decimal places. Legacy sub-cent prices truncate.
            if ($price === round($price, 2)) {
                $cents = round($cents);
            }

            $order = new Order([
                'user_id' => $user->id,
                'plan_id' => $plan->id,
                'period' => $newPeriod,
                'trade_no' => Helper::generateOrderNo(),
                'total_amount' => (int) $cents,
            ]);

            $orderService = new self($order);

            if ($couponCode) {
                $orderService->applyCoupon($couponCode);
            }

            $orderService->setVipDiscount($user);
            $orderService->setOrderType($user);

            if ($user->balance > 0 && $order->total_amount > 0) {
                $orderService->handleUserBalance($user, $userService);
            }

            $orderService->setInvite(user: $user);

            if (!$order->save()) {
                throw new ApiException(__('Failed to create order'));
            }

            HookManager::call('order.create.after', $order);
            // 兼容旧钩子
            HookManager::call('order.after_create', $order);

            return $order;
        }, 3);
    }

    public function open(): void
    {
        $openedOrder = DB::transaction(function () {
            $order = $this->lockCurrentOrderWhenStatus(Order::STATUS_PROCESSING);
            if (!$order) {
                return null;
            }

            $plan = Plan::sharedLock()->find($order->plan_id);
            if (!$plan) {
                throw new \RuntimeException('订阅不存在');
            }

            $this->user = User::lockForUpdate()->find($order->user_id);
            $period = PlanService::getPeriodKey($order->period);
            if ($period !== Plan::PERIOD_RESET_TRAFFIC
                && !(new PlanService($plan))->canHoldSeat($this->user, $order)) {
                // Keep a previously paid, oversubscribed sale in PROCESSING for check:order to retry.
                return null;
            }
            HookManager::call('order.open.before', $order);

            if ($order->surplus_credit) {
                $this->user->balance += $order->surplus_credit;
            }

            if ($order->surplus_order_ids) {
                Order::whereIn('id', $order->surplus_order_ids)
                    ->update(['status' => Order::STATUS_DISCOUNTED]);
            }

            // Capture one-time service before an upgrade changes expired_at.
            $resetRequired = $this->user->expired_at === null
                || (int) $order->type === Order::TYPE_NEW_PURCHASE
                || in_array($period, [Plan::PERIOD_ONETIME, Plan::PERIOD_RESET_TRAFFIC], true);
            if ($period === Plan::PERIOD_ONETIME) {
                $this->buyByOneTime($plan);
            } elseif ($period !== Plan::PERIOD_RESET_TRAFFIC) {
                $this->buyByPeriod($order, $plan);
            }

            $this->setSpeedLimit($plan->speed_limit);
            $this->setDeviceLimit($plan->device_limit);

            if (!$this->user->save()) {
                throw new \RuntimeException('用户信息保存失败');
            }

            $eventId = match ((int) $order->type) {
                Order::TYPE_NEW_PURCHASE => admin_setting('new_order_event_id', 0),
                Order::TYPE_RENEWAL => admin_setting('renew_order_event_id', 0),
                Order::TYPE_UPGRADE => admin_setting('change_order_event_id', 0),
                default => 0,
            };

            if ($resetRequired || (int) $eventId === 1) {
                $this->requireTrafficReset();
            }

            $order->status = Order::STATUS_COMPLETED;
            if (!$order->save()) {
                throw new \RuntimeException('订单信息保存失败');
            }

            return $order;
        });

        if (!$openedOrder) {
            return;
        }

        $order = $openedOrder;
        $this->order = $order;

        HookManager::call('order.open.after', $order);
    }


    public function setOrderType(User $user)
    {
        $order = $this->order;
        if ($order->period === Plan::PERIOD_RESET_TRAFFIC) {
            $order->type = Order::TYPE_RESET_TRAFFIC;
        } else if ($user->plan_id !== NULL && $order->plan_id !== $user->plan_id && ($user->expired_at > time() || $user->expired_at === NULL)) {
            if (!(int) admin_setting('plan_change_enable', 1))
                throw new ApiException('目前不允许更改订阅，请联系客服或提交工单操作');
            $order->type = Order::TYPE_UPGRADE;
            if ((int) admin_setting('surplus_enable', 1))
                $this->getSurplusValue($user, $order);
            if ($order->surplus_amount >= $order->total_amount) {
                $order->surplus_credit = (int) ($order->surplus_amount - $order->total_amount);
                $order->total_amount = 0;
            } else {
                $order->total_amount = (int) ($order->total_amount - $order->surplus_amount);
            }
        } else if (($user->expired_at === null || $user->expired_at > time()) && $order->plan_id == $user->plan_id) { // 用户订阅未过期或按流量订阅 且购买订阅与当前订阅相同 === 续费
            $order->type = Order::TYPE_RENEWAL;
        } else { // 新购
            $order->type = Order::TYPE_NEW_PURCHASE;
        }
    }

    public function setVipDiscount(User $user)
    {
        $order = $this->order;
        if ($order->discount_amount === null && !$user->discount) {
            return;
        }

        // Both discounts use the original price. Round once before applying trade-in credit or balance.
        $price = $order->total_amount;
        $vipDiscount = $price * (int) $user->discount / 100;
        $discount = (int) round(($order->discount_amount ?? 0) + $vipDiscount);
        $order->discount_amount = max(0, min($price, $discount));
        $order->total_amount = $price - $order->discount_amount;
    }

    public function setInvite(User $user): void
    {
        $order = $this->order;
        if ($user->invite_user_id && ($order->total_amount <= 0))
            return;
        $order->invite_user_id = $user->invite_user_id;
        $inviter = User::find($user->invite_user_id);
        if (!$inviter)
            return;
        $commissionType = (int) $inviter->commission_type;
        if ($commissionType === User::COMMISSION_TYPE_SYSTEM) {
            $commissionType = (bool) admin_setting('commission_first_time_enable', true) ? User::COMMISSION_TYPE_ONETIME : User::COMMISSION_TYPE_PERIOD;
        }
        $isCommission = false;
        switch ($commissionType) {
            case User::COMMISSION_TYPE_PERIOD:
                $isCommission = true;
                break;
            case User::COMMISSION_TYPE_ONETIME:
                $isCommission = !$this->haveValidOrder($user);
                break;
        }

        if (!$isCommission)
            return;
        $rate = $inviter->effectiveCommissionRate();
        $order->commission_balance = (int) round($order->total_amount * $rate / 100, 0, PHP_ROUND_HALF_UP);
    }

    private function haveValidOrder(User $user): Order|null
    {
        return Order::where('user_id', $user->id)
            ->whereNotIn('status', [Order::STATUS_PENDING, Order::STATUS_CANCELLED])
            ->first();
    }

    private function getSurplusValue(User $user, Order $order)
    {
        if ($user->expired_at === NULL) {
            $lastOneTimeOrder = Order::where('user_id', $user->id)
                ->whereIn('period', [Plan::PERIOD_ONETIME, 'onetime_price'])
                ->where('status', Order::STATUS_COMPLETED)
                ->orderBy('id', 'DESC')
                ->first();
            if (!$lastOneTimeOrder || (int) $lastOneTimeOrder->plan_id !== (int) $user->plan_id) {
                return;
            }
            $quota = (int) $user->transfer_enable;
            $paid = $this->netOrderValue($lastOneTimeOrder);
            if ($quota <= 0 || $paid <= 0) {
                return;
            }
            $order->surplus_basis = ['mode' => 'once', 'plan' => $user->plan_id, 'quota' => $quota];
            $order->surplus_amount = $this->usageCredit($order->surplus_basis, $paid, $user);
            $order->surplus_order_ids = [$lastOneTimeOrder->id];
        } else {
            $now = now()->timestamp;
            $orders = $this->currentPeriodOrders($user, $now);

            if ($orders->isEmpty()) {
                $order->surplus_amount = 0;
                $order->surplus_order_ids = [];
                return;
            }

            $orderAmountSum = $orders->sum(fn (Order $item) => $this->netOrderValue($item));
            $orderMonthSum = $orders->sum(fn($item) => self::STR_TO_TIME[PlanService::getPeriodKey($item->period)] ?? 0);
            $totalSeconds = $user->expired_at - $orders->first()->service_at;
            $remainSeconds = max(0, $user->expired_at - $now);
            $ratio = $totalSeconds > 0 ? min(1, $remainSeconds / $totalSeconds) : 0;
            $usesTraffic = admin_setting('change_order_event_id', 0) == 1;
            $order->surplus_basis = ['mode' => $usesTraffic ? 'period' : 'time', 'plan' => $user->plan_id,
                'quota' => $user->plan?->transfer_enable * $orderMonthSum, 'time_ratio' => $ratio];
            $order->surplus_amount = $this->usageCredit($order->surplus_basis, $orderAmountSum, $user);
            $order->surplus_order_ids = $orders->pluck('id')->all();
        }
    }

    private function netOrderValue(Order $order): int
    {
        return $order->total_amount + $order->balance_amount + $order->surplus_amount - $order->surplus_credit;
    }

    private function usageCredit(array $basis, int $paid, User $user): int
    {
        $quota = $basis['quota'];
        if ($basis['mode'] === 'once') {
            $remaining = max(0, $quota - max(0, (int) $user->u) - max(0, (int) $user->d));
            return $quota > 0 ? BigInteger::of($paid)->multipliedBy($remaining)->quotient($quota)->toInt() : 0;
        }
        $ratio = $basis['time_ratio'];
        if ($basis['mode'] === 'period') {
            $used = Helper::transferToGB($user->u + $user->d);
            $ratio = min($ratio, $quota > 0 ? max(0, $quota - $used) / $quota : 0);
        }
        return (int) max(0, $paid * $ratio);
    }

    // Called inside checkout's transaction, after locking the pending order and its plan.
    public function confirmZeroPayment(): void
    {
        $order = $this->order;
        if ((int) $order->type === Order::TYPE_UPGRADE && $order->surplus_amount > 0) {
            $basis = $order->surplus_basis;
            $timeOnly = ($basis['mode'] ?? null) === 'time';
            $user = ($timeOnly ? User::sharedLock() : User::lockForUpdate())->findOrFail($order->user_id);
            $ids = $order->surplus_order_ids ?? [];
            $sources = Order::query()->useWritePdo()->where('user_id', $user->id)->where('plan_id', $user->plan_id)
                ->where('status', Order::STATUS_COMPLETED)->whereIntegerInRaw('id', $ids)
                ->when($timeOnly, fn ($query) => $query->sharedLock())->get();
            if ($basis === null && $user->expired_at === null && $sources->count() === 1
                && PlanService::getPeriodKey($sources->first()->period) === Plan::PERIOD_ONETIME) {
                $basis = ['mode' => 'once', 'plan' => $user->plan_id, 'quota' => (int) $user->transfer_enable];
            } elseif ($basis === null && $ids && $user->expired_at !== null) {
                $at = (int) $order->created_at;
                $history = $this->currentPeriodOrders($user, $at);
                if ($history->isNotEmpty() && $history->pluck('id')->sort()->values()->all() === collect($ids)->sort()->values()->all()
                    && $user->plan && $user->plan->updated_at <= $at) {
                    $seconds = $user->expired_at - $history->first()->service_at;
                    $months = $history->sum(fn ($item) => self::STR_TO_TIME[PlanService::getPeriodKey($item->period)] ?? 0);
                    // Without the historical switch, require both possible modes to cover the original quote.
                    $basis = ['mode' => 'period', 'plan' => $user->plan_id, 'quota' => $user->plan->transfer_enable * $months,
                        'time_ratio' => $seconds > 0 ? min(1, max(0, $user->expired_at - $at) / $seconds) : 0];
                }
            }
            if (!$basis || (int) ($basis['plan'] ?? 0) !== (int) $user->plan_id || !$ids || count($ids) !== $sources->count()
                || ($timeOnly && !Plan::sharedLock()->find($user->plan_id, ['id']))) {
                throw new ApiException(__('无法核对原套餐折抵依据，请先取消此订单，再重新下单。'));
            }
            if (!$timeOnly && $this->usageCredit($basis, $sources->sum(fn (Order $source) => $this->netOrderValue($source)), $user) < $order->surplus_amount) {
                throw new ApiException(__('套餐用量已变化，原折抵金额不足。请先取消此订单，再重新下单。'));
            }
        }
        $this->markProcessing($order, $order->trade_no);
    }

    private function markProcessing(Order $order, string $reference): void
    {
        $order->status = Order::STATUS_PROCESSING;
        $order->paid_at = time();
        $order->callback_no = $reference;
        if (!$order->save()) {
            throw new \RuntimeException('Failed to save order status.');
        }
    }

    private function currentPeriodOrders(User $user, int $now): Collection
    {
        // Older orders predate paid_at. updated_at may instead reflect a later commission review.
        $history = Order::query()->where('user_id', $user->id)
            ->whereIn('status', [Order::STATUS_COMPLETED, Order::STATUS_DISCOUNTED])
            ->select(['id', 'plan_id', 'status', 'type', 'period', 'total_amount', 'balance_amount', 'surplus_amount', 'surplus_credit'])
            ->selectRaw('COALESCE(NULLIF(paid_at, 0), created_at) AS service_at')
            ->orderBy('service_at')->orderBy('id')->cursor();

        $orders = collect();
        $paidThrough = 0;
        foreach ($history as $previous) {
            $period = PlanService::getPeriodKey($previous->period);
            if ($period === Plan::PERIOD_RESET_TRAFFIC) {
                continue;
            }
            $months = self::STR_TO_TIME[$period] ?? 0;
            $at = (int) $previous->service_at;
            if (!$months || (int) $previous->plan_id !== (int) $user->plan_id
                || (int) $previous->status !== Order::STATUS_COMPLETED || $at <= 0 || $at > $now) {
                $orders = collect();
                $paidThrough = 0;
                continue;
            }
            if ($at > $paidThrough || in_array((int) $previous->type, [Order::TYPE_NEW_PURCHASE, Order::TYPE_UPGRADE], true)) {
                $orders = collect();
                $paidThrough = $at;
            }
            $orders->push($previous);
            $paidThrough = Carbon::createFromTimestamp($paidThrough)->addMonths($months)->timestamp;
        }

        // A later administrative grant alone cannot make an exhausted paid period refundable.
        return $paidThrough > $now ? $orders : collect();
    }

    public function paid(
        string $callbackNo,
        ?int $verifiedPaymentId = null,
        ?string $transactionNo = null,
        ?OrderPaymentAttempt $attempt = null,
        ?int $verifiedGross = null,
        bool $requireIssuedQuote = false
    )
    {
        try {
            [$order, $shouldDispatch] = DB::transaction(function () use ($callbackNo, $verifiedPaymentId, $transactionNo, $attempt, $verifiedGross, $requireIssuedQuote) {
                $order = $this->lockCurrentOrder();
                if (!$order) {
                    throw new \RuntimeException('Order not found.');
                }
                $reference = $transactionNo ?? $callbackNo;
                $expected = null;
                if ($verifiedPaymentId !== null) {
                    if ($requireIssuedQuote && !$attempt && !OrderPaymentAttempt::hasIssuedPublicQuote($order, $verifiedPaymentId)) {
                        throw new \RuntimeException('No matching quote was issued by the disabled payment channel.');
                    }
                    $attempt = OrderPaymentAttempt::confirm($order, $verifiedPaymentId, $reference, $attempt);
                    if ($attempt) {
                        $expected = $attempt->total_amount + (int) $attempt->handling_amount;
                    } elseif ((int) $order->payment_id === $verifiedPaymentId) {
                        $expected = $order->total_amount + (int) $order->handling_amount;
                    }
                    if ($transactionNo !== null && !OrderPaymentReceipt::record($order, $verifiedPaymentId,
                        $transactionNo, $callbackNo, $attempt, $expected, $verifiedGross)) {
                        return [$order, false];
                    }
                }
                if ((int) $order->status !== Order::STATUS_PENDING) {
                    if ((int) $order->status === Order::STATUS_CANCELLED && $verifiedPaymentId !== null) {
                        DB::table('v2_cancelled_order_payments')->upsert([[
                            'order_id' => $order->id,
                            'trade_no' => $order->trade_no,
                            'payment_id' => $verifiedPaymentId,
                            'reference_hash' => hash('sha256', $reference),
                            'transaction_no' => $reference,
                            'callback_no' => $callbackNo,
                            'expected_amount' => $expected ?? $verifiedGross,
                            'received_at' => time(),
                        ]], ['order_id', 'payment_id', 'reference_hash'], ['reference_hash']);
                    }
                    return [$order, false];
                }

                if ($verifiedPaymentId === null && $callbackNo === 'manual_operation') {
                    PlanService::validateCheckoutCapacity($order);
                }
                if ($verifiedPaymentId !== null) {
                    if ($verifiedGross !== null && ($attempt ? $verifiedGross !== $expected : $verifiedGross < $order->total_amount)) {
                        throw new \RuntimeException('Verified payment amount does not match the order quote.');
                    }
                    if ($attempt) {
                        $order->total_amount = $attempt->total_amount;
                        $order->handling_amount = $attempt->handling_amount;
                    } elseif ($verifiedGross !== null && $verifiedGross !== $expected) {
                        $order->handling_amount = $verifiedGross - $order->total_amount;
                    } elseif ($expected === null) {
                        // A pre-upgrade callback for an earlier channel has no recoverable fee quote.
                        $order->handling_amount = null;
                    }
                    $order->payment_id = $verifiedPaymentId;
                }
                $this->markProcessing($order, $callbackNo);

                return [$order, true];
            });

            $this->order = $order;

            if ($shouldDispatch) {
                OrderHandleJob::dispatchSync($order->trade_no);
                if ($verifiedPaymentId !== null) {
                    HookManager::call('payment.notify.success', $order);
                }
            }
        } catch (\Exception $e) {
            Log::error($e);
            return false;
        }
        return true;
    }

    public function cancel(): bool
    {
        try {
            $cancelledOrder = DB::transaction(function () {
                $order = $this->lockCurrentOrderWhenStatus(Order::STATUS_PENDING);
                if (!$order) {
                    return null;
                }

                HookManager::call('order.cancel.before', $order);

                $couponToRelease = $order->coupon_quota_deducted ? $order->coupon_id : null;
                $order->coupon_quota_deducted = false;
                $order->status = Order::STATUS_CANCELLED;
                if (!$order->save()) {
                    throw new \RuntimeException('Failed to save order status.');
                }
                if ($order->balance_amount > 0) {
                    $userService = new UserService();
                    if (!$userService->addBalance($order->user_id, $order->balance_amount)) {
                        throw new \RuntimeException('Failed to add balance.');
                    }
                }
                if ($couponToRelease !== null) {
                    Coupon::whereKey($couponToRelease)->whereNotNull('limit_use')->increment('limit_use');
                }

                return $order;
            });

            if (!$cancelledOrder) {
                return false;
            }

            $this->order = $cancelledOrder;
            HookManager::call('order.cancel.after', $cancelledOrder);
            return true;
        } catch (\Exception $e) {
            Log::error($e);
            return false;
        }
    }

    private function setSpeedLimit($speedLimit)
    {
        $this->user->speed_limit = $speedLimit;
    }

    private function setDeviceLimit($deviceLimit)
    {
        $this->user->device_limit = $deviceLimit;
    }

    private function requireTrafficReset(): void
    {
        if (!app(TrafficResetService::class)->performReset($this->user, TrafficResetLog::SOURCE_ORDER)) {
            throw new \RuntimeException('流量重置失败');
        }
    }

    private function buyByPeriod(Order $order, Plan $plan)
    {
        // change plan process
        if ((int) $order->type === Order::TYPE_UPGRADE) {
            $this->user->expired_at = time();
        }
        $this->user->transfer_enable = $plan->transfer_enable * 1073741824;
        $this->user->plan_id = $plan->id;
        $this->user->group_id = $plan->group_id;
        $this->user->expired_at = $this->getTime($order->period, $this->user->expired_at);
    }

    private function buyByOneTime(Plan $plan)
    {
        $this->user->transfer_enable = $plan->transfer_enable * 1073741824;
        $this->user->plan_id = $plan->id;
        $this->user->group_id = $plan->group_id;
        $this->user->expired_at = NULL;
    }

    /**
     * 计算套餐到期时间
     * @param string $periodKey
     * @param int $timestamp
     * @return int
     * @throws ApiException
     */
    private function getTime(string $periodKey, ?int $timestamp = null): int
    {
        $timestamp = $timestamp < time() ? time() : $timestamp;
        $periodKey = PlanService::getPeriodKey($periodKey);

        if (isset(self::STR_TO_TIME[$periodKey])) {
            $months = self::STR_TO_TIME[$periodKey];
            return Carbon::createFromTimestamp($timestamp)->addMonths($months)->timestamp;
        }

        throw new ApiException('无效的套餐周期');
    }

    protected function applyCoupon(string $couponCode): void
    {
        $couponService = new CouponService($couponCode);
        if (!$couponService->use($this->order)) {
            throw new ApiException(__('Coupon failed'));
        }
        $this->order->coupon_id = $couponService->getId();
    }

    /**
     * Summary of handleUserBalance
     * @param User $user
     * @param UserService $userService
     * @return void
     */
    protected function handleUserBalance(User $user, UserService $userService): void
    {
        $remainingBalance = $user->balance - $this->order->total_amount;

        if ($remainingBalance >= 0) {
            if (!$userService->addBalance($this->order->user_id, -$this->order->total_amount)) {
                throw new ApiException(__('Insufficient balance'));
            }
            $this->order->balance_amount = $this->order->total_amount;
            $this->order->total_amount = 0;
        } else {
            if (!$userService->addBalance($this->order->user_id, -$user->balance)) {
                throw new ApiException(__('Insufficient balance'));
            }
            $this->order->balance_amount = $user->balance;
            $this->order->total_amount = $this->order->total_amount - $user->balance;
        }
    }
}
