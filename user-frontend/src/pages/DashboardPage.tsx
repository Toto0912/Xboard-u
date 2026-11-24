import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  BookOpen,
  ChevronRight,
  CreditCard,
  Link2,
  MessageSquare,
  Plus,
  RefreshCw,
  ShoppingBag,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { fetchNotices, type NoticeItem } from '@/api/notice';
import { fetchUserStat, fetchUserSubscribe } from '@/api/user';
import { MarkdownContent } from '@/components/shared/MarkdownContent';
import { OneClickSubscribeDialog } from '@/components/shared/OneClickSubscribeDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBytes, formatDate } from '@/lib/format';
import { getUserSettings } from '@/lib/settings';

export default function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { title } = getUserSettings();

  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [selectedNotice, setSelectedNotice] = useState<NoticeItem | null>(null);

  const subscribeQuery = useQuery({
    queryKey: ['user-subscribe'],
    queryFn: fetchUserSubscribe,
  });

  const statQuery = useQuery({
    queryKey: ['user-stat'],
    queryFn: fetchUserStat,
  });

  const noticeQuery = useQuery({
    queryKey: ['user-notices'],
    queryFn: () => fetchNotices(1),
  });

  const sub = subscribeQuery.data;
  const stats = statQuery.data ?? [0, 0, 0];
  const notices = noticeQuery.data?.data ?? [];

  const totalBytes = Number(sub?.transfer_enable ?? 0);
  const usedBytes = Number(sub?.u ?? 0) + Number(sub?.d ?? 0);
  const remainingBytes = Math.max(0, totalBytes - usedBytes);
  const usedPct = totalBytes > 0 ? Math.min(100, (usedBytes / totalBytes) * 100) : 0;

  const hasPlan = Boolean(sub?.plan_id && sub?.plan);

  const shortcuts = [
    {
      icon: BookOpen,
      title: t('dashboard.shortcutDocs'),
      desc: t('dashboard.shortcutDocsDesc', { title }),
      onClick: () => navigate('/knowledge'),
    },
    {
      icon: Link2,
      title: t('dashboard.shortcutSubscribe'),
      desc: t('dashboard.shortcutSubscribeDesc'),
      onClick: () => setSubscribeOpen(true),
    },
    {
      icon: ShoppingBag,
      title: t('dashboard.shortcutPlan'),
      desc: t('dashboard.shortcutPlanDesc'),
      onClick: () => navigate('/plan'),
    },
    {
      icon: MessageSquare,
      title: t('dashboard.shortcutTicket'),
      desc: t('dashboard.shortcutTicketDesc'),
      onClick: () => navigate('/ticket'),
    },
  ];

  return (
    <div className="min-w-0 space-y-6">
      {/* Quick Status Strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link
          to="/order"
          className="flex min-w-0 items-center justify-between rounded-xl border bg-card px-4 py-3 shadow-xs transition-colors hover:bg-accent/40"
        >
          <div className="flex items-center gap-2.5">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{t('dashboard.pendingOrders')}</span>
          </div>
          <span className="font-mono text-base font-semibold">{stats[0]}</span>
        </Link>
        <Link
          to="/ticket"
          className="flex min-w-0 items-center justify-between rounded-xl border bg-card px-4 py-3 shadow-xs transition-colors hover:bg-accent/40"
        >
          <div className="flex items-center gap-2.5">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{t('dashboard.openTickets')}</span>
          </div>
          <span className="font-mono text-base font-semibold">{stats[1]}</span>
        </Link>
        <Link
          to="/invite"
          className="flex min-w-0 items-center justify-between rounded-xl border bg-card px-4 py-3 shadow-xs transition-colors hover:bg-accent/40"
        >
          <div className="flex items-center gap-2.5">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{t('dashboard.invitedUsers')}</span>
          </div>
          <span className="font-mono text-base font-semibold">{stats[2]}</span>
        </Link>
      </div>

      {/* Notices */}
      {notices.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4 text-muted-foreground" />
              {t('dashboard.notices')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {notices.map((notice) => (
              <button
                key={notice.id}
                type="button"
                onClick={() => setSelectedNotice(notice)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border bg-muted/25 px-3.5 py-2.5 text-left transition-colors hover:bg-accent/50 cursor-pointer"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium">{notice.title}</span>
                  {notice.tags?.map((tag) => (
                    <Badge key={tag} variant="secondary" className="hidden shrink-0 sm:inline-flex">
                      {tag}
                    </Badge>
                  ))}
                </div>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {formatDate(notice.created_at)}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Main Grid: My Subscription + Shortcuts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('dashboard.mySubscription')}</CardTitle>
            {hasPlan && (
              <CardDescription className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">{sub?.plan?.name}</span>
                {sub?.reset_day != null && (
                  <Badge variant="outline">
                    {t('dashboard.resetEveryDays', { days: sub.reset_day })}
                  </Badge>
                )}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {subscribeQuery.isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : !hasPlan ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/20 px-4 py-10 text-center">
                <div className="text-sm font-medium">{t('dashboard.noSubscription')}</div>
                <p className="max-w-xs text-xs text-muted-foreground">
                  {t('dashboard.noSubscriptionDesc')}
                </p>
                <Button type="button" onClick={() => navigate('/plan')}>
                  <Plus className="h-4 w-4" />
                  {t('dashboard.buySubscription')}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {t('dashboard.usedTraffic')}:{' '}
                      <strong className="font-mono text-foreground">{formatBytes(usedBytes)}</strong>
                    </span>
                    <span className="font-mono text-muted-foreground">
                      {usedPct.toFixed(1)}% · {t('dashboard.totalTraffic')}:{' '}
                      {formatBytes(totalBytes)}
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{ width: `${usedPct}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <div className="rounded-lg border bg-muted/20 p-2.5">
                    <div className="text-muted-foreground">{t('dashboard.remainingTraffic')}</div>
                    <div className="mt-1 font-mono text-sm font-semibold">
                      {formatBytes(remainingBytes)}
                    </div>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-2.5">
                    <div className="text-muted-foreground">{t('dashboard.expiredAt')}</div>
                    <div className="mt-1 font-mono text-sm font-semibold">
                      {sub?.expired_at ? formatDate(sub.expired_at) : t('common.permanent')}
                    </div>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-2.5">
                    <div className="text-muted-foreground">{t('dashboard.deviceLimit')}</div>
                    <div className="mt-1 font-mono text-sm font-semibold">
                      {sub?.device_limit ?? t('common.unlimited')}
                    </div>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-2.5">
                    <div className="text-muted-foreground">{t('dashboard.speedLimit')}</div>
                    <div className="mt-1 font-mono text-sm font-semibold">
                      {sub?.speed_limit ? `${sub.speed_limit} Mbps` : t('common.unlimited')}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button type="button" size="sm" onClick={() => setSubscribeOpen(true)}>
                    <Link2 className="h-3.5 w-3.5" />
                    {t('dashboard.oneClickSubscribe')}
                  </Button>
                  {sub?.plan?.renew && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/plan/${sub.plan_id}`)}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      {t('dashboard.renewSubscription')}
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => navigate('/plan')}
                  >
                    <ShoppingBag className="h-3.5 w-3.5" />
                    {t('dashboard.changePlan')}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('dashboard.shortcuts')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {shortcuts.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.title}
                  type="button"
                  onClick={item.onClick}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border bg-muted/20 px-4 py-3 text-left transition-colors hover:bg-accent/50 cursor-pointer"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{item.title}</div>
                      <div className="truncate text-xs text-muted-foreground">{item.desc}</div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <OneClickSubscribeDialog
        open={subscribeOpen}
        onOpenChange={setSubscribeOpen}
        subscribeUrl={sub?.subscribe_url || ''}
      />

      <Dialog open={Boolean(selectedNotice)} onOpenChange={(o) => !o && setSelectedNotice(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedNotice?.title}</DialogTitle>
            <DialogDescription>
              {selectedNotice ? formatDate(selectedNotice.created_at) : ''}
            </DialogDescription>
          </DialogHeader>
          {selectedNotice?.img_url && (
            <img
              src={selectedNotice.img_url}
              alt={selectedNotice.title}
              className="max-h-56 w-full rounded-lg object-cover"
            />
          )}
          <MarkdownContent content={selectedNotice?.content || ''} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
