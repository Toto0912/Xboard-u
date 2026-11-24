import { apiRequest } from '@/lib/api';

export interface GuestConfig {
  tos_url?: string | null;
  is_email_verify: number;
  is_invite_force: number;
  email_whitelist_suffix: string[] | 0;
  is_captcha: number;
  captcha_type?: 'recaptcha' | 'recaptcha-v3' | 'turnstile' | string;
  recaptcha_site_key?: string | null;
  recaptcha_v3_site_key?: string | null;
  recaptcha_v3_score_threshold?: number;
  turnstile_site_key?: string | null;
  app_description?: string | null;
  app_url?: string | null;
  logo?: string | null;
  is_recaptcha?: number;
}

export async function fetchGuestConfig(): Promise<GuestConfig> {
  const res = await apiRequest<GuestConfig>('/guest/comm/config', { silentError: true });
  return res.data;
}
