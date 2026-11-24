import { apiRequest } from '@/lib/api';

export interface ServerNodeItem {
  id: number;
  type: string;
  version?: number | null;
  name: string;
  rate: number | string;
  tags?: string[] | null;
  is_online: boolean | number;
  last_check_at?: number | null;
}

export async function fetchServers(): Promise<ServerNodeItem[]> {
  const res = await apiRequest<ServerNodeItem[]>('/user/server/fetch');
  return res.data ?? [];
}
