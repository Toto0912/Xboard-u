<?php

namespace App\Http\Controllers\V2\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\PlanSave;
use App\Models\Order;
use App\Models\Plan;
use App\Models\User;
use App\Services\NodeSyncService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class PlanController extends Controller
{
    public function fetch(Request $request)
    {
        $plans = Plan::orderBy('sort', 'ASC')
            ->with([
                'group:id,name'
            ])
            ->withCount([
                'users',
                'users as active_users_count' => function ($query) {
                    $query->where(function ($q) {
                        $q->where('expired_at', '>', time())
                          ->orWhereNull('expired_at');
                    });
                }
            ])
            ->get();

        return $this->success($plans);
    }

    public function save(PlanSave $request)
    {
        $params = $request->validated();
        
        if ($request->input('id')) {
            try {
                return DB::transaction(function () use ($request, $params) {
                    $plan = Plan::query()->lockForUpdate()->find($params['id']);
                    if (!$plan) {
                        return $this->fail([400202, '该订阅不存在']);
                    }
                    $plan->fill($params);
                    if ($request->boolean('force_update')) {
                        $this->updatePlanUsers($plan);
                    }
                    $plan->save();
                    return $this->success(true);
                }, 3);
            } catch (\Exception $e) {
                Log::error($e);
                return $this->fail([500, '保存失败']);
            }
        }
        if (!Plan::create($params)) {
            return $this->fail([500, '创建失败']);
        }
        return $this->success(true);
    }

    private function updatePlanUsers(Plan $plan): void
    {
        $updates = [
            'group_id' => $plan->group_id,
            'transfer_enable' => $plan->transfer_enable * 1073741824,
            'speed_limit' => $plan->speed_limit,
            'device_limit' => $plan->device_limit,
        ];
        $groups = [];
        User::where('plan_id', $plan->id)->select('id', 'group_id')->lockForUpdate()
            ->chunkById(500, function ($users) use ($updates, &$groups) {
                foreach ($users as $user) {
                    $groups[(int) $user->group_id] = true;
                }
                $groups[(int) $updates['group_id']] = true;
                User::whereIntegerInRaw('id', $users->modelKeys())->update($updates);
            });
        unset($groups[0]);
        if ($groups) {
            DB::afterCommit(fn () => NodeSyncService::queueRosterRefreshes(array_keys($groups)));
        }
    }

    public function drop(Request $request)
    {
        if (Order::where('plan_id', $request->input('id'))->first()) {
            return $this->fail([400201, '该订阅下存在订单无法删除']);
        }
        if (User::where('plan_id', $request->input('id'))->first()) {
            return $this->fail([400201, '该订阅下存在用户无法删除']);
        }
        
        $plan = Plan::find($request->input('id'));
        if (!$plan) {
            return $this->fail([400202, '该订阅不存在']);
        }
        
        return $this->success($plan->delete());
    }

    public function update(Request $request)
    {
        $updateData = $request->only([
            'show',
            'renew',
            'sell'
        ]);

        $plan = Plan::find($request->input('id'));
        if (!$plan) {
            return $this->fail([400202, '该订阅不存在']);
        }

        try {
            $plan->update($updateData);
        } catch (\Exception $e) {
            Log::error($e);
            return $this->fail([500, '保存失败']);
        }

        return $this->success(true);
    }

    public function sort(Request $request)
    {
        $params = $request->validate([
            'ids' => 'required|array'
        ]);

        try {
            DB::beginTransaction();
            foreach ($params['ids'] as $k => $v) {
                if (!Plan::find($v)->update(['sort' => $k + 1])) {
                    throw new \Exception();
                }
            }
            DB::commit();
        } catch (\Exception $e) {
            DB::rollBack();
            Log::error($e);
            return $this->fail([500, '保存失败']);
        }
        return $this->success(true);
    }
}
