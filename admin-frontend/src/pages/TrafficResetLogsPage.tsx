import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Download, RefreshCw, Search } from 'lucide-react';
import { fetchTrafficResetLogs } from '@/api/trafficReset';
import { DataTablePagination } from '@/components/shared/DataTablePagination';
import { DatePicker } from '@/components/shared/DateTimePicker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

function formatResetTime(raw: string): string {
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default function TrafficResetLogsPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();

  const [userEmail, setUserEmail] = useState(() => searchParams.get('user_email') || '');
  const [resetType, setResetType] = useState<string>('all');
  const [triggerSource, setTriggerSource] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    const paramEmail = searchParams.get('user_email');
    if (paramEmail) setUserEmail(paramEmail);
  }, [searchParams]);

  const logsQuery = useQuery({
    queryKey: [
      'traffic-reset-logs',
      page,
      pageSize,
      userEmail,
      resetType,
      triggerSource,
      startDate,
      endDate,
    ],
    queryFn: () =>
      fetchTrafficResetLogs({
        page,
        per_page: pageSize,
        ...(userEmail.trim() ? { user_email: userEmail.trim() } : {}),
        ...(resetType !== 'all' ? { reset_type: resetType } : {}),
        ...(triggerSource !== 'all' ? { trigger_source: triggerSource } : {}),
        ...(startDate ? { start_date: startDate } : {}),
        ...(endDate ? { end_date: endDate } : {}),
      }),
  });

  const logs = logsQuery.data?.data ?? [];
  const total = logsQuery.data?.pagination?.total ?? 0;

  const exportCsv = () => {
    const header = ['ID', 'User ID', 'Email', 'Source', 'Reset Type', 'Cleared Traffic', 'Time'];
    const rows = logs.map((l) => [
      l.id,
      l.user_id,
      l.user_email,
      l.trigger_source_name || l.trigger_source,
      l.reset_type_name || l.reset_type,
      l.old_traffic?.formatted || '0 B',
      l.reset_time,
    ]);
    const csv =
      '\uFEFF' +
      [header, ...rows]
        .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
        .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `traffic_reset_logs_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t('nav.trafficResetLogs')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('trafficReset.pageSubtitle')}</p>
      </div>

      {/* Filters Row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1 max-w-[220px]">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={userEmail}
            onChange={(e) => {
              setUserEmail(e.target.value);
              setPage(1);
            }}
            placeholder={t('userManage.searchPlaceholder')}
            className="h-8 pl-8 text-xs"
          />
        </div>

        <Select
          value={resetType}
          onValueChange={(v) => {
            setResetType(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-8 w-[135px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('trafficReset.allTypes')}</SelectItem>
            <SelectItem value="monthly">{t('trafficReset.types.monthly')}</SelectItem>
            <SelectItem value="first_day_month">{t('trafficReset.types.first_day_month')}</SelectItem>
            <SelectItem value="yearly">{t('trafficReset.types.yearly')}</SelectItem>
            <SelectItem value="first_day_year">{t('trafficReset.types.first_day_year')}</SelectItem>
            <SelectItem value="manual">{t('trafficReset.types.manual')}</SelectItem>
            <SelectItem value="purchase">{t('trafficReset.types.purchase')}</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={triggerSource}
          onValueChange={(v) => {
            setTriggerSource(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('trafficReset.allSources')}</SelectItem>
            <SelectItem value="auto">{t('trafficReset.sources.auto')}</SelectItem>
            <SelectItem value="manual">{t('trafficReset.sources.manual')}</SelectItem>
            <SelectItem value="cron">{t('trafficReset.sources.cron')}</SelectItem>
            <SelectItem value="api">{t('trafficReset.sources.api')}</SelectItem>
            <SelectItem value="user_access">{t('trafficReset.sources.user_access')}</SelectItem>
          </SelectContent>
        </Select>

        <DatePicker
          value={startDate}
          onChange={(v) => {
            setStartDate(v);
            setPage(1);
          }}
          placeholder={t('trafficReset.startDate')}
          allowClear
          className="h-8 w-[145px]"
        />

        <DatePicker
          value={endDate}
          onChange={(v) => {
            setEndDate(v);
            setPage(1);
          }}
          placeholder={t('trafficReset.endDate')}
          allowClear
          className="h-8 w-[145px]"
        />

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={exportCsv}
            disabled={logs.length === 0}
          >
            <Download className="h-3.5 w-3.5" />
            {t('trafficReset.exportLogs')}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => void logsQuery.refetch()}
            disabled={logsQuery.isFetching}
            title={t('common.refresh')}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${logsQuery.isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border bg-card/60">
        {logsQuery.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <table className="w-full min-w-[780px] text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t('trafficReset.logId')}</th>
                <th className="px-3 py-3 font-medium">{t('trafficReset.user')}</th>
                <th className="px-3 py-3 font-medium">{t('trafficReset.source')}</th>
                <th className="px-3 py-3 font-medium">{t('trafficReset.type')}</th>
                <th className="px-3 py-3 font-medium">{t('trafficReset.clearedTraffic')}</th>
                <th className="px-4 py-3 font-medium">{t('trafficReset.resetTime')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                    {t('trafficReset.empty')}
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">#{log.id}</td>
                    <td className="px-3 py-3 text-xs">
                      <span className="font-medium">{log.user_email}</span>
                      <span className="ml-1.5 font-mono text-muted-foreground">
                        #{log.user_id}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant="outline">
                        {log.trigger_source_name || log.trigger_source}
                      </Badge>
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant="secondary">
                        {log.reset_type_name || log.reset_type}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">
                      {log.old_traffic?.formatted ?? '0 B'}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {formatResetTime(log.reset_time)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      <DataTablePagination
        total={total}
        page={page}
        pageSize={pageSize}
        pageSizeOptions={[10, 20, 50, 100]}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </div>
  );
}
