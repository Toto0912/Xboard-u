import { apiRequest } from '@/lib/api';

export interface InviteCodeItem {
  user_id?: number;
  code: string;
  pv: number;
  status: number;
  created_at: number;
  updated_at: number;
}

export interface InviteInfoResponse {
  codes: InviteCodeItem[];
  stat: [number, number, number, number, number];
}

export interface CommissionRecordItem {
  id: number;
  order_amount: number;
  trade_no: string;
  get_amount: number;
  created_at: number;
}

export async function fetchInviteInfo(): Promise<InviteInfoResponse> {
  const res = await apiRequest<InviteInfoResponse>('/user/invite/fetch');
  return res.data;
}

export async function createInviteCode(): Promise<boolean> {
  const res = await apiRequest<boolean>('/user/invite/save');
  return Boolean(res.data);
}

export async function fetchInviteDetails(
  current = 1,
  page_size = 10,
): Promise<{ data: CommissionRecordItem[]; total: number }> {
  const res = await apiRequest<CommissionRecordItem[]>('/user/invite/details', {
    params: { current, page_size },
  });
  return {
    data: res.data ?? [],
    total: res.total ?? 0,
  };
}
