import { adminApiRequest } from '@/lib/api';

export interface ServerGroupItem {
  id: number;
  name: string;
  users_count: number;
  server_count: number;
  created_at?: number;
  updated_at?: number;
}

export async function fetchServerGroups(): Promise<ServerGroupItem[]> {
  const res = await adminApiRequest<ServerGroupItem[]>('/server/group/fetch');
  return res.data || [];
}

export async function saveServerGroup(payload: {
  id?: number;
  name: string;
}): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/server/group/save', {
    method: 'POST',
    body: payload,
  });
  return Boolean(res.data);
}

export async function dropServerGroup(id: number): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/server/group/drop', {
    method: 'POST',
    body: { id },
  });
  return Boolean(res.data);
}
