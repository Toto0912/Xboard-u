import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { cancelOrder, fetchOrders, type OrderItem } from '@/api/order';
import { fetchUserCommConfig } from '@/api/user';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatTimestamp } from '@/lib/format';

function getOrderStatusVariant(status: number) {
  if (status === 3 || status === 4) return 'success' as const;
  if (status === 0 || status === 1) return 'warning' as const;
  return 'secondary' as const;
}

export default function OrderListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [cancelTarget, setCancelTarget] = useState<OrderItem | null>(null);

  const ordersQuery = useQuery({
    queryKey: ['user-orders'],
    queryFn: fetchOrders,
  });

  const commQuery = useQuery({
    queryKey: ['user-comm-config'],
    queryFn: fetchUserCommConfig,
  });

  const symbol = commQuery.data?.currency_symbol || '¥';

  const cancelMutation = useMutation({
    mutationFn: (tradeNo: string) => cancelOrder(tradeNo),
    onSuccess: () => {
      toast.success(t('order.cancelSuccess'));
      setCancelTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['user-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['user-stat'] });
    },
  });

  const orders = ordersQuery.data ?? [];

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{t('order.title')}</h1>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void ordersQuery.refetch()}
          disabled={ordersQuery.isFetching}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${ordersQuery.isFetching ? 'animate-spin' : ''}`} />
          {t('common.refresh')}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {ordersQuery.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <CreditCard className="h-8 w-8 opacity-40" />
              <span>{t('common.noData')}</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">{t('order.tradeNo')}</th>
                    <th className="px-4 py-3 font-medium">{t('order.planName')}</th>
                    <th className="px-4 py-3 font-medium">{t('order.period')}</th>
                    <th className="px-4 py-3 font-medium">{t('order.amount')}</th>
                    <th className="px-4 py-3 font-medium">{t('order.status')}</th>
                    <th className="px-4 py-3 font-medium">{t('order.createdAt')}</th>
                    <th className="px-4 py-3 text-right font-medium">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {orders.map((order) => (
                    <tr key={order.trade_no} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs">{order.trade_no}</td>
                      <td className="px-4 py-3 font-medium">{order.plan?.name || '—'}</td>
                      <td className="px-4 py-3 text-xs">
                        {t(`plan.periods.${order.period}`, { defaultValue: order.period })}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {formatCurrency(order.total_amount, symbol)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={getOrderStatusVariant(order.status)}>
                          {t(`order.statuses.${order.status}`, {
                            defaultValue: String(order.status),
                          })}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {formatTimestamp(order.created_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={order.status === 0 ? 'default' : 'outline'}
                            className="h-7 px-2.5 text-xs"
                            onClick={() => navigate(`/order/${order.trade_no}`)}
                          >
                            {order.status === 0 ? t('order.goPay') : t('common.detail')}
                          </Button>
                          {order.status === 0 && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                              onClick={() => setCancelTarget(order)}
                            >
                              {t('order.cancelOrder')}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onOpenChange={(o) => !o && setCancelTarget(null)}
        title={t('order.cancelOrder')}
        description={t('order.cancelConfirm')}
        variant="destructive"
        loading={cancelMutation.isPending}
        onConfirm={() => cancelTarget && cancelMutation.mutate(cancelTarget.trade_no)}
      />
    </div>
  );
}
