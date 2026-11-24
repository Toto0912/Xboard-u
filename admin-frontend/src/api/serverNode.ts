import { adminApiRequest } from '@/lib/api';

export type ServerProtocolType =
  | 'vless'
  | 'vmess'
  | 'trojan'
  | 'shadowsocks'
  | 'hysteria'
  | 'tuic'
  | 'anytls'
  | 'socks'
  | 'naive'
  | 'http'
  | 'mieru';

export type TargetKernel = 'xray' | 'singbox';

export interface RateTimeRange {
  start: string;
  end: string;
  rate: number;
}

export interface CertConfig {
  cert_mode?: 'none' | 'http' | 'dns' | 'self' | 'file';
  domain?: string;
  email?: string;
  dns_provider?: string;
  dns_env?: Record<string, string>;
  http_port?: number;
  cert_content?: string;
  key_content?: string;
}

export interface CdnServerConfig {
  host: string;
  port: string | number;
  server_port: string | number;
  protocol_settings: Record<string, unknown>;
}

export interface CdnSettings {
  enabled: boolean;
  type?: ServerProtocolType;
  server?: CdnServerConfig;
}

export interface ServerNodeItem {
  id: number;
  code: string | null;
  type: ServerProtocolType;
  name: string;
  host: string;
  port: string | number;
  server_port: string | number;
  rate: number | string;
  rate_time_enable?: boolean;
  rate_time_ranges?: RateTimeRange[] | null;
  tags?: string[] | null;
  group_ids?: number[] | null;
  groups?: Array<{ id: number; name: string }>;
  route_ids?: number[] | null;
  parent_id?: number | null;
  machine_id?: number | null;
  show: boolean | number;
  enabled: boolean;
  sort: number | null;
  u?: number | null;
  d?: number | null;
  transfer_enable?: number | null;
  online?: number;
  online_conn?: number;
  is_online?: number;
  available_status?: number;
  last_check_at?: number | null;
  last_push_at?: number | null;
  load_status?: Record<string, unknown> | null;
  protocol_settings: Record<string, unknown>;
  cert_config?: CertConfig | null;
  custom_outbounds?: Array<Record<string, unknown>> | null;
  custom_routes?: Array<Record<string, unknown>> | null;
  cdn_settings?: CdnSettings | null;
}

/** Normalize an ID list from legacy numeric/digit-string arrays into deduplicated positive safe integers. */
export function normalizeNumericIds(ids: unknown): number[] {
  if (!Array.isArray(ids)) return [];
  const seen = new Set<number>();
  const result: number[] = [];
  for (const raw of ids) {
    let num: number;
    if (typeof raw === 'number') {
      num = raw;
    } else if (typeof raw === 'string' && /^\s*\d+\s*$/.test(raw)) {
      num = Number(raw.trim());
    } else {
      continue;
    }
    if (Number.isSafeInteger(num) && num > 0 && !seen.has(num)) {
      seen.add(num);
      result.push(num);
    }
  }
  return result;
}

export async function getServerNodes(): Promise<ServerNodeItem[]> {
  const res = await adminApiRequest<ServerNodeItem[]>('/server/manage/getNodes');
  return (res.data || []).map((node) => ({
    ...node,
    group_ids: normalizeNumericIds(node.group_ids),
    route_ids: normalizeNumericIds(node.route_ids),
  }));
}

export async function saveServerNode(payload: Record<string, unknown>): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/server/manage/save', {
    method: 'POST',
    body: payload,
  });
  return Boolean(res.data);
}

export async function updateServerNode(payload: {
  id: number;
  show?: number;
  enabled?: boolean;
  machine_id?: number | null;
}): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/server/manage/update', {
    method: 'POST',
    body: payload,
  });
  return Boolean(res.data);
}

export async function dropServerNode(id: number): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/server/manage/drop', {
    method: 'POST',
    body: { id },
  });
  return Boolean(res.data);
}

export async function copyServerNode(id: number): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/server/manage/copy', {
    method: 'POST',
    body: { id },
  });
  return Boolean(res.data);
}

export async function sortServerNodes(
  orders: Array<{ id: number; order: number }>,
): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/server/manage/sort', {
    method: 'POST',
    body: orders,
  });
  return Boolean(res.data);
}

export async function batchDeleteServerNodes(ids: number[]): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/server/manage/batchDelete', {
    method: 'POST',
    body: { ids },
  });
  return Boolean(res.data);
}

export async function batchUpdateServerNodes(payload: {
  ids: number[];
  show?: number;
  enabled?: boolean;
  machine_id?: number | null;
}): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/server/manage/batchUpdate', {
    method: 'POST',
    body: payload,
  });
  return Boolean(res.data);
}

export async function resetServerNodeTraffic(id: number): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/server/manage/resetTraffic', {
    method: 'POST',
    body: { id },
  });
  return Boolean(res.data);
}

export async function batchResetServerNodeTraffic(ids: number[]): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/server/manage/batchResetTraffic', {
    method: 'POST',
    body: { ids },
  });
  return Boolean(res.data);
}

export async function generateEchKey(
  public_name?: string,
): Promise<{ key: string; config: string }> {
  const res = await adminApiRequest<{ key: string; config: string }>(
    '/server/manage/generateEchKey',
    {
      params: public_name ? { public_name } : undefined,
    },
  );
  return res.data;
}
