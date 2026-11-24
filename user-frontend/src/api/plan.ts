import { apiRequest } from '@/lib/api';

export type PlanPeriodKey =
  | 'month_price'
  | 'quarter_price'
  | 'half_year_price'
  | 'year_price'
  | 'two_year_price'
  | 'three_year_price'
  | 'onetime_price'
  | 'reset_price';

export const PLAN_PERIOD_KEYS: PlanPeriodKey[] = [
  'month_price',
  'quarter_price',
  'half_year_price',
  'year_price',
  'two_year_price',
  'three_year_price',
  'onetime_price',
  'reset_price',
];

export interface PlanItem {
  id: number;
  group_id?: number | null;
  name: string;
  tags?: string[] | null;
  content?: string | null;
  month_price?: number | null;
  quarter_price?: number | null;
  half_year_price?: number | null;
  year_price?: number | null;
  two_year_price?: number | null;
  three_year_price?: number | null;
  onetime_price?: number | null;
  reset_price?: number | null;
  capacity_limit?: number | string | null;
  transfer_enable: number;
  speed_limit?: number | null;
  device_limit?: number | null;
  show: boolean;
  sell: boolean;
  renew: boolean;
  reset_traffic_method?: number | null;
}

export interface CouponCheckResult {
  id: number;
  code: string;
  name?: string;
  type: 1 | 2; // 1 = fixed fen, 2 = percentage
  value: number;
  limit_plan_ids?: string[] | null;
  limit_period?: string[] | null;
}

export async function fetchPlans(): Promise<PlanItem[]> {
  const res = await apiRequest<PlanItem[]>('/user/plan/fetch');
  return res.data ?? [];
}

export async function fetchPlanById(id: number | string): Promise<PlanItem> {
  const res = await apiRequest<PlanItem>('/user/plan/fetch', {
    params: { id },
  });
  return res.data;
}

export async function checkCoupon(payload: {
  code: string;
  plan_id: number;
  period: string;
}): Promise<CouponCheckResult> {
  const res = await apiRequest<CouponCheckResult>('/user/coupon/check', {
    method: 'POST',
    body: payload,
  });
  return res.data;
}
