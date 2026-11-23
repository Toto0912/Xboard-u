import { adminApiRequest } from '@/lib/api';

export interface MachineLoadStatus {
  cpu: number;
  mem: { total: number; used: number };
  swap?: { total: number; used: number };
  disk?: { total: number; used: number };
  net?: { in_speed: number; out_speed: number };
  updated_at?: number;
}

export interface ServerMachineItem {
  id: number;
  name: string;
  notes: string | null;
  is_active: boolean;
  last_seen_at: number | null;
  load_status: MachineLoadStatus | null;
  servers_count: number;
  created_at?: number;
  updated_at?: number;
}

export interface MachineCreateResult {
  id: number;
  token: string;
  install_command: string;
}

export interface MachineNodeItem {
  id: number;
  name: string;
  type: string;
  host: string;
  port: string | number;
  show: boolean | number;
  enabled: boolean | number;
  sort: number | null;
}

export interface MachineLoadHistoryItem {
  cpu: number;
  mem_total: number;
  mem_used: number;
  disk_total: number;
  disk_used: number;
  net_in_speed?: number | null;
  net_out_speed?: number | null;
  recorded_at: number;
}

export async function fetchServerMachines(): Promise<ServerMachineItem[]> {
  const res = await adminApiRequest<ServerMachineItem[]>('/server/machine/fetch');
  return res.data || [];
}

export async function saveServerMachine(payload: {
  id?: number;
  name: string;
  notes?: string | null;
  is_active?: boolean;
}): Promise<MachineCreateResult | boolean> {
  const res = await adminApiRequest<MachineCreateResult | boolean>('/server/machine/save', {
    method: 'POST',
    body: payload,
  });
  return res.data;
}

export async function dropServerMachine(id: number): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/server/machine/drop', {
    method: 'POST',
    body: { id },
  });
  return Boolean(res.data);
}

export async function getMachineToken(id: number): Promise<{ token: string }> {
  const res = await adminApiRequest<{ token: string }>('/server/machine/getToken', {
    params: { id },
  });
  return res.data;
}

export async function resetMachineToken(id: number): Promise<{ token: string }> {
  const res = await adminApiRequest<{ token: string }>('/server/machine/resetToken', {
    method: 'POST',
    body: { id },
  });
  return res.data;
}

export async function getMachineInstallCommand(id: number): Promise<{ command: string }> {
  const res = await adminApiRequest<{ command: string }>('/server/machine/installCommand', {
    params: { id },
  });
  return res.data;
}

export async function getMachineNodes(machine_id: number): Promise<MachineNodeItem[]> {
  const res = await adminApiRequest<MachineNodeItem[]>('/server/machine/nodes', {
    params: { machine_id },
  });
  return res.data || [];
}

export async function getMachineHistory(
  machine_id: number,
  range_hours = 6,
  limit = 120,
): Promise<MachineLoadHistoryItem[]> {
  const res = await adminApiRequest<MachineLoadHistoryItem[]>('/server/machine/history', {
    params: { machine_id, range_hours, limit },
  });
  return res.data || [];
}
