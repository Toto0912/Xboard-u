import { adminApiDownload, adminApiRequest } from '@/lib/api';

export interface GiftCardTemplateItem {
  id: number;
  name: string;
  description: string | null;
  type: 1 | 2 | 3; // 1=general, 2=plan, 3=mystery
  type_name?: string;
  status: boolean;
  conditions?: Record<string, unknown> | null;
  rewards: Record<string, unknown>;
  limits?: Record<string, unknown> | null;
  special_config?: Record<string, unknown> | null;
  icon?: string | null;
  background_image?: string | null;
  theme_color?: string | null;
  sort: number;
  codes_count?: number;
  used_count?: number;
  created_at: number;
  updated_at: number;
}

export interface GiftCardCodeItem {
  id: number;
  template_id: number;
  template?: { id: number; name: string } | null;
  template_name?: string;
  code: string;
  batch_id: string;
  status: 0 | 1 | 2 | 3; // 0=unused, 1=used, 2=expired, 3=disabled
  status_name?: string;
  user_id?: number | null;
  used_at?: number | null;
  expires_at?: number | null;
  usage_count: number;
  max_usage: number;
  created_at: number;
}

export interface GiftCardUsageItem {
  id: number;
  code?: { code: string } | string | null;
  template?: { name: string } | null;
  template_name?: string;
  user?: { email: string } | null;
  user_email?: string;
  rewards_given?: Record<string, unknown> | null;
  multiplier_applied?: number | null;
  created_at: number;
}

export interface GiftCardStatistics {
  total_stats: {
    templates_count: number;
    active_templates_count: number;
    codes_count: number;
    used_codes_count: number;
    usages_count: number;
  };
  daily_usages: Array<{ date: string; count: number }>;
  type_stats: Array<{ template_name: string; type_name: string; count: number }>;
}

export async function getGiftCardTypes(): Promise<Record<string, string>> {
  const res = await adminApiRequest<Record<string, string>>('/gift-card/types');
  return res.data || {};
}

export async function fetchGiftCardTemplates(params: {
  page: number;
  per_page: number;
  type?: number;
  status?: number;
}): Promise<{ data: GiftCardTemplateItem[]; total: number }> {
  const res = await adminApiRequest<GiftCardTemplateItem[]>('/gift-card/templates', {
    params,
  });
  return {
    data: res.data || [],
    total: res.total ?? 0,
  };
}

export async function createGiftCardTemplate(
  payload: Record<string, unknown>,
): Promise<GiftCardTemplateItem> {
  const res = await adminApiRequest<GiftCardTemplateItem>('/gift-card/create-template', {
    method: 'POST',
    body: payload,
  });
  return res.data;
}

export async function updateGiftCardTemplate(
  payload: Record<string, unknown>,
): Promise<GiftCardTemplateItem> {
  const res = await adminApiRequest<GiftCardTemplateItem>('/gift-card/update-template', {
    method: 'POST',
    body: payload,
  });
  return res.data;
}

export async function deleteGiftCardTemplate(id: number): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/gift-card/delete-template', {
    method: 'POST',
    body: { id },
  });
  return Boolean(res.data);
}

export async function fetchGiftCardCodes(params: {
  page: number;
  per_page: number;
  template_id?: number;
  batch_id?: string;
  status?: number;
}): Promise<{ data: GiftCardCodeItem[]; total: number }> {
  const res = await adminApiRequest<GiftCardCodeItem[]>('/gift-card/codes', {
    params,
  });
  return {
    data: res.data || [],
    total: res.total ?? 0,
  };
}

export async function generateGiftCardCodes(payload: {
  template_id: number;
  count: number;
  prefix?: string;
  expires_hours?: number;
  max_usage?: number;
}): Promise<{ batch_id: string; count: number; message: string }> {
  const res = await adminApiRequest<{ batch_id: string; count: number; message: string }>(
    '/gift-card/generate-codes',
    {
      method: 'POST',
      body: payload,
    },
  );
  return res.data;
}

export async function generateGiftCardCodesCsv(payload: {
  template_id: number;
  count: number;
  prefix?: string;
  expires_hours?: number;
  max_usage?: number;
}): Promise<void> {
  await adminApiDownload('/gift-card/generate-codes', {
    method: 'POST',
    body: { ...payload, download_csv: true },
    fallbackFilename: 'gift_codes.csv',
  });
}

export async function toggleGiftCardCode(
  id: number,
  action: 'enable' | 'disable',
): Promise<boolean> {
  await adminApiRequest('/gift-card/toggle-code', {
    method: 'POST',
    body: { id, action },
  });
  return true;
}

export async function deleteGiftCardCode(id: number): Promise<boolean> {
  await adminApiRequest('/gift-card/delete-code', {
    method: 'POST',
    body: { id },
  });
  return true;
}

export async function exportGiftCardCodes(batch_id: string): Promise<void> {
  await adminApiDownload('/gift-card/export-codes', {
    params: { batch_id },
    fallbackFilename: `gift_cards_${batch_id}.txt`,
  });
}

export async function fetchGiftCardUsages(params: {
  page: number;
  per_page: number;
  template_id?: number;
  user_id?: number;
}): Promise<{ data: GiftCardUsageItem[]; total: number }> {
  const res = await adminApiRequest<GiftCardUsageItem[]>('/gift-card/usages', {
    params,
  });
  return {
    data: res.data || [],
    total: res.total ?? 0,
  };
}

export async function fetchGiftCardStatistics(params?: {
  start_date?: string;
  end_date?: string;
}): Promise<GiftCardStatistics> {
  const res = await adminApiRequest<GiftCardStatistics>('/gift-card/statistics', {
    params,
  });
  return res.data;
}
