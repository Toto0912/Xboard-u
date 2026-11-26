<?php

namespace App\Http\Controllers\V1\User;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Resources\ComissionLogResource;
use App\Http\Resources\InviteCodeResource;
use App\Models\CommissionLog;
use App\Models\InviteCode;
use App\Models\Order;
use App\Models\User;
use App\Utils\Helper;
use Illuminate\Http\Request;

class InviteController extends Controller
{
    public function save(Request $request)
    {
        if (InviteCode::where('user_id', $request->user()->id)->where('status', 0)->count() >= admin_setting('invite_gen_limit', 5)) {
            return $this->fail([400,__('The maximum number of creations has been reached')]);
        }
        $inviteCode = new InviteCode();
        $inviteCode->user_id = $request->user()->id;
        $inviteCode->code = Helper::randomChar(8);
        return $this->success($inviteCode->save());
    }

    public function details(Request $request)
    {
        $current = $request->input('current') ? $request->input('current') : 1;
        $pageSize = $request->input('page_size') >= 10 ? $request->input('page_size') : 10;
        $builder = CommissionLog::where('invite_user_id', $request->user()->id)
            ->where('get_amount', '>', 0)
            ->orderBy('created_at', 'DESC');
        $total = $builder->count();
        $details = $builder->forPage($current, $pageSize)
            ->get();
        return response([
            'data' => ComissionLogResource::collection($details),
            'total' => $total
        ]);
    }

    public function fetch(Request $request)
    {
        $user = User::findOrFail($request->user()->id)
            ->load(['codes' => fn ($query) => $query->where('status', 0)]);
        $firstLevel = admin_setting('commission_distribution_enable', 0)
            ? (int) admin_setting('commission_distribution_l1') : 100;
        $pendingCommission = Order::whereIn('status', Order::COMMISSION_ELIGIBLE_STATUSES)
            ->where('commission_status', 0)
            ->where('invite_user_id', $user->id)
            // Settlement rounds each order's cumulative first-level share to whole cents.
            ->selectRaw('SUM(ROUND(1.0 * commission_balance * ? / 100)) AS pending', [$firstLevel])
            ->value('pending');
        $stat = [
            //已注册用户数
            (int)User::where('invite_user_id', $user->id)->count(),
            //有效的佣金
            (int)CommissionLog::where('invite_user_id', $user->id)
                ->sum('get_amount'),
            //确认中的佣金
            (int) $pendingCommission,
            //佣金比例
            $user->effectiveCommissionRate(),
            //可用佣金
            (int)$user->commission_balance
        ];
        $data = [
            'codes' => InviteCodeResource::collection($user->codes),
            'stat' => $stat
        ];
        return $this->success($data);
    }
}
