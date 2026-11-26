import { adminApiRequest } from '@/lib/api';

export interface TrafficResetLogItem {
  id: number;
  user_id: number;
  user_email: string;
  reset_type: string;
  reset_type_name: string;
  reset_time: string;
  old_traffic: {
    upload: number;
    download: number;
    total: number;
    formatted: string;
  };
  new_traffic: {
    upload: number;
    download: number;
    total: number;
    formatted: string;
  };
  trigger_source: string;
  trigger_source_name: string;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

export interface TrafficResetLogsResponse {
  data: TrafficResetLogItem[];
  pagination: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
}

export async function fetchTrafficResetLogs(params: {
  page?: number;
  per_page?: number;
  user_id?: number;
  user_email?: string;
  reset_type?: string;
  trigger_source?: string;
  start_date?: string;
  end_date?: string;
}): Promise<TrafficResetLogsResponse> {
  const res = await adminApiRequest<TrafficResetLogItem[]>('/traffic-reset/logs', {
    params,
  });
  const raw = res as unknown as TrafficResetLogsResponse;
  return {
    data: raw.data || [],
    pagination: raw.pagination || {
      current_page: 1,
      last_page: 1,
      per_page: 20,
      total: 0,
    },
  };
}

export async function resetUserTraffic(user_id: number, reason?: string, operation_id?: string): Promise<boolean> {
  await adminApiRequest('/traffic-reset/reset-user', {
    method: 'POST',
    body: { user_id, reason, operation_id },
  });
  return true;
}
