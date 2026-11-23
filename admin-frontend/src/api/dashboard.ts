import { adminApiRequest } from '@/lib/api';

export interface TrafficSummary {
  upload: number;
  download: number;
  total: number;
}

export interface DashboardStats {
  todayIncome: number;
  dayIncomeGrowth: number;
  currentMonthIncome: number;
  lastMonthIncome: number;
  monthIncomeGrowth: number;
  lastMonthIncomeGrowth: number;
  currentMonthCommissionPayout: number;
  lastMonthCommissionPayout: number;
  commissionGrowth: number;
  commissionPendingTotal: number;
  currentMonthNewUsers: number;
  totalUsers: number;
  activeUsers: number;
  userGrowth: number;
  onlineUsers: number;
  onlineDevices: number;
  ticketPendingTotal: number;
  onlineNodes: number;
  todayTraffic: TrafficSummary;
  monthTraffic: TrafficSummary;
  totalTraffic: TrafficSummary;
}

export type OrderMetricType =
  | 'paid_total'
  | 'paid_count'
  | 'commission_total'
  | 'commission_count';

export interface OrderStatPoint {
  date: string;
  value?: number;
  type?: string;
  paid_total?: number;
  paid_count?: number;
  commission_total?: number;
  commission_count?: number;
  avg_order_amount?: number;
  avg_commission_amount?: number;
}

export interface OrderStatsResponse {
  list: OrderStatPoint[];
  summary: {
    paid_total: number;
    paid_count: number;
    commission_total: number;
    commission_count: number;
    start_date: string | null;
    end_date: string | null;
    avg_paid_amount: number;
    avg_commission_amount: number;
    commission_rate: number;
  };
}

export interface TrafficRankItem {
  id: string;
  name: string;
  value: number;
  previousValue: number;
  change: number;
  timestamp: string;
}

export interface SystemStatus {
  schedule: boolean;
  horizon: boolean;
  schedule_last_runtime: number | string | null;
}

export interface QueueStats {
  failedJobs: number;
  jobsPerMinute: number;
  pausedMasters: number;
  periods: {
    failedJobs: number;
    recentJobs: number;
  };
  processes: number;
  queueWithMaxRuntime: string | null;
  queueWithMaxThroughput: string | null;
  recentJobs: number;
  status: boolean;
  wait: Record<string, number>;
}

export interface QueueWorkloadItem {
  name: string;
  length: number;
  wait: number;
  processes: number;
  split_queues?: Record<string, { name: string; length: number; wait: number }>;
}

export interface FailedJobItem {
  id: string;
  name?: string;
  queue?: string;
  exception?: string;
  failed_at?: string | number;
}

export async function getStats(): Promise<DashboardStats> {
  const res = await adminApiRequest<DashboardStats>('/stat/getStats');
  return res.data;
}

export async function getOrderStats(params: {
  start_date?: string;
  end_date?: string;
  type?: OrderMetricType;
}): Promise<OrderStatsResponse> {
  const res = await adminApiRequest<OrderStatsResponse>('/stat/getOrder', { params });
  return res.data;
}

export async function getTrafficRank(params: {
  type: 'node' | 'user';
  start_time?: number;
  end_time?: number;
}): Promise<TrafficRankItem[]> {
  const res = await adminApiRequest<TrafficRankItem[]>('/stat/getTrafficRank', { params });
  return res.data;
}

export async function getSystemStatus(): Promise<SystemStatus> {
  const res = await adminApiRequest<SystemStatus>('/system/getSystemStatus');
  return res.data;
}

export async function getQueueStats(): Promise<QueueStats> {
  const res = await adminApiRequest<QueueStats>('/system/getQueueStats');
  return res.data;
}

export async function getQueueWorkload(): Promise<QueueWorkloadItem[]> {
  const res = await adminApiRequest<QueueWorkloadItem[]>('/system/getQueueWorkload');
  return res.data;
}

export async function getFailedJobs(current = 1, page_size = 20): Promise<{
  data: FailedJobItem[];
  total: number;
}> {
  const res = await adminApiRequest<FailedJobItem[]>('/system/getHorizonFailedJobs', {
    params: { current, page_size },
  });
  return { data: res.data || [], total: res.total ?? 0 };
}
