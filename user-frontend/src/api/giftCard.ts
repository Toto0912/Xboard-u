import { apiRequest } from '@/lib/api';

export interface GiftCardCheckResponse {
  code_info: {
    code: string;
    template_name?: string;
    template_type?: string;
    plan_info?: { name: string } | null;
  };
  reward_preview: Record<string, unknown>;
  can_redeem: boolean;
  reason?: string | null;
}

export interface GiftCardHistoryItem {
  id: number;
  code: string;
  template_name: string;
  template_type: string;
  template_type_name: string;
  rewards_given: Record<string, unknown>;
  created_at: number;
}

export async function checkGiftCard(code: string): Promise<GiftCardCheckResponse> {
  const res = await apiRequest<GiftCardCheckResponse>('/user/gift-card/check', {
    method: 'POST',
    body: { code },
  });
  return res.data;
}

export async function redeemGiftCard(code: string): Promise<{ message: string }> {
  const res = await apiRequest<{ message: string }>('/user/gift-card/redeem', {
    method: 'POST',
    body: { code },
  });
  return res.data;
}

export async function fetchGiftCardHistory(page = 1, per_page = 10): Promise<{
  data: GiftCardHistoryItem[];
  total: number;
}> {
  const res = await apiRequest<GiftCardHistoryItem[]>('/user/gift-card/history', {
    params: { page, per_page },
  });
  return {
    data: res.data ?? [],
    total: res.pagination?.total ?? 0,
  };
}
