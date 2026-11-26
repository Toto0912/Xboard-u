import type { TFunction } from 'i18next';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  DollarSign,
  HardDrive,
  Info,
  Network,
  RefreshCw,
  Server,
  Ticket,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useCurrencySymbol } from '@/lib/settings';
import {
  getFailedJobs,
  getOrderStats,
  getQueueStats,
  getQueueWorkload,
  getStats,
  getSystemStatus,
  getTrafficRank,
  type OrderMetricType,
} from '@/api/dashboard';
import { formatBytes, formatCurrency, formatPercent, formatTimestamp } from '@/lib/format';
import { cn } from '@/lib/utils';
import { DateRangePicker } from '@/components/shared/DateTimePicker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

type DatePreset = '7d' | '30d' | 'month' | 'custom';
type RankRange = 'today' | 'yesterday' | '7d' | '30d' | 'custom';

function formatIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getDateRange(
  preset: DatePreset,
  customRange: { from: Date; to: Date },
): { start_date: string; end_date: string } {
  if (preset === 'custom') {
    return {
      start_date: formatIsoDate(customRange.from),
      end_date: formatIsoDate(customRange.to),
    };
  }
  const now = new Date();
  const end = formatIsoDate(now);
  if (preset === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start_date: formatIsoDate(start), end_date: end };
  }
  const days = preset === '7d' ? 6 : 29;
  const start = new Date(now.getTime() - days * 86_400_000);
  return { start_date: formatIsoDate(start), end_date: end };
}

function getRankTimestamps(
  range: RankRange,
  customRange: { from: Date; to: Date },
): { start_time: number; end_time: number } {
  if (range === 'custom') {
    const start = new Date(
      customRange.from.getFullYear(),
      customRange.from.getMonth(),
      customRange.from.getDate(),
    );
    const end = new Date(
      customRange.to.getFullYear(),
      customRange.to.getMonth(),
      customRange.to.getDate() + 1,
    );
    return {
      start_time: Math.floor(start.getTime() / 1000),
      end_time: Math.floor(end.getTime() / 1000) - 1,
    };
  }
  const end = Math.floor(Date.now() / 1000);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todaySec = Math.floor(todayStart.getTime() / 1000);

  if (range === 'today') {
    return { start_time: todaySec, end_time: todaySec + 86400 };
  }
  if (range === 'yesterday') {
    return { start_time: todaySec - 86400, end_time: todaySec - 1 };
  }
  const days = range === '7d' ? 7 : 30;
  return { start_time: end - days * 86400, end_time: end };
}

const businessQueues = ['default', 'order_handle'];
const notificationQueues = ['node_sync', 'send_email', 'send_email_mass', 'send_telegram'];
const legacyTrafficQueues = ['traffic_fetch', 'stat', 'user_alive_sync'];
const trafficQueues = [...legacyTrafficQueues, 'traffic_batch'];
const sharedQueues = [...businessQueues, ...notificationQueues];

function queuePoolKey(queues: string[]) {
  return [...new Set(queues)].sort().join(',');
}

const queuePoolNames = new Map([
  [queuePoolKey(businessQueues), 'business'],
  [queuePoolKey(notificationQueues), 'notification'],
  [queuePoolKey(legacyTrafficQueues), 'data_pipeline'],
  [queuePoolKey(trafficQueues), 'data_pipeline'],
  [queuePoolKey([...sharedQueues, ...legacyTrafficQueues]), 'all'],
  [queuePoolKey([...sharedQueues, ...trafficQueues]), 'all'],
]);

function getQueueMeta(rawName: string, t: TFunction) {
  const tokens = rawName
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const matchedPool = queuePoolNames.get(queuePoolKey(tokens));

  let title = rawName;
  if (matchedPool) {
    title = t(`dashboard.queuePools.${matchedPool}`);
  } else if (tokens.length === 1) {
    const single = t(`dashboard.queueItems.${tokens[0]}`, { defaultValue: '' });
    if (single) title = single;
  }

  const details = tokens
    .map((code) => ({
      code,
      desc: t(`dashboard.queueItems.${code}`, { defaultValue: '' }),
    }))
    .filter((item) => Boolean(item.desc));

  return { title, details };
}

function GrowthPill({ value }: { value: number }) {
  const positive = value > 0;
  const negative = value < 0;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap text-xs font-medium tabular-nums',
        positive && 'text-emerald-600 dark:text-emerald-400',
        negative && 'text-rose-600 dark:text-rose-400',
        !positive && !negative && 'text-muted-foreground',
      )}
    >
      {positive && <ArrowUpRight className="h-3.5 w-3.5" />}
      {negative && <ArrowDownRight className="h-3.5 w-3.5" />}
      {formatPercent(value)}
    </span>
  );
}

function TrafficRankCard({
  type,
  title,
  icon: Icon,
}: {
  type: 'node' | 'user';
  title: string;
  icon: LucideIcon;
}) {
  const { t } = useTranslation();
  const [range, setRange] = useState<RankRange>('today');
  const [customPickerOpen, setCustomPickerOpen] = useState(false);
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date }>(() => ({
    from: new Date(Date.now() - 6 * 86_400_000),
    to: new Date(),
  }));
  const windowRange = useMemo(() => getRankTimestamps(range, customRange), [range, customRange]);

  const query = useQuery({
    queryKey: ['dashboard-traffic-rank', type, range, windowRange.start_time, windowRange.end_time],
    queryFn: () => getTrafficRank({ type, ...windowRange }),
  });

  const items = query.data ?? [];
  const maxValue = items.reduce((max, item) => Math.max(max, Number(item.value || 0)), 0);

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="space-y-0 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <CardTitle className="whitespace-nowrap text-base font-medium">{title}</CardTitle>
          </div>
          <div className="ml-auto flex min-w-0 max-w-full items-center gap-1.5">
            <div className="inline-flex h-8 min-w-0 max-w-full items-center rounded-md border border-input bg-[var(--input-bg)] shadow-xs transition-all">
              <Select
                value={range}
                onValueChange={(v) => {
                  const next = v as RankRange;
                  setRange(next);
                  if (next === 'custom') {
                    setTimeout(() => setCustomPickerOpen(true), 60);
                  } else {
                    setCustomPickerOpen(false);
                  }
                }}
              >
                <SelectTrigger className="h-8 w-auto min-w-[78px] shrink-0 gap-1.5 border-0 bg-transparent px-2.5 text-xs shadow-none focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">{t('dashboard.today')}</SelectItem>
                  <SelectItem value="yesterday">{t('dashboard.yesterday')}</SelectItem>
                  <SelectItem value="7d">{t('dashboard.last7d')}</SelectItem>
                  <SelectItem value="30d">{t('dashboard.last30d')}</SelectItem>
                  <SelectItem value="custom">{t('dashboard.customRange')}</SelectItem>
                </SelectContent>
              </Select>
              {range === 'custom' && (
                <>
                  <div className="h-4 w-px bg-border" />
                  <DateRangePicker
                    variant="ghost"
                    open={customPickerOpen}
                    onOpenChange={setCustomPickerOpen}
                    value={customRange}
                    onChange={setCustomRange}
                    className="h-7 min-w-0 shrink rounded-l-none px-1.5 text-[11px] hover:bg-accent/50 sm:px-2 sm:text-xs"
                  />
                </>
              )}
            </div>
            <Activity className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <div className="h-[400px] space-y-2.5 overflow-hidden">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-[400px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
            {t('dashboard.noRankData')}
          </div>
        ) : (
          <div className="h-[400px] space-y-2.5 overflow-x-hidden overflow-y-auto pr-2">
            {items.map((item) => {
              const val = Number(item.value || 0);
              const pct =
                maxValue > 0 && val > 0 ? Math.max(1.5, (val / maxValue) * 100) : 0;
              return (
                <div
                  key={item.id}
                  className="min-w-0 space-y-2 rounded-lg border bg-muted/30 px-4 py-3"
                >
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.name}</span>
                    <GrowthPill value={item.change} />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-foreground transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="min-w-[4.5rem] shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
                      {formatBytes(val)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [datePreset, setDatePreset] = useState<DatePreset>('30d');
  const [orderPickerOpen, setOrderPickerOpen] = useState(false);
  const [customOrderRange, setCustomOrderRange] = useState<{ from: Date; to: Date }>(() => ({
    from: new Date(Date.now() - 29 * 86_400_000),
    to: new Date(),
  }));
  const [orderMetric, setOrderMetric] = useState<OrderMetricType>('paid_total');
  const [failedJobsOpen, setFailedJobsOpen] = useState(false);

  const dateRange = useMemo(
    () => getDateRange(datePreset, customOrderRange),
    [datePreset, customOrderRange],
  );

  const symbol = useCurrencySymbol();

  const statsQuery = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: getStats,
  });

  const orderQuery = useQuery({
    queryKey: ['dashboard-orders', dateRange, orderMetric],
    queryFn: () => getOrderStats({ ...dateRange, type: orderMetric }),
  });

  const sysStatusQuery = useQuery({
    queryKey: ['system-status'],
    queryFn: getSystemStatus,
  });

  const queueStatsQuery = useQuery({
    queryKey: ['queue-stats'],
    queryFn: getQueueStats,
  });

  const queueWorkloadQuery = useQuery({
    queryKey: ['queue-workload'],
    queryFn: getQueueWorkload,
  });

  const failedJobsQuery = useQuery({
    queryKey: ['horizon-failed-jobs'],
    queryFn: () => getFailedJobs(1, 20),
    enabled: failedJobsOpen,
  });

  const refreshAll = () => {
    void statsQuery.refetch();
    void orderQuery.refetch();
    void queryClient.invalidateQueries({ queryKey: ['dashboard-traffic-rank'] });
    void sysStatusQuery.refetch();
    void queueStatsQuery.refetch();
    void queueWorkloadQuery.refetch();
  };

  const stats = statsQuery.data;
  const orderList = orderQuery.data?.list ?? [];
  const orderSummary = orderQuery.data?.summary;
  const sysStatus = sysStatusQuery.data;
  const queueStats = queueStatsQuery.data;
  const workload = queueWorkloadQuery.data ?? [];
  const isMonetaryMetric = orderMetric === 'paid_total' || orderMetric === 'commission_total';

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('nav.dashboard')}</h1>
          <p className="text-sm text-muted-foreground">{t('dashboard.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sysStatus && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0} className="inline-flex cursor-help rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Badge variant={sysStatus.schedule ? 'success' : 'destructive'} className="gap-1.5">
                      <span
                        className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          sysStatus.schedule ? 'bg-emerald-500' : 'bg-rose-500',
                        )}
                      />
                      {t('dashboard.schedule')}:{' '}
                      {sysStatus.schedule ? t('dashboard.running') : t('dashboard.stopped')}
                    </Badge>
                  </span>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  align="end"
                  className="max-w-xs space-y-1 border bg-popover px-3 py-2 text-xs leading-relaxed text-popover-foreground shadow-md"
                >
                  <div className="font-semibold text-foreground">{t('dashboard.scheduleTooltipTitle')}</div>
                  <p className="text-muted-foreground">{t('dashboard.scheduleTooltipDesc')}</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0} className="inline-flex cursor-help rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Badge variant={sysStatus.horizon ? 'success' : 'destructive'} className="gap-1.5">
                      <span
                        className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          sysStatus.horizon ? 'bg-emerald-500' : 'bg-rose-500',
                        )}
                      />
                      Horizon: {sysStatus.horizon ? t('dashboard.running') : t('dashboard.stopped')}
                    </Badge>
                  </span>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  align="end"
                  className="max-w-xs space-y-1 border bg-popover px-3 py-2 text-xs leading-relaxed text-popover-foreground shadow-md"
                >
                  <div className="font-semibold text-foreground">{t('dashboard.horizonTooltipTitle')}</div>
                  <p className="text-muted-foreground">{t('dashboard.horizonTooltipDesc')}</p>
                </TooltipContent>
              </Tooltip>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={refreshAll}
            disabled={statsQuery.isFetching}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', statsQuery.isFetching && 'animate-spin')} />
            {t('common.refresh')}
          </Button>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('dashboard.monthIncome')}
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsQuery.isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-2xl font-bold">
                    {formatCurrency(stats?.currentMonthIncome, symbol)}
                  </div>
                  <GrowthPill value={stats?.monthIncomeGrowth ?? 0} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('dashboard.lastMonthIncome')}: {formatCurrency(stats?.lastMonthIncome, symbol)}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('dashboard.todayIncome')}
            </CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsQuery.isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-2xl font-bold">
                    {formatCurrency(stats?.todayIncome, symbol)}
                  </div>
                  <GrowthPill value={stats?.dayIncomeGrowth ?? 0} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('dashboard.monthCommission')}:{' '}
                  {formatCurrency(stats?.currentMonthCommissionPayout, symbol)}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('dashboard.monthNewUsers')}
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsQuery.isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-2xl font-bold">
                    {(stats?.currentMonthNewUsers ?? 0).toLocaleString()}
                  </div>
                  <GrowthPill value={stats?.userGrowth ?? 0} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('dashboard.totalUsers')}: {(stats?.totalUsers ?? 0).toLocaleString()} ·{' '}
                  {t('dashboard.activeUsers')}: {(stats?.activeUsers ?? 0).toLocaleString()}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('dashboard.onlineStatus')}
            </CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsQuery.isLoading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {stats?.onlineNodes ?? 0}{' '}
                  <span className="text-sm font-normal text-muted-foreground">
                    {t('dashboard.nodesUnit')}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('dashboard.onlineUsers')}: {stats?.onlineUsers ?? 0} ·{' '}
                  {t('dashboard.onlineDevices')}: {stats?.onlineDevices ?? 0}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pending & Traffic Summary Row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('dashboard.pendingActions')}</CardTitle>
            <Ticket className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 pt-2">
            <Link
              to="/user/ticket"
              className="rounded-lg border p-3 transition-colors hover:bg-accent"
            >
              <div className="text-xs text-muted-foreground">{t('dashboard.pendingTickets')}</div>
              <div className="mt-1 text-xl font-semibold">
                {stats?.ticketPendingTotal ?? 0}
              </div>
            </Link>
            <Link
              to="/finance/order"
              className="rounded-lg border p-3 transition-colors hover:bg-accent"
            >
              <div className="text-xs text-muted-foreground">{t('dashboard.pendingCommission')}</div>
              <div className="mt-1 text-xl font-semibold">
                {stats?.commissionPendingTotal ?? 0}
              </div>
            </Link>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('dashboard.trafficOverview')}</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="grid gap-3 pt-2 sm:grid-cols-3">
            {[
              { label: t('dashboard.todayTraffic'), data: stats?.todayTraffic },
              { label: t('dashboard.monthTraffic'), data: stats?.monthTraffic },
              { label: t('dashboard.totalTraffic'), data: stats?.totalTraffic },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">{item.label}</div>
                <div className="mt-1 text-lg font-semibold">
                  {formatBytes(item.data?.total)}
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  ↑ {formatBytes(item.data?.upload)} · ↓ {formatBytes(item.data?.download)}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Traffic Ranking (Side-by-Side) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TrafficRankCard
          type="node"
          title={t('dashboard.nodeTrafficRank')}
          icon={Network}
        />
        <TrafficRankCard
          type="user"
          title={t('dashboard.userTrafficRank')}
          icon={Users}
        />
      </div>

      {/* Order & Revenue Trend Chart */}
      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">{t('dashboard.orderTrend')}</CardTitle>
              <CardDescription>{t('dashboard.orderTrendDesc')}</CardDescription>
            </div>
            <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
              <div className="inline-flex h-8 min-w-0 max-w-full items-center rounded-md border border-input bg-[var(--input-bg)] shadow-xs transition-all">
                <Select
                  value={datePreset}
                  onValueChange={(v) => {
                    const next = v as DatePreset;
                    setDatePreset(next);
                    if (next === 'custom') {
                      setTimeout(() => setOrderPickerOpen(true), 60);
                    } else {
                      setOrderPickerOpen(false);
                    }
                  }}
                >
                  <SelectTrigger className="h-8 w-auto min-w-[78px] shrink-0 gap-1.5 border-0 bg-transparent px-2.5 text-xs shadow-none focus:ring-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7d">{t('dashboard.last7d')}</SelectItem>
                    <SelectItem value="30d">{t('dashboard.last30d')}</SelectItem>
                    <SelectItem value="month">{t('dashboard.thisMonth')}</SelectItem>
                    <SelectItem value="custom">{t('dashboard.customRange')}</SelectItem>
                  </SelectContent>
                </Select>
                {datePreset === 'custom' && (
                  <>
                    <div className="h-4 w-px bg-border" />
                    <DateRangePicker
                      variant="ghost"
                      open={orderPickerOpen}
                      onOpenChange={setOrderPickerOpen}
                      value={customOrderRange}
                      onChange={setCustomOrderRange}
                      className="h-7 min-w-0 shrink rounded-l-none px-1.5 text-[11px] hover:bg-accent/50 sm:px-2 sm:text-xs"
                    />
                  </>
                )}
              </div>
              <div className="inline-flex rounded-md border bg-muted/40 p-0.5 text-xs">
                {(
                  [
                    ['paid_total', t('dashboard.metricPaidTotal')],
                    ['paid_count', t('dashboard.metricPaidCount')],
                    ['commission_total', t('dashboard.metricCommissionTotal')],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setOrderMetric(key)}
                    className={cn(
                      'rounded px-2.5 py-1 transition-colors cursor-pointer',
                      orderMetric === key
                        ? 'bg-background font-medium text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {orderSummary && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border px-3 py-2">
                  <div className="text-[11px] text-muted-foreground">{t('dashboard.summaryPaid')}</div>
                  <div className="text-sm font-semibold">
                    {formatCurrency(orderSummary.paid_total, symbol)}
                  </div>
                </div>
                <div className="rounded-lg border px-3 py-2">
                  <div className="text-[11px] text-muted-foreground">{t('dashboard.summaryOrders')}</div>
                  <div className="text-sm font-semibold">{orderSummary.paid_count}</div>
                </div>
                <div className="rounded-lg border px-3 py-2">
                  <div className="text-[11px] text-muted-foreground">{t('dashboard.summaryAvgOrder')}</div>
                  <div className="text-sm font-semibold">
                    {formatCurrency(orderSummary.avg_paid_amount, symbol)}
                  </div>
                </div>
                <div className="rounded-lg border px-3 py-2">
                  <div className="text-[11px] text-muted-foreground">{t('dashboard.summaryCommissionRate')}</div>
                  <div className="text-sm font-semibold">{orderSummary.commission_rate}%</div>
                </div>
              </div>
            )}

            <div className="h-72 w-full">
              {orderQuery.isLoading ? (
                <Skeleton className="h-full w-full" />
              ) : orderList.length === 0 ? (
                <div className="flex h-full items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                  {t('dashboard.noOrderData')}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={orderList} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="orderAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(221 83% 53%)" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="hsl(221 83% 53%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: number) =>
                        isMonetaryMetric ? `${symbol}${(v / 100).toFixed(0)}` : String(v)
                      }
                    />
                    <RechartsTooltip
                      formatter={(val) => {
                        const num = Number(val ?? 0);
                        return [
                          isMonetaryMetric ? formatCurrency(num, symbol) : num,
                          t(`dashboard.metric_${orderMetric}`),
                        ];
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="hsl(221 83% 53%)"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#orderAreaGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
      </Card>

      {/* System & Queue Monitoring */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 border-b px-6 py-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" />
              {t('dashboard.queueMonitor')}
            </CardTitle>
            <CardDescription className="flex items-center gap-1.5 pt-0.5">
              <Clock className="h-3.5 w-3.5" />
              {t('dashboard.lastScheduleRun')}: {formatTimestamp(sysStatus?.schedule_last_runtime)}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setFailedJobsOpen(true)}>
            <AlertTriangle className="h-3.5 w-3.5" />
            {t('dashboard.failedJobs')} ({queueStats?.failedJobs ?? 0})
          </Button>
        </CardHeader>
        <CardContent className="space-y-4 p-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">{t('dashboard.processes')}</div>
              <div className="mt-1 text-lg font-semibold">{queueStats?.processes ?? 0}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">{t('dashboard.jobsPerMinute')}</div>
              <div className="mt-1 text-lg font-semibold">{queueStats?.jobsPerMinute ?? 0}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">{t('dashboard.recentJobs')}</div>
              <div className="mt-1 text-lg font-semibold">{queueStats?.recentJobs ?? 0}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">{t('dashboard.pausedMasters')}</div>
              <div className="mt-1 text-lg font-semibold">{queueStats?.pausedMasters ?? 0}</div>
            </div>
          </div>

          {workload.length > 0 && (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-left text-xs">
                <thead className="border-b bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">{t('dashboard.queueName')}</th>
                    <th className="px-3 py-2 font-medium">{t('dashboard.queueLength')}</th>
                    <th className="px-3 py-2 font-medium">{t('dashboard.queueWait')}</th>
                    <th className="px-3 py-2 font-medium">{t('dashboard.queueProcesses')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {workload.map((q) => {
                    const meta = getQueueMeta(q.name, t);
                    return (
                      <tr key={q.name}>
                        <td className="px-3 py-2">
                          <div className="flex flex-col gap-0.5">
                            {meta.details.length > 0 ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span
                                    tabIndex={0}
                                    className="inline-flex w-fit cursor-help items-center gap-1.5 font-medium text-foreground"
                                  >
                                    <span>{meta.title}</span>
                                    <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent
                                  side="top"
                                  align="start"
                                  className="max-w-sm space-y-1.5 border bg-popover px-3 py-2.5 text-xs leading-relaxed text-popover-foreground shadow-md"
                                >
                                  <div className="font-semibold text-foreground">{meta.title}</div>
                                  <ul className="space-y-1">
                                    {meta.details.map((item) => (
                                      <li key={item.code} className="flex flex-col">
                                        <span className="font-mono text-[11px] font-medium text-foreground">
                                          {item.code}
                                        </span>
                                        <span className="text-muted-foreground">{item.desc}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <span className="font-medium text-foreground">{meta.title}</span>
                            )}
                            {meta.title !== q.name && (
                              <span className="font-mono text-[11px] text-muted-foreground">
                                {q.name}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">{q.length}</td>
                        <td className="px-3 py-2">{q.wait}s</td>
                        <td className="px-3 py-2">{q.processes}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={failedJobsOpen} onOpenChange={setFailedJobsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('dashboard.failedJobs')}</DialogTitle>
            <DialogDescription>{t('dashboard.failedJobsDesc')}</DialogDescription>
          </DialogHeader>
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {failedJobsQuery.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : !failedJobsQuery.data?.data.length ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                {t('dashboard.noFailedJobs')}
              </div>
            ) : (
              failedJobsQuery.data.data.map((job) => (
                <div key={job.id} className="rounded-lg border p-3 text-xs">
                  <div className="flex items-center justify-between font-medium">
                    <span className="font-mono">{job.name || job.id}</span>
                    <span className="text-muted-foreground">{formatTimestamp(job.failed_at)}</span>
                  </div>
                  {job.queue && (
                    <div className="mt-1 text-muted-foreground">Queue: {job.queue}</div>
                  )}
                  {job.exception && (
                    <pre className="mt-2 max-h-28 overflow-auto rounded bg-muted p-2 text-[11px]">
                      {job.exception}
                    </pre>
                  )}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
