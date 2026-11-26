import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, CircleX, ExternalLink, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  cancelOrder,
  checkOrderStatus,
  checkoutOrder,
  fetchOrderDetail,
  fetchPaymentMethods,
} from '@/api/order';
import { fetchUserCommConfig } from '@/api/user';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { QrCodeBox } from '@/components/shared/QrCodeBox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatTimestamp } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function OrderDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { trade_no } = useParams<{ trade_no: string }>();

  const [selectedMethod, setSelectedMethod] = useState<number | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [redirectPayUrl, setRedirectPayUrl] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const detailQuery = useQuery({
    queryKey: ['order-detail', trade_no],
    queryFn: () => fetchOrderDetail(trade_no!),
    enabled: Boolean(trade_no),
  });

  const methodsQuery = useQuery({
    queryKey: ['payment-methods'],
    queryFn: fetchPaymentMethods,
  });

  const commQuery = useQuery({
    queryKey: ['user-comm-config'],
    queryFn: fetchUserCommConfig,
  });

  const symbol = commQuery.data?.currency_symbol || '¥';
  const order = detailQuery.data;
  const methods = methodsQuery.data ?? [];

  useEffect(() => {
    if (methods.length > 0 && selectedMethod === null) {
      setSelectedMethod(methods[0].id);
    }
  }, [methods, selectedMethod]);

  useEffect(() => {
    if (!polling || !trade_no) return;
    let pending = false;
    let active = true;
    const timer = window.setInterval(async () => {
      if (pending) return;
      pending = true;
      try {
        const status = await checkOrderStatus(trade_no);
        if (!active) return;
        if (status === 1) {
          void queryClient.invalidateQueries({ queryKey: ['order-detail', trade_no] });
        } else if ([2, 3, 4].includes(status)) {
          setPolling(false);
          setQrUrl(null);
          setRedirectPayUrl(null);
          if (status !== 2) toast.success(t('order.paidSuccess'));
          void queryClient.invalidateQueries({ queryKey: ['order-detail', trade_no] });
          void queryClient.invalidateQueries({ queryKey: ['user-subscribe'] });
          void queryClient.invalidateQueries({ queryKey: ['user-stat'] });
        }
      } catch {
        // Retry transient errors on the next interval.
      } finally {
        pending = false;
      }
    }, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [polling, trade_no, queryClient, t]);

  const activeMethodObj = useMemo(
    () => methods.find((m) => m.id === selectedMethod) ?? null,
    [methods, selectedMethod],
  );

  const estimatedFee = useMemo(() => {
    if (!order || !activeMethodObj || order.total_amount <= 0) return 0;
    const fixed = Number(activeMethodObj.handling_fee_fixed ?? 0);
    const pct = Number(activeMethodObj.handling_fee_percent ?? 0);
    return Math.round((order.total_amount * pct) / 100 + fixed);
  }, [order, activeMethodObj]);

  const displayedFee = order?.status === 0 ? estimatedFee : Number(order?.handling_amount ?? 0);

  const checkoutMutation = useMutation({
    mutationFn: () =>
      checkoutOrder({
        trade_no: trade_no!,
        method: order && order.total_amount > 0 ? selectedMethod ?? undefined : undefined,
      }),
    onSuccess: (res) => {
      if (res.type === -1) {
        toast.success(t('order.paidSuccess'));
        void queryClient.invalidateQueries({ queryKey: ['order-detail', trade_no] });
        void queryClient.invalidateQueries({ queryKey: ['user-subscribe'] });
      } else if (res.type === 0 && typeof res.data === 'string') {
        setQrUrl(res.data);
        setPolling(true);
      } else if (res.type === 1 && typeof res.data === 'string') {
        let destination: URL;
        try {
          destination = new URL(res.data);
          if (!['https:', 'http:'].includes(destination.protocol) || destination.username || destination.password) throw new Error();
        } catch {
          toast.error(t('order.invalidPaymentLink', { defaultValue: 'Invalid payment link' }));
          return;
        }
        setRedirectPayUrl(destination.href);
        setPolling(true);
        window.open(destination.href, '_blank', 'noopener,noreferrer');
      }
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelOrder(trade_no!),
    onSuccess: () => {
      toast.success(t('order.cancelSuccess'));
      setCancelOpen(false);
      setPolling(false);
      setQrUrl(null);
      setRedirectPayUrl(null);
      void queryClient.invalidateQueries({ queryKey: ['order-detail', trade_no] });
      void queryClient.invalidateQueries({ queryKey: ['user-orders'] });
    },
  });

  if (detailQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={() => navigate('/order')}>
          <ArrowLeft className="h-4 w-4" />
          {t('common.back')}
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">{t('order.detailTitle')}</h1>
      </div>

      {order && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">{order.plan?.name || '—'}</CardTitle>
                <div className="mt-1 font-mono text-xs text-muted-foreground">{order.trade_no}</div>
              </div>
              <Badge variant={order.status === 3 ? 'success' : order.status === 0 ? 'warning' : 'secondary'}>
                {t(`order.statuses.${order.status}`, { defaultValue: String(order.status) })}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('order.period')}</span>
                <span>{t(`plan.periods.${order.period}`, { defaultValue: order.period })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('order.createdAt')}</span>
                <span className="font-mono text-xs">{formatTimestamp(order.created_at)}</span>
              </div>
              {Number(order.discount_amount ?? 0) > 0 && (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                  <span>{t('order.discountAmount')}</span>
                  <span className="font-mono">-{formatCurrency(order.discount_amount, symbol)}</span>
                </div>
              )}
              {Number(order.balance_amount ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('order.balanceDeduction')}</span>
                  <span className="font-mono">-{formatCurrency(order.balance_amount, symbol)}</span>
                </div>
              )}
              {Number(order.surplus_amount ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('order.surplusDeduction')}</span>
                  <span className="font-mono">-{formatCurrency(order.surplus_amount, symbol)}</span>
                </div>
              )}
              {displayedFee > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('order.handlingFee')}</span>
                  <span className="font-mono">
                    {formatCurrency(displayedFee, symbol)}
                  </span>
                </div>
              )}
              <div className="flex justify-between border-t pt-3 text-base font-semibold">
                <span>{t('order.amount')}</span>
                <span className="font-mono">
                  {formatCurrency(
                    order.total_amount + displayedFee,
                    symbol,
                  )}
                </span>
              </div>
            </CardContent>
          </Card>

          {order.status === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('order.paymentMethod')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {order.total_amount > 0 && (
                  <div className="space-y-2">
                    {methods.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setSelectedMethod(m.id)}
                        className={cn(
                          'flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition-colors cursor-pointer',
                          selectedMethod === m.id
                            ? 'border-primary bg-primary/5 ring-1 ring-primary'
                            : 'hover:bg-accent/50',
                        )}
                      >
                        <div className="flex items-center gap-2">
                          {m.icon && (
                            <img src={m.icon} alt={m.name} className="h-5 w-5 rounded object-contain" />
                          )}
                          <span className="font-medium">{m.name}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {redirectPayUrl && (
                  <Button type="button" variant="outline" className="w-full" asChild>
                    <a href={redirectPayUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" />
                      {t('order.openPayUrl')}
                    </a>
                  </Button>
                )}

                <Button
                  type="button"
                  className="w-full"
                  disabled={
                    checkoutMutation.isPending || (order.total_amount > 0 && selectedMethod === null)
                  }
                  onClick={() => checkoutMutation.mutate()}
                >
                  {checkoutMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t('order.payNow')}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-xs text-destructive hover:text-destructive"
                  onClick={() => setCancelOpen(true)}
                >
                  {t('order.cancelOrder')}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center">
                {order.status === 2 ? <CircleX className="h-8 w-8 text-muted-foreground" />
                  : order.status === 1 ? <Loader2 className="h-8 w-8 animate-spin" />
                  : <CheckCircle2 className="h-8 w-8 text-emerald-500" /> }
                <div className="text-sm font-medium">
                  {t(`order.statuses.${order.status}`, { defaultValue: String(order.status) })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Dialog
        open={Boolean(qrUrl)}
        onOpenChange={(o) => {
          if (!o) {
            setQrUrl(null);
            setPolling(false);
          }
        }}
      >
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle>{t('order.scanToPay')}</DialogTitle>
            <DialogDescription>{t('order.waitingPayment')}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-2">
            {qrUrl && <QrCodeBox value={qrUrl} size={220} />}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>{t('order.waitingPayment')}</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={t('order.cancelOrder')}
        description={t('order.cancelConfirm')}
        variant="destructive"
        loading={cancelMutation.isPending}
        onConfirm={() => cancelMutation.mutate()}
      />
    </div>
  );
}
