import { adminApiDownload, adminApiRequest } from '@/lib/api';

export interface CouponRecord {
  id: number;
  code: string;
  name: string;
  type: 1 | 2; // 1=amount(cents), 2=percent
  value: number;
  show: boolean | number;
  limit_use: number | null;
  limit_use_with_user: number | null;
  limit_plan_ids?: number[] | null;
  limit_period?: string[] | null;
  started_at: number;
  ended_at: number;
  created_at: number;
  updated_at: number;
}

export async function fetchCoupons(params: {
  current: number;
  pageSize: number;
  filter?: Array<{ id: string; value: unknown }>;
  sort?: Array<{ id: string; desc: boolean }>;
}): Promise<{ data: CouponRecord[]; total: number }> {
  const res = await adminApiRequest<CouponRecord[]>('/coupon/fetch', {
    method: 'POST',
    body: params,
  });
  return {
    data: res.data || [],
    total: res.total ?? 0,
  };
}

export async function saveCoupon(payload: {
  id?: number;
  name: string;
  type: 1 | 2;
  value: number;
  started_at: number;
  ended_at: number;
  limit_use?: number | null;
  limit_use_with_user?: number | null;
  limit_plan_ids?: number[] | null;
  limit_period?: string[] | null;
  code?: string;
}): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/coupon/generate', {
    method: 'POST',
    body: payload,
  });
  return Boolean(res.data);
}

export async function batchGenerateCouponsCsv(payload: {
  generate_count: number;
  name: string;
  type: 1 | 2;
  value: number;
  started_at: number;
  ended_at: number;
  limit_use?: number | null;
  limit_use_with_user?: number | null;
  limit_plan_ids?: number[] | null;
  limit_period?: string[] | null;
}): Promise<void> {
  await adminApiDownload('/coupon/generate', {
    method: 'POST',
    body: payload,
    fallbackFilename: 'coupons.csv',
  });
}

export async function toggleCouponShow(id: number): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/coupon/show', {
    method: 'POST',
    body: { id },
  });
  return Boolean(res.data);
}

export async function dropCoupon(id: number): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/coupon/drop', {
    method: 'POST',
    body: { id },
  });
  return Boolean(res.data);
}
