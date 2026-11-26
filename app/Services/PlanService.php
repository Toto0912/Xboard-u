<?php

namespace App\Services;

use App\Models\Plan;
use App\Models\Order;
use App\Models\User;
use App\Exceptions\ApiException;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;

class PlanService
{
    public Plan $plan;

    public function __construct(Plan $plan)
    {
        $this->plan = $plan;
    }

    /**
     * 获取所有可销售的订阅计划列表
     * 条件：show 和 sell 为 true，且容量充足
     *
     * @return Collection
     */
    public function getAvailablePlans(): Collection
    {
        return Plan::where('show', true)
            ->where('sell', true)
            ->orderBy('sort')
            ->get()
            ->filter(fn (Plan $plan) => $this->loadRemainingCapacity($plan) !== 0);
    }

    /**
     * 获取指定订阅计划的可用状态
     * 条件：renew 和 sell 为 true
     *
     * @param int $planId
     * @return Plan|null
     */
    public function getAvailablePlan(int $planId): ?Plan
    {
        return Plan::where('id', $planId)
            ->where('sell', true)
            ->where('renew', true)
            ->first();
    }

    /**
     * 检查指定计划是否可用于指定用户
     * 
     * @param Plan $plan
     * @param User $user
     * @return bool
     */
    public function isPlanAvailableForUser(Plan $plan, User $user): bool
    {
        $renewal = (int) $user->plan_id === $plan->id;
        if ($renewal ? !$plan->renew : (!$plan->show || !$plan->sell)) {
            return false;
        }

        $now = time();
        return $this->loadRemainingCapacity($plan, $now) !== 0
            || ($renewal && $this->occupiesSeat($plan, $user, $now));
    }

    public function purchasePricesForUser(Plan $plan, User $user): ?array
    {
        $prices = $plan->prices ?? [];
        $canReset = self::canPurchaseReset($plan, $user);
        if ($this->isPlanAvailableForUser($plan, $user)) {
            return $canReset ? $prices : Arr::except($prices, Plan::PERIOD_RESET_TRAFFIC);
        }
        if ($canReset) {
            $this->loadRemainingCapacity($plan);
            return Arr::only($prices, Plan::PERIOD_RESET_TRAFFIC);
        }
        return null;
    }

    public static function canPurchaseReset(Plan $plan, User $user): bool
    {
        return (int) $user->plan_id === $plan->id
            && isset($plan->prices[Plan::PERIOD_RESET_TRAFFIC])
            && app(UserService::class)->isAvailable($user);
    }

    // Purchase views serialize this count. Order and gift resources do not need an inventory query.
    private function loadRemainingCapacity(Plan $plan, ?int $now = null): ?int
    {
        $remaining = $this->remainingCapacity($plan, null, $now);
        $plan->setAttribute('remaining_capacity', $remaining)->syncOriginalAttribute('remaining_capacity');
        return $remaining;
    }

    public function validatePurchase(User $user, string $period): void
    {
        if (!$this->plan) {
            throw new ApiException(__('Subscription plan does not exist'));
        }

        // 转换周期格式为新版格式
        $periodKey = self::getPeriodKey($period);
        $price = $this->plan->prices[$periodKey] ?? null;

        if ($price === null) {
            throw new ApiException(__('This payment period cannot be purchased, please choose another period'));
        }

        if ($periodKey === Plan::PERIOD_RESET_TRAFFIC) {
            $this->validateResetTrafficPurchase($user);
            return;
        }

        $this->validateSeat($user, $periodKey);

        $this->validatePlanAvailability($user);
    }

    /**
     * 智能转换周期格式为新版格式
     * 如果是新版格式直接返回，如果是旧版格式则转换为新版格式
     *
     * @param string $period
     * @return string
     */
    public static function getPeriodKey(string $period): string
    {
        // 如果是新版格式直接返回
        if (in_array($period, self::getNewPeriods())) {
            return $period;
        }

        // 如果是旧版格式则转换为新版格式
        return Plan::LEGACY_PERIOD_MAPPING[$period] ?? $period;
    }
    /**
     * 只能转换周期格式为旧版本
     */
    public static function convertToLegacyPeriod(string $period): string
    {
        $flippedMapping = array_flip(Plan::LEGACY_PERIOD_MAPPING);
        return $flippedMapping[$period] ?? $period;
    }

    /**
     * 获取所有支持的新版周期格式
     *
     * @return array
     */
    public static function getNewPeriods(): array
    {
        return array_values(Plan::LEGACY_PERIOD_MAPPING);
    }

    /**
     * 获取旧版周期格式
     *
     * @param string $period
     * @return string
     */
    public static function getLegacyPeriod(string $period): string
    {
        $flipped = array_flip(Plan::LEGACY_PERIOD_MAPPING);
        return $flipped[$period] ?? $period;
    }

    protected function validateResetTrafficPurchase(User $user): void
    {
        if (!self::canPurchaseReset($this->plan, $user)) {
            throw new ApiException(__('Subscription has expired or no active subscription, unable to purchase Data Reset Package'));
        }
    }

    protected function validatePlanAvailability(User $user): void
    {
        if ($user->plan_id !== $this->plan->id && (!$this->plan->show || !$this->plan->sell)) {
            throw new ApiException(__('This subscription has been sold out, please choose another subscription'));
        }

        if (!$this->plan->renew && $user->plan_id == $this->plan->id) {
            throw new ApiException(__('This subscription cannot be renewed, please change to another subscription'));
        }

        if (!$this->plan->show && $this->plan->renew && !app(UserService::class)->isAvailable($user)) {
            throw new ApiException(__('This subscription has expired, please change to another subscription'));
        }
    }

    // Limited sales serialize on the plan. Unlimited plans retain shared-lock concurrency.
    public static function lockForSale(Plan $snapshot): Plan
    {
        return self::lockForAllocation($snapshot->id, $snapshot)
            ?? throw (new ModelNotFoundException())->setModel(Plan::class, [$snapshot->id]);
    }

    public static function lockForAllocation(int $id, ?Plan $snapshot = null): ?Plan
    {
        if (DB::connection()->getDriverName() === 'sqlite') {
            // SQLite ignores FOR UPDATE. Acquire its writer lock before the transaction's first
            // read so a competing WAL checkout waits instead of upgrading a stale snapshot.
            DB::table((new Plan())->getTable())->where('id', $id)->whereNotNull('capacity_limit')
                ->update(['capacity_limit' => DB::raw('capacity_limit')]);
            return Plan::find($id);
        }
        $snapshot ??= Plan::query()->useWritePdo()->find($id);
        if (!$snapshot) {
            return null;
        }
        if ($snapshot->capacity_limit === null) {
            $plan = Plan::sharedLock()->find($id);
            if ($plan?->capacity_limit === null) {
                return $plan;
            }
        }
        return Plan::lockForUpdate()->find($id);
    }

    public static function validateCheckoutCapacity(Order $order): void
    {
        $plan = Plan::sharedLock()->findOrFail($order->plan_id);
        if ($plan->capacity_limit === null || self::getPeriodKey($order->period) === Plan::PERIOD_RESET_TRAFFIC) {
            return;
        }
        $user = User::sharedLock()->findOrFail($order->user_id);
        (new self($plan))->validateSeat($user, $order->period, $order);
    }

    public function validateSeat(User $user, string $period, ?Order $order = null): void
    {
        if (self::getPeriodKey($period) !== Plan::PERIOD_RESET_TRAFFIC && !$this->canHoldSeat($user, $order)) {
            throw new ApiException(__('Current product is sold out'));
        }
    }

    public function canHoldSeat(User $user, ?Order $order = null): bool
    {
        $now = time();
        return $this->occupiesSeat($this->plan, $user, $now) || $this->hasCapacity($this->plan, $order, $now);
    }

    // The caller holds the plan lock until the grant and user save commit.
    public function canGrantSeat(User $user): bool
    {
        $now = time();
        if ($this->plan->capacity_limit === null || $this->occupiesSeat($this->plan, $user, $now)) {
            return true;
        }
        $reservation = $user->exists ? $this->reservations($this->plan)->where('user_id', $user->id)
            ->orderBy('id')->sharedLock()->first(['id', 'user_id']) : null;
        return $this->remainingCapacity($this->plan, $reservation, $now, true) !== 0;
    }

    private function occupiesSeat(Plan $plan, User $user, int $now): bool
    {
        return (int) $user->plan_id === (int) $plan->id && ($user->expired_at === null || $user->expired_at >= $now);
    }

    public function hasCapacity(Plan $plan, ?Order $order = null, ?int $now = null): bool
    {
        return $this->remainingCapacity($plan, $order, $now) !== 0;
    }

    private function reservations(Plan $plan): Builder
    {
        return Order::where('plan_id', $plan->id)
            ->whereIn('status', [Order::STATUS_PENDING, Order::STATUS_PROCESSING])
            ->whereNotIn('period', [Plan::PERIOD_RESET_TRAFFIC, 'reset_price']);
    }

    private function remainingCapacity(Plan $plan, ?Order $order, ?int $now, bool $currentRead = false): ?int
    {
        if ($plan->capacity_limit === null) {
            return null;
        }
        if ($plan->capacity_limit <= 0) {
            return 0;
        }

        $now ??= time();
        $active = User::where('plan_id', $plan->id)->select('id')
            ->where(function ($query) use ($now) {
                $query->where('expired_at', '>=', $now)
                    ->orWhereNull('expired_at');
            });
        // An uncompleted subscription order is its owner's reservation. UNION counts renewals once.
        $reserved = $this->reservations($plan)->select('user_id');
        if ($order !== null) {
            // Existing sales can exceed the cap after an upgrade or an administrator lowers it.
            $reserved->where('id', '<', $order->id)->where('user_id', '!=', $order->user_id);
        }
        if (($currentRead || DB::transactionLevel() > 1) && DB::connection()->getDriverName() === 'mysql') {
            // The caller may already have a repeatable-read snapshot predating the plan lock.
            // Lock the source rows inside each UNION arm to count current committed reservations.
            $active->sharedLock();
            $reserved->sharedLock();
        }
        $occupied = DB::query()->fromSub($active->union($reserved), 'occupied')->count();
        return max(0, $plan->capacity_limit - $occupied);
    }

    public function getAvailablePeriods(Plan $plan): array
    {
        return array_filter(
            $plan->getActivePeriods(),
            fn($period) => isset($plan->prices[$period]) && $plan->prices[$period] > 0
        );
    }

    public function canResetTraffic(Plan $plan): bool
    {
        return $plan->reset_traffic_method !== Plan::RESET_TRAFFIC_NEVER
            && $plan->getResetTrafficPrice() > 0;
    }
}
