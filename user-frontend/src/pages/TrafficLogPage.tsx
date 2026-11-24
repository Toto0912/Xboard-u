import { useQuery } from '@tanstack/react-query';
import { Activity, Info, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { fetchTrafficLogs } from '@/api/user';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBytes, formatDate } from '@/lib/format';

export default function TrafficLogPage() {
  const { t } = useTranslation();

  const logsQuery = useQuery({
    queryKey: ['user-traffic-logs'],
    queryFn: fetchTrafficLogs,
  });

  const logs = logsQuery.data ?? [];

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{t('traffic.title')}</h1>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void logsQuery.refetch()}
          disabled={logsQuery.isFetching}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${logsQuery.isFetching ? 'animate-spin' : ''}`} />
          {t('common.refresh')}
        </Button>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-[var(--xb-border-accent)] bg-[var(--xb-accent-soft)] px-4 py-3 text-xs text-[var(--xb-accent)]">
        <Info className="h-4 w-4 shrink-0" />
        <span>{t('traffic.retentionNotice')}</span>
      </div>

      <Card>
        <CardContent className="p-0">
          {logsQuery.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Activity className="h-8 w-8 opacity-40" />
              <span>{t('common.noData')}</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">{t('traffic.recordTime')}</th>
                    <th className="px-4 py-3 font-medium">{t('traffic.upload')}</th>
                    <th className="px-4 py-3 font-medium">{t('traffic.download')}</th>
                    <th className="px-4 py-3 font-medium">{t('traffic.rate')}</th>
                    <th className="px-4 py-3 text-right font-medium">{t('traffic.total')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {logs.map((row, idx) => {
                    const rawRate = Number(row.server_rate);
                    const rate = Number.isFinite(rawRate) && rawRate >= 0 ? rawRate : 1;
                    const billedUpload = Number(row.u ?? 0);
                    const billedDownload = Number(row.d ?? 0);
                    const billedTotal = billedUpload + billedDownload;
                    const actualUpload = rate > 0 ? billedUpload / rate : billedUpload;
                    const actualDownload = rate > 0 ? billedDownload / rate : billedDownload;
                    return (
                      <tr key={`${row.record_at}-${idx}`} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-mono text-xs">{formatDate(row.record_at)}</td>
                        <td className="px-4 py-3 font-mono text-xs">{formatBytes(actualUpload)}</td>
                        <td className="px-4 py-3 font-mono text-xs">{formatBytes(actualDownload)}</td>
                        <td className="px-4 py-3 font-mono text-xs">{rate}x</td>
                        <td className="px-4 py-3 text-right font-mono text-xs font-medium">
                          {formatBytes(billedTotal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
