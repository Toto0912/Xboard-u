import { adminApiRequest } from '@/lib/api';

export type ServerRouteAction = 'block' | 'direct' | 'dns' | 'proxy';

export interface ServerRouteItem {
  id: number;
  remarks: string;
  match: string[];
  action: ServerRouteAction;
  action_value?: string | null;
  created_at?: number;
  updated_at?: number;
}

export async function fetchServerRoutes(): Promise<ServerRouteItem[]> {
  const res = await adminApiRequest<ServerRouteItem[]>('/server/route/fetch');
  return res.data || [];
}

export async function saveServerRoute(payload: {
  id?: number;
  remarks: string;
  match: string[];
  action: ServerRouteAction;
  action_value?: string | null;
}): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/server/route/save', {
    method: 'POST',
    body: payload,
  });
  return Boolean(res.data);
}

export async function dropServerRoute(id: number): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/server/route/drop', {
    method: 'POST',
    body: { id },
  });
  return Boolean(res.data);
}
