import { adminApiRequest } from '@/lib/api';

export type PlanPeriodKey =
  | 'monthly'
  | 'quarterly'
  | 'half_yearly'
  | 'yearly'
  | 'two_yearly'
  | 'three_yearly'
  | 'onetime'
  | 'reset_traffic';

export const PLAN_PERIOD_KEYS: PlanPeriodKey[] = [
  'monthly',
  'quarterly',
  'half_yearly',
  'yearly',
  'two_yearly',
  'three_yearly',
  'onetime',
  'reset_traffic',
];

export const LEGACY_PERIOD_MAP: Record<string, string> = {
  monthly: 'month_price',
  quarterly: 'quarter_price',
  half_yearly: 'half_year_price',
  yearly: 'year_price',
  two_yearly: 'two_year_price',
  three_yearly: 'three_year_price',
  onetime: 'onetime_price',
  reset_traffic: 'reset_price',
};

export const LEGACY_PERIOD_KEYS = [
  'month_price',
  'quarter_price',
  'half_year_price',
  'year_price',
  'two_year_price',
  'three_year_price',
  'onetime_price',
  'reset_price',
] as const;

export interface PlanRecord {
  id: number;
  group_id: number | null;
  group?: { id: number; name: string } | null;
  transfer_enable: number; // GB
  name: string;
  speed_limit: number | null;
  device_limit: number | null;
  capacity_limit: number | null;
  show: boolean | number;
  sell: boolean | number;
  renew: boolean | number;
  sort: number | null;
  content: string | null;
  prices: Partial<Record<PlanPeriodKey, number | null>> | null;
  reset_traffic_method: number | null;
  tags?: string[] | null;
  users_count?: number;
  active_users_count?: number;
  created_at?: number;
  updated_at?: number;
}

export async function fetchPlans(): Promise<PlanRecord[]> {
  const res = await adminApiRequest<PlanRecord[]>('/plan/fetch');
  return res.data || [];
}

export async function savePlan(payload: {
  id?: number;
  name: string;
  content?: string | null;
  reset_traffic_method?: number | null;
  transfer_enable: number;
  prices: Partial<Record<PlanPeriodKey, number | null>>;
  group_id?: number | null;
  speed_limit?: number | null;
  device_limit?: number | null;
  capacity_limit?: number | null;
  tags?: string[] | null;
  force_update?: boolean;
}): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/plan/save', {
    method: 'POST',
    body: payload,
  });
  return Boolean(res.data);
}

export async function updatePlanFlags(payload: {
  id: number;
  show?: boolean | number;
  sell?: boolean | number;
  renew?: boolean | number;
}): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/plan/update', {
    method: 'POST',
    body: payload,
  });
  return Boolean(res.data);
}

export async function dropPlan(id: number): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/plan/drop', {
    method: 'POST',
    body: { id },
  });
  return Boolean(res.data);
}

export async function sortPlans(ids: number[]): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/plan/sort', {
    method: 'POST',
    body: { ids },
  });
  return Boolean(res.data);
}
