import { apiRequest } from '@/lib/api';
import type { PlanItem } from '@/api/plan';

export interface UserInfo {
  email: string;
  transfer_enable: number;
  last_login_at?: number | null;
  created_at: number;
  banned?: number | boolean;
  remind_expire: number | boolean;
  remind_traffic: number | boolean;
  expired_at?: number | null;
  balance: number;
  commission_balance: number;
  plan_id?: number | null;
  discount?: number | null;
  commission_rate?: number | null;
  telegram_id?: number | string | null;
  uuid: string;
  avatar_url?: string;
}

export interface UserSubscribe {
  can_purchase_reset?: boolean;
  plan_id?: number | null;
  token: string;
  expired_at?: number | null;
  u: number;
  d: number;
  transfer_enable: number;
  email: string;
  uuid: string;
  device_limit?: number | null;
  speed_limit?: number | null;
  next_reset_at?: number | null;
  plan?: PlanItem | null;
  subscribe_url: string;
  reset_day?: number | null;
}

export interface UserCommConfig {
  is_telegram: number;
  telegram_discuss_link?: string | null;
  stripe_pk?: string | null;
  withdraw_methods: string[];
  withdraw_close: number;
  currency: string;
  currency_symbol: string;
  commission_distribution_enable: number;
  commission_distribution_l1?: number | null;
  commission_distribution_l2?: number | null;
  commission_distribution_l3?: number | null;
}

export interface ActiveSessionItem {
  id: number | string;
  name?: string;
  last_used_at?: string | null;
  created_at?: string | null;
  expires_at?: string | null;
}

export interface TrafficLogItem {
  u: number;
  d: number;
  record_at: number;
  server_rate: number | string;
}

export async function fetchUserInfo(): Promise<UserInfo> {
  const res = await apiRequest<UserInfo>('/user/info');
  return res.data;
}

export async function fetchUserSubscribe(): Promise<UserSubscribe> {
  const res = await apiRequest<UserSubscribe>('/user/getSubscribe');
  return res.data;
}

export async function fetchUserStat(): Promise<[number, number, number]> {
  const res = await apiRequest<[number, number, number]>('/user/getStat');
  return res.data ?? [0, 0, 0];
}

export async function fetchUserCommConfig(): Promise<UserCommConfig> {
  const res = await apiRequest<UserCommConfig>('/user/comm/config');
  return res.data;
}

export async function updateUserNotify(payload: {
  remind_expire?: number | boolean;
  remind_traffic?: number | boolean;
}): Promise<boolean> {
  const res = await apiRequest<boolean>('/user/update', {
    method: 'POST',
    body: payload,
  });
  return Boolean(res.data);
}

export async function changePassword(payload: {
  old_password: string;
  new_password: string;
}): Promise<boolean> {
  const res = await apiRequest<boolean>('/user/changePassword', {
    method: 'POST',
    body: payload,
  });
  return Boolean(res.data);
}

export async function resetSecurity(): Promise<string> {
  const res = await apiRequest<string>('/user/resetSecurity');
  return res.data;
}

export async function transferCommission(transfer_amount: number): Promise<boolean> {
  const res = await apiRequest<boolean>('/user/transfer', {
    method: 'POST',
    body: { transfer_amount },
  });
  return Boolean(res.data);
}

export async function fetchActiveSessions(): Promise<ActiveSessionItem[]> {
  const res = await apiRequest<ActiveSessionItem[]>('/user/getActiveSession');
  return res.data ?? [];
}

export async function removeActiveSession(session_id: string | number): Promise<boolean> {
  const res = await apiRequest<boolean>('/user/removeActiveSession', {
    method: 'POST',
    body: { session_id: String(session_id) },
  });
  return Boolean(res.data);
}

export async function fetchTelegramBotInfo(): Promise<{ username: string }> {
  const res = await apiRequest<{ username: string }>('/user/telegram/getBotInfo', {
    silentError: true,
  });
  return res.data;
}

export async function fetchTrafficLogs(): Promise<TrafficLogItem[]> {
  const res = await apiRequest<TrafficLogItem[]>('/user/stat/getTrafficLog');
  return res.data ?? [];
}
