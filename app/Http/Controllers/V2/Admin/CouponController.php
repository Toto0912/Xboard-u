<?php

namespace App\Http\Controllers\V2\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\CouponGenerate;
use App\Http\Requests\Admin\CouponSave;
use App\Models\Coupon;
use App\Utils\Helper;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CouponController extends Controller
{
    private function applyFiltersAndSorts(Request $request, $builder)
    {
        \App\Support\AdminListQuery::validate($request, 'id name code type value limit_use limit_use_with_user started_at ended_at created_at updated_at');
        if ($request->has('filter')) {
            collect($request->input('filter'))->each(function ($filter) use ($builder) {
                $key = $filter['id'];
                $value = $filter['value'];
                $builder->where(function ($query) use ($key, $value) {
                    if (is_array($value)) {
                        $query->whereIn($key, $value);
                    } else {
                        $query->where($key, 'like', "%{$value}%");
                    }
                });
            });
        }

        if ($request->has('sort')) {
            collect($request->input('sort'))->each(function ($sort) use ($builder) {
                $key = $sort['id'];
                $value = filter_var($sort['desc'], FILTER_VALIDATE_BOOLEAN) ? 'DESC' : 'ASC';
                $builder->orderBy($key, $value);
            });
        }
    }
    public function fetch(Request $request)
    {
        $current = $request->input('current', 1);
        $pageSize = $request->input('pageSize', 10);
        $builder = Coupon::query();
        $this->applyFiltersAndSorts($request, $builder);
        $coupons = $builder
            ->orderBy('created_at', 'desc')
            ->paginate($pageSize, ["*"], 'page', $current);
        return $this->paginate($coupons);
    }

    public function update(Request $request)
    {
        $params = $request->validate([
            'id' => 'required|numeric',
            'show' => 'nullable|boolean'
        ], [
            'id.required' => '优惠券ID不能为空',
            'id.numeric' => '优惠券ID必须为数字'
        ]);
        try {
            $coupon = Coupon::find($request->input('id'));
            if (!$coupon) {
                return $this->fail([400201, '优惠券不存在']);
            }
            $coupon->update($params);
            return $this->success(true);
        } catch (\Exception $e) {
            \Log::error($e);
            return $this->fail([500, '保存失败']);
        }
    }

    public function show(Request $request)
    {
        $request->validate([
            'id' => 'required|numeric'
        ], [
            'id.required' => '优惠券ID不能为空',
            'id.numeric' => '优惠券ID必须为数字'
        ]);
        $coupon = Coupon::find($request->input('id'));
        if (!$coupon) {
            return $this->fail([400202, '优惠券不存在']);
        }
        $coupon->show = !$coupon->show;
        if (!$coupon->save()) {
            return $this->fail([500, '保存失败']);
        }
        return $this->success(true);
    }

    public function generate(CouponGenerate $request)
    {
        if ($request->input('generate_count')) {
            return $this->multiGenerate($request);
        }

        $params = $request->validated();
        if (!$request->input('id')) {
            if (!isset($params['code'])) {
                $params['code'] = Helper::randomChar(8);
            }
            if (!Coupon::create($params)) {
                return $this->fail([500, '创建失败']);
            }
        } else {
            try {
                Coupon::find($request->input('id'))->update($params);
            } catch (\Exception $e) {
                \Log::error($e);
                return $this->fail([500, '保存失败']);
            }
        }

        return $this->success(true);
    }

    private function multiGenerate(CouponGenerate $request)
    {
        $coupons = [];
        $coupon = $request->validated();
        $coupon['created_at'] = $coupon['updated_at'] = time();
        $coupon['show'] = 1;
        unset($coupon['generate_count']);
        for ($i = 0; $i < $request->input('generate_count'); $i++) {
            $coupon['code'] = Helper::randomChar(8);
            array_push($coupons, $coupon);
        }
        try {
            DB::transaction(function () use ($coupons) {
                foreach (array_chunk($coupons, 50) as $chunk) {
                    Coupon::insert(array_map(function ($item) {
                        foreach (['limit_plan_ids', 'limit_period'] as $key) {
                            if (isset($item[$key])) {
                                $item[$key] = json_encode($item[$key], JSON_THROW_ON_ERROR);
                            }
                        }
                        return $item;
                    }, $chunk));
                }
            });
        } catch (\Exception $e) {
            return $this->fail([500, '生成失败']);
        }

        return response()->streamDownload(function () use ($coupons) {
            $stream = fopen('php://output', 'w');
            fputcsv($stream, ['名称', '类型', '金额或比例', '开始时间', '结束时间', '可用次数', '可用于订阅', '券码', '生成时间'], ',', '"', '', "\r\n");
            foreach ($coupons as $coupon) {
                fputcsv($stream, [
                    $coupon['name'], $coupon['type'] == 1 ? '金额' : '比例',
                    $coupon['type'] == 1 ? $coupon['value'] / 100 : $coupon['value'],
                    date('Y-m-d H:i:s', $coupon['started_at']), date('Y-m-d H:i:s', $coupon['ended_at']),
                    $coupon['limit_use'] ?? '不限制', isset($coupon['limit_plan_ids']) ? implode('/', $coupon['limit_plan_ids']) : '不限制',
                    $coupon['code'], date('Y-m-d H:i:s', $coupon['created_at']),
                ], ',', '"', '', "\r\n");
            }
            fclose($stream);
        }, 'coupons.csv', ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    public function drop(Request $request)
    {
        $request->validate([
            'id' => 'required|numeric'
        ], [
            'id.required' => '优惠券ID不能为空',
            'id.numeric' => '优惠券ID必须为数字'
        ]);
        $coupon = Coupon::find($request->input('id'));
        if (!$coupon) {
            return $this->fail([400202, '优惠券不存在']);
        }
        if (!$coupon->delete()) {
            return $this->fail([500, '删除失败']);
        }

        return $this->success(true);
    }
}
