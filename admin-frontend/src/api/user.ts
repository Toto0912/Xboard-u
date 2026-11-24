import { adminApiDownload, adminApiRequest } from '@/lib/api';

export interface UserFilterItem {
  id: string;
  value: string | string[] | number | number[];
  logic?: 'and' | 'or';
}

export interface UserSortItem {
  id: string;
  desc: boolean;
}

export interface UserRecord {
  id: number;
  email: string;
  invite_user_id?: number | null;
  invite_user?: { id: number; email: string } | null;
  plan_id?: number | null;
  plan?: { id: number; name: string } | null;
  group_id?: number | null;
  group?: { id: number; name: string } | null;
  balance: number; // yuan
  commission_balance: number; // yuan
  commission_type?: number;
  commission_rate?: number | null;
  discount?: number | null;
  u: number; // bytes
  d: number; // bytes
  total_used?: number; // bytes
  transfer_enable: number; // bytes
  expired_at: number | null;
  banned: boolean | number;
  is_admin: boolean | number;
  is_staff: boolean | number;
  speed_limit?: number | null;
  device_limit?: number | null;
  online_count?: number;
  remarks?: string | null;
  token: string;
  uuid: string;
  subscribe_url?: string;
  created_at: number;
  updated_at: number;
}

export async function fetchUsers(params: {
  current: number;
  pageSize: number;
  filter?: UserFilterItem[];
  sort?: UserSortItem[];
}): Promise<{ data: UserRecord[]; total: number }> {
  const res = await adminApiRequest<UserRecord[]>('/user/fetch', {
    method: 'POST',
    body: params,
  });
  return {
    data: res.data || [],
    total: res.total ?? 0,
  };
}

export async function updateUser(payload: Record<string, unknown>): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/user/update', {
    method: 'POST',
    body: payload,
  });
  return Boolean(res.data);
}

export async function generateUsers(payload: {
  email_prefix?: string;
  email_suffix: string;
  password?: string;
  expired_at?: number | null;
  plan_id?: number | null;
  generate_count?: number | null;
}): Promise<unknown> {
  const res = await adminApiRequest('/user/generate', {
    method: 'POST',
    body: payload,
  });
  return res.data;
}

export async function generateUsersCsv(payload: {
  email_prefix?: string;
  email_suffix: string;
  password?: string;
  expired_at?: number | null;
  plan_id?: number | null;
  generate_count: number;
}): Promise<void> {
  await adminApiDownload('/user/generate', {
    method: 'POST',
    body: { ...payload, download_csv: true },
    fallbackFilename: 'users.csv',
  });
}

export async function exportUsersCsv(payload: {
  scope?: 'selected' | 'filtered' | 'all';
  user_ids?: number[];
  filter?: UserFilterItem[];
}): Promise<void> {
  await adminApiDownload('/user/dumpCSV', {
    method: 'POST',
    body: payload,
    fallbackFilename: 'users.csv',
  });
}

export async function sendMailToUsers(payload: {
  scope?: 'selected' | 'filtered' | 'all';
  user_ids?: number[];
  filter?: UserFilterItem[];
  subject: string;
  content: string;
}): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/user/sendMail', {
    method: 'POST',
    body: payload,
  });
  return Boolean(res.data);
}

export async function banUsers(payload: {
  scope?: 'selected' | 'filtered' | 'all';
  user_ids?: number[];
  filter?: UserFilterItem[];
}): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/user/ban', {
    method: 'POST',
    body: payload,
  });
  return Boolean(res.data);
}

export async function resetUserSecret(id: number): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/user/resetSecret', {
    method: 'POST',
    body: { id },
  });
  return Boolean(res.data);
}

export async function destroyUser(id: number): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/user/destroy', {
    method: 'POST',
    body: { id },
  });
  return Boolean(res.data);
}

export interface UserTrafficStatItem {
  id: number;
  user_id: number;
  u: number;
  d: number;
  server_rate: number | string;
  record_type: string;
  record_at: number;
  created_at?: number;
  updated_at?: number;
}

/** Fetch paginated per-user daily/monthly traffic usage logs from admin stat endpoint. */
export async function fetchUserTrafficStats(params: {
  user_id: number;
  page: number;
  pageSize: number;
}): Promise<{ data: UserTrafficStatItem[]; total: number }> {
  const res = await adminApiRequest<UserTrafficStatItem[]>('/stat/getStatUser', {
    method: 'GET',
    params,
  });
  return {
    data: Array.isArray(res.data) ? res.data : [],
    total: res.total ?? 0,
  };
}

/** Fetch latest admin user detail by ID for live quota/traffic summary. */
export async function fetchUserInfoById(id: number): Promise<UserRecord> {
  const res = await adminApiRequest<UserRecord>('/user/getUserInfoById', {
    method: 'GET',
    params: { id },
    silentError: true,
  });
  return res.data;
}
