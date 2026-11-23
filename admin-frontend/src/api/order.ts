import { adminApiRequest } from '@/lib/api';

export interface OrderFilter {
  id: string;
  value: string | string[] | number | number[];
}

export interface OrderSort {
  id: string;
  desc: boolean;
}

export interface OrderRecord {
  id: number;
  user_id: number;
  plan_id: number;
  plan?: { id: number; name: string } | null;
  period: string;
  trade_no: string;
  total_amount: number; // cents
  handling_amount?: number | null;
  balance_amount?: number | null;
  discount_amount?: number | null;
  surplus_amount?: number | null;
  type: number; // 1=new, 2=renewal, 3=upgrade, 4=reset
  status: number; // 0=pending, 1=processing, 2=cancelled, 3=completed, 4=discounted
  commission_status: number; // 0=pending, 1=processing, 2=valid, 3=invalid
  commission_balance?: number | null; // cents
  invite_user_id?: number | null;
  paid_at?: number | null;
  callback_no?: string | null;
  created_at: number;
  updated_at: number;
  user?: { id: number; email: string } | null;
  invite_user?: { id: number; email: string } | null;
}

export async function fetchOrders(params: {
  current: number;
  pageSize: number;
  is_commission?: boolean;
  filter?: OrderFilter[];
  sort?: OrderSort[];
}): Promise<{ data: OrderRecord[]; total: number }> {
  const res = await adminApiRequest<OrderRecord[]>('/order/fetch', {
    method: 'POST',
    body: params,
  });
  return {
    data: res.data || [],
    total: res.total ?? 0,
  };
}

export async function getOrderDetail(id: number): Promise<OrderRecord> {
  const res = await adminApiRequest<OrderRecord>('/order/detail', {
    method: 'POST',
    body: { id },
  });
  return res.data;
}

export async function assignOrder(payload: {
  email: string;
  plan_id: number;
  period: string;
  total_amount: number; // cents
}): Promise<string> {
  const res = await adminApiRequest<string>('/order/assign', {
    method: 'POST',
    body: payload,
  });
  return res.data;
}

export async function markOrderPaid(trade_no: string): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/order/paid', {
    method: 'POST',
    body: { trade_no },
  });
  return Boolean(res.data);
}

export async function cancelOrder(trade_no: string): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/order/cancel', {
    method: 'POST',
    body: { trade_no },
  });
  return Boolean(res.data);
}

export async function updateOrderCommission(payload: {
  trade_no: string;
  commission_status: number;
}): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/order/update', {
    method: 'POST',
    body: payload,
  });
  return Boolean(res.data);
}
