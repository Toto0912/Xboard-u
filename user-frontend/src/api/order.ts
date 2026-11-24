import { apiRequest, rawApiRequest } from '@/lib/api';
import type { PlanItem } from '@/api/plan';

export interface OrderItem {
  id: number;
  trade_no: string;
  plan_id: number;
  period: string;
  total_amount: number;
  handling_amount?: number | null;
  balance_amount?: number | null;
  discount_amount?: number | null;
  surplus_amount?: number | null;
  status: number; // 0: pending, 1: opening, 2: cancelled, 3: completed, 4: credited
  type?: number;
  created_at: number;
  updated_at: number;
  plan?: PlanItem | null;
  payment?: {
    id: number;
    name: string;
    payment: string;
    icon?: string | null;
  } | null;
}

export interface PaymentMethodItem {
  id: number;
  name: string;
  payment: string;
  icon?: string | null;
  handling_fee_fixed?: number | null;
  handling_fee_percent?: number | null;
}

export interface CheckoutResponse {
  type: number; // -1: free/instant, 0: qrcode url, 1: redirect url
  data: unknown;
}

export async function fetchOrders(): Promise<OrderItem[]> {
  const res = await apiRequest<OrderItem[]>('/user/order/fetch');
  return res.data ?? [];
}

export async function fetchOrderDetail(trade_no: string): Promise<OrderItem> {
  const res = await apiRequest<OrderItem>('/user/order/detail', {
    params: { trade_no },
  });
  return res.data;
}

export async function saveOrder(payload: {
  plan_id: number;
  period: string;
  coupon_code?: string;
}): Promise<string> {
  const res = await apiRequest<string>('/user/order/save', {
    method: 'POST',
    body: payload,
  });
  return res.data;
}

export async function fetchPaymentMethods(): Promise<PaymentMethodItem[]> {
  const res = await apiRequest<PaymentMethodItem[]>('/user/order/getPaymentMethod');
  return res.data ?? [];
}

export async function checkoutOrder(payload: {
  trade_no: string;
  method?: number;
  token?: string;
}): Promise<CheckoutResponse> {
  return rawApiRequest<CheckoutResponse>('/user/order/checkout', {
    method: 'POST',
    body: payload,
  });
}

export async function checkOrderStatus(trade_no: string): Promise<number> {
  const res = await apiRequest<number>('/user/order/check', {
    params: { trade_no },
    silentError: true,
  });
  return res.data;
}

export async function cancelOrder(trade_no: string): Promise<boolean> {
  const res = await apiRequest<boolean>('/user/order/cancel', {
    method: 'POST',
    body: { trade_no },
  });
  return Boolean(res.data);
}
