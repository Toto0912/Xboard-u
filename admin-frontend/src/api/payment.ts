import type { DynamicFieldSchema } from '@/components/shared/DynamicConfigFields';
import { adminApiRequest } from '@/lib/api';

export interface PaymentRecord {
  id: number;
  uuid: string;
  name: string;
  payment: string;
  icon: string | null;
  notify_domain: string | null;
  notify_url: string;
  handling_fee_fixed: number | null;
  handling_fee_percent: number | null;
  config: Record<string, unknown>;
  enable: boolean | number;
  sort: number | null;
}

export async function fetchPayments(): Promise<PaymentRecord[]> {
  const res = await adminApiRequest<PaymentRecord[]>('/payment/fetch');
  return res.data || [];
}

export async function getPaymentMethods(): Promise<string[]> {
  const res = await adminApiRequest<string[]>('/payment/getPaymentMethods');
  return res.data || [];
}

export async function getPaymentForm(
  payment: string,
  id?: number,
): Promise<Record<string, DynamicFieldSchema>> {
  const res = await adminApiRequest<Record<string, DynamicFieldSchema>>(
    '/payment/getPaymentForm',
    {
      method: 'POST',
      body: id ? { payment, id } : { payment },
    },
  );
  return res.data || {};
}

export async function savePayment(payload: {
  id?: number;
  name: string;
  payment: string;
  icon?: string | null;
  notify_domain?: string | null;
  handling_fee_fixed?: number | null;
  handling_fee_percent?: number | null;
  config: Record<string, unknown>;
}): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/payment/save', {
    method: 'POST',
    body: payload,
  });
  return res.data;
}

export async function togglePayment(id: number): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/payment/show', {
    method: 'POST',
    body: { id },
  });
  return res.data;
}

export async function dropPayment(id: number): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/payment/drop', {
    method: 'POST',
    body: { id },
  });
  return res.data;
}

export async function sortPayments(ids: number[]): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/payment/sort', {
    method: 'POST',
    body: { ids },
  });
  return res.data;
}
