import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { fetchUserInfoById, fetchUserTrafficStats, type UserRecord } from '@/api/user';
import { DataTablePagination } from '@/components/shared/DataTablePagination';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBytes, getTrafficUsageTone } from '@/lib/format';
import { cn } from '@/lib/utils';

interface UserTrafficLogsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserRecord | null;
}

function formatRecordDate(ts: number, recordType?: string): string {
  const num = Number(ts);
  if (!Number.isFinite(num) || num <= 0) return '—';
  const d = new Date(num > 1e12 ? num : num * 1000);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  if (recordType === 'm') {
    return `${year}-${month}`;
  }
  return `${year}-${month}-${pad(d.getDate())}`;
}

/** Modal displaying a user's current traffic summary and paginated daily/monthly usage records. */
export function UserTrafficLogsDialog({
  open,
  onOpenChange,
  user,
}: UserTrafficLogsDialogProps) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    setPage(1);
  }, [user?.id, open]);

  const statsQuery = useQuery({
    queryKey: ['admin-user-traffic-stats', user?.id, page, pageSize],
    queryFn: () =>
      fetchUserTrafficStats({
        user_id: user!.id,
        page,
        pageSize,
      }),
    enabled: open && Boolean(user?.id),
  });

  const userInfoQuery = useQuery({
    queryKey: ['admin-user-info', user?.id],
    queryFn: () => fetchUserInfoById(user!.id),
    enabled: open && Boolean(user?.id),
  });

  const records = statsQuery.data?.data ?? [];
  const total = statsQuery.data?.total ?? 0;
  const currentUser = userInfoQuery.data ?? user;
  const isRefreshing = statsQuery.isFetching || userInfoQuery.isFetching;

  const handleRefresh = () => Promise.all([statsQuery.refetch(), userInfoQuery.refetch()]);

  const uploadBytes = Number(currentUser?.u ?? 0);
  const downloadBytes = Number(currentUser?.d ?? 0);
  const usedBytes = uploadBytes + downloadBytes;
  const totalBytes = Number(currentUser?.transfer_enable ?? 0);
  const trafficTone = getTrafficUsageTone(usedBytes, totalBytes);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-4 overflow-hidden">
        <DialogHeader className="pr-8">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <DialogTitle>{t('userManage.trafficLogs.title')}</DialogTitle>
              {currentUser && (
                <DialogDescription className="truncate font-mono text-xs">
                  {t('userManage.trafficLogs.subtitle', {
                    id: currentUser.id,
                    email: currentUser.email,
                  })}
                </DialogDescription>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0 gap-1.5"
              onClick={() => void handleRefresh()}
              disabled={isRefreshing}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
              {t('common.refresh')}
            </Button>
          </div>
        </DialogHeader>

        {currentUser && (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <div className="rounded-lg border bg-muted/20 px-3 py-2">
              <div className="text-[11px] text-muted-foreground">
                {t('userManage.trafficLogs.currentUpload')}
              </div>
              <div className="mt-0.5 font-mono text-sm font-semibold">
                {formatBytes(uploadBytes)}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 px-3 py-2">
              <div className="text-[11px] text-muted-foreground">
                {t('userManage.trafficLogs.currentDownload')}
              </div>
              <div className="mt-0.5 font-mono text-sm font-semibold">
                {formatBytes(downloadBytes)}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 px-3 py-2">
              <div className="text-[11px] text-muted-foreground">
                {t('userManage.trafficLogs.currentQuota')}
              </div>
              <div className="mt-0.5 font-mono text-sm font-semibold">
                <span className={trafficTone.textClass}>{formatBytes(usedBytes)}</span>
                <span className="text-muted-foreground">
                  {' '}
                  / {totalBytes > 0 ? formatBytes(totalBytes) : '∞'}
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-auto rounded-lg border">
          {statsQuery.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : statsQuery.isError ? (
            <div className="flex flex-col items-center justify-center gap-3 py-14 text-sm text-muted-foreground">
              <AlertTriangle className="h-8 w-8 text-destructive/70" />
              <span>{t('userManage.trafficLogs.loadError')}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => void handleRefresh()}
                disabled={isRefreshing}
              >
                <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
                {t('userManage.trafficLogs.retry')}
              </Button>
            </div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-14 text-sm text-muted-foreground">
              <Activity className="h-8 w-8 opacity-40" />
              <span>{t('userManage.trafficLogs.empty')}</span>
            </div>
          ) : (
            <table className="w-full min-w-[440px] text-sm">
              <thead className="sticky top-0 border-b bg-muted/60 text-left text-xs text-muted-foreground backdrop-blur-sm">
                <tr>
                  <th className="whitespace-nowrap px-4 py-2.5 font-medium">
                    {t('userManage.trafficLogs.recordDate')}
                  </th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-medium">
                    {t('userManage.trafficLogs.upload')}
                  </th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-medium">
                    {t('userManage.trafficLogs.download')}
                  </th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-medium">
                    {t('userManage.trafficLogs.rate')}
                  </th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium">
                    {t('userManage.trafficLogs.total')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {records.map((row) => {
                  const rawRate = Number(row.server_rate);
                  const rate = Number.isFinite(rawRate) && rawRate >= 0 ? rawRate : 1;
                  const billedUpload = Number(row.u ?? 0);
                  const billedDownload = Number(row.d ?? 0);
                  const billedTotal = billedUpload + billedDownload;
                  const actualUpload = rate > 0 ? billedUpload / rate : billedUpload;
                  const actualDownload = rate > 0 ? billedDownload / rate : billedDownload;
                  return (
                    <tr key={row.id} className="hover:bg-muted/30">
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">
                        {formatRecordDate(row.record_at, row.record_type)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">
                        {formatBytes(actualUpload)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">
                        {formatBytes(actualDownload)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">
                        {rate}x
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono text-xs font-medium">
                        {formatBytes(billedTotal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {total > 0 && (
          <DataTablePagination
            total={total}
            page={page}
            pageSize={pageSize}
            pageSizeOptions={[10, 20, 50]}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
