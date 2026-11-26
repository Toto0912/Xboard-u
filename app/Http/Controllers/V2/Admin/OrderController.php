<?php

namespace App\Http\Controllers\V2\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\OrderAssign;
use App\Http\Requests\Admin\OrderUpdate;
use App\Models\Order;
use App\Models\Plan;
use App\Models\User;
use App\Services\OrderService;
use App\Services\PlanService;
use App\Services\UserService;
use App\Utils\Helper;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class OrderController extends Controller
{

    public function detail(Request $request)
    {
        $order = Order::with(['user', 'plan', 'commission_log', 'invite_user'])->find($request->input('id'));
        if (!$order)
            return $this->fail([400202, '订单不存在']);
        if ($order->surplus_order_ids) {
            $order['surplus_orders'] = Order::whereIn('id', $order->surplus_order_ids)->get();
        }
        $order['period'] = PlanService::getLegacyPeriod((string) $order->period);
        return $this->success($order);
    }

    public function fetch(Request $request)
    {
        $current = $request->input('current', 1);
        $pageSize = $request->input('pageSize', 10);
        $orderModel = Order::with('plan:id,name');

        if ($request->boolean('is_commission')) {
            $orderModel->whereNotNull('invite_user_id')
                ->whereNotIn('status', [0, 2])
                ->where('commission_balance', '>', 0);
        }

        $this->applyFiltersAndSorts($request, $orderModel);

        /** @var \Illuminate\Pagination\LengthAwarePaginator $paginatedResults */
        $paginatedResults = $orderModel
            ->latest('created_at')
            ->paginate(
                perPage: $pageSize,
                page: $current
            );

        $paginatedResults->getCollection()->transform(function ($order) {
            $orderArray = $order->toArray();
            $orderArray['period'] = PlanService::getLegacyPeriod((string) $order->period);
            return $orderArray;
        });

        return $this->paginate($paginatedResults);
    }

    private function applyFiltersAndSorts(Request $request, Builder $builder): void
    {
        \App\Support\AdminListQuery::validate($request, 'id invite_user_id user_id plan_id coupon_id payment_id type period trade_no callback_no total_amount handling_amount discount_amount surplus_amount surplus_credit refund_amount balance_amount status commission_status commission_balance actual_commission_balance paid_at created_at updated_at');
        $this->applyFilters($request, $builder);
        $this->applySorting($request, $builder);
    }

    private function applyFilters(Request $request, Builder $builder): void
    {
        if (!$request->has('filter')) {
            return;
        }

        collect($request->input('filter'))->each(function ($filter) use ($builder) {
            $field = $filter['id'] === 'refund_amount' ? 'surplus_credit' : $filter['id'];
            $value = $filter['value'];

            $builder->where(function ($query) use ($field, $value) {
                $this->buildFilterQuery($query, $field, $value);
            });
        });
    }

    private function buildFilterQuery(Builder $query, string $field, mixed $value): void
    {
        $isNumber = !in_array($field, ['trade_no', 'callback_no', 'period'], true);
        if (is_array($value)) {
            if ($isNumber) {
                $integers = array_map(static function ($item): int {
                    if (!is_int($item) && !is_string($item)) {
                        throw ValidationException::withMessages(['filter' => 'Expected an integer value.']);
                    }
                    $text = (string) $item;
                    if (!preg_match('/^([+-]?)([0-9]+)$/D', $text, $parts)) {
                        throw ValidationException::withMessages(['filter' => 'Expected an integer value.']);
                    }
                    $number = filter_var($parts[1].(ltrim($parts[2], '0') ?: '0'), FILTER_VALIDATE_INT);
                    if ($number === false) {
                        throw ValidationException::withMessages(['filter' => 'Integer is out of range.']);
                    }
                    return $number;
                }, $value);
                $query->whereIntegerInRaw($field, $integers);
            } else {
                $query->whereIn($field, $value);
            }
            return;
        }

        // Handle operator-based filtering
        if (!is_string($value) || !str_contains($value, ':')) {
            $query->where($field, 'like', "%{$value}%");
            return;
        }

        [$operator, $filterValue] = explode(':', $value, 2);
        if (strtolower($operator) === 'null') {
            $query->whereNull($field);
            return;
        }
        if (strtolower($operator) === 'notnull') {
            $query->whereNotNull($field);
            return;
        }

        $operator = strtolower($operator);
        $comparison = match ($operator) {
            'eq' => '=', 'gt' => '>', 'gte' => '>=', 'lt' => '<', 'lte' => '<=',
            'notlike' => 'not like', default => 'like',
        };
        if ($isNumber && !str_contains($comparison, 'like')) {
            if (strlen($filterValue) > 65 || !preg_match('/^[+-]?[0-9]+(?:\.[0-9]+)?$/D', $filterValue)) {
                throw ValidationException::withMessages(['filter' => 'Expected a numeric comparison value.']);
            }
            // PostgreSQL infers the column's integer type for a bare parameter. A
            // fractional or wide threshold is valid even if no row can equal it.
            if ($query->getConnection()->getDriverName() === 'pgsql' && !preg_match('/^[+-]?[0-9]{1,9}$/D', $filterValue)) {
                $column = $query->getQuery()->getGrammar()->wrap($field);
                $query->whereRaw("$column $comparison CAST(? AS NUMERIC)", [$filterValue]);
                return;
            }
        }
        $query->where($field, $comparison, in_array($operator, ['like', 'notlike'], true) ? "%{$filterValue}%" : $filterValue);
    }

    private function applySorting(Request $request, Builder $builder): void
    {
        if (!$request->has('sort')) {
            return;
        }

        collect($request->input('sort'))->each(function ($sort) use ($builder) {
            $field = $sort['id'] === 'refund_amount' ? 'surplus_credit' : $sort['id'];
            $direction = filter_var($sort['desc'], FILTER_VALIDATE_BOOLEAN) ? 'DESC' : 'ASC';
            $builder->orderBy($field, $direction);
        });
    }

    public function paid(Request $request)
    {
        $order = Order::where('trade_no', $request->input('trade_no'))
            ->first();
        if (!$order) {
            return $this->fail([400202, '订单不存在']);
        }
        if ($order->status !== 0)
            return $this->fail([400, '只能对待支付的订单进行操作']);

        $orderService = new OrderService($order);
        if (!$orderService->paid('manual_operation')) {
            return $this->fail([500, '更新失败']);
        }
        return $this->success(true);
    }

    public function cancel(Request $request)
    {
        $order = Order::where('trade_no', $request->input('trade_no'))
            ->first();
        if (!$order) {
            return $this->fail([400202, '订单不存在']);
        }
        if ($order->status !== 0)
            return $this->fail([400, '只能对待支付的订单进行操作']);

        $orderService = new OrderService($order);
        if (!$orderService->cancel()) {
            return $this->fail([400, '更新失败']);
        }
        return $this->success(true);
    }

    public function update(OrderUpdate $request)
    {
        $params = $request->only([
            'commission_status'
        ]);

        try {
            return DB::transaction(function () use ($request, $params) {
                $order = Order::where('trade_no', $request->input('trade_no'))->lockForUpdate()->first();
                if (!$order) {
                    return $this->fail([400202, '订单不存在']);
                }
                if ($params && (int) $order->commission_status === 2) {
                    return $this->fail([409, '佣金已发放，无法修改审批状态']);
                }
                if ((int) ($params['commission_status'] ?? 0) === 1
                    && !in_array((int) $order->status, Order::COMMISSION_ELIGIBLE_STATUSES, true)) {
                    return $this->fail([409, '仅已完成或已折抵的订单可批准佣金']);
                }
                if (!$order->update($params)) {
                    return $this->fail([500, '更新失败']);
                }
                return $this->success(true);
            });
        } catch (\Exception $e) {
            Log::error($e);
            return $this->fail([500, '更新失败']);
        }
    }

    public function assign(OrderAssign $request)
    {
        $plan = Plan::find($request->input('plan_id'));
        $user = User::byEmail($request->input('email'))->first();

        if (!$user) {
            return $this->fail([400202, '该用户不存在']);
        }

        if (!$plan) {
            return $this->fail([400202, '该订阅不存在']);
        }

        return DB::transaction(function () use ($request, $plan, $user) {
            $plan = PlanService::lockForSale($plan);
            $user = User::lockForUpdate()->findOrFail($user->id);
            if (app(UserService::class)->isNotCompleteOrderByUserId($user->id)) {
                return $this->fail([400, '该用户还有待支付的订单，无法分配']);
            }
            $order = new Order();
            $orderService = new OrderService($order);
            $order->user_id = $user->id;
            $order->plan_id = $plan->id;
            $period = $request->input('period');
            $order->period = PlanService::getPeriodKey((string) $period);
            (new PlanService($plan))->validateSeat($user, $order->period);
            $order->trade_no = Helper::guid();
            $order->total_amount = $request->input('total_amount');

            $hasActivePlan = $user->plan_id !== null && ($user->expired_at === null || $user->expired_at > time());
            if ($order->period === Plan::PERIOD_RESET_TRAFFIC) {
                $order->type = Order::TYPE_RESET_TRAFFIC;
            } else if ($hasActivePlan && $order->plan_id != $user->plan_id) {
                $order->type = Order::TYPE_UPGRADE;
            } else if ($hasActivePlan) {
                $order->type = Order::TYPE_RENEWAL;
            } else {
                $order->type = Order::TYPE_NEW_PURCHASE;
            }

            $orderService->setInvite($user);

            if (!$order->save()) {
                return $this->fail([500, '订单创建失败']);
            }
            return $this->success($order->trade_no);
        }, 3);
    }
}
