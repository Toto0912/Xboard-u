import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowUpDown,
  CheckCircle2,
  Copy,
  Eye,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { copyText } from '@/lib/clipboard';
import {
  assignOrder,
  cancelOrder,
  fetchOrders,
  getOrderDetail,
  markOrderPaid,
  updateOrderCommission,
  type OrderFilter,
} from '@/api/order';
import { fetchPlans, LEGACY_PERIOD_KEYS, LEGACY_PERIOD_MAP } from '@/api/plan';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataTablePagination } from '@/components/shared/DataTablePagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { getPanelSettings } from '@/lib/settings';
import { formatCurrency, formatTimestamp, parseCents } from '@/lib/format';

const ORDER_STATUS_BADGE: Record<number, string> = {
  0: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  1: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30',
  2: 'bg-zinc-500/15 text-zinc-500 border-zinc-500/30',
  3: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  4: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30',
};

const COMMISSION_STATUS_BADGE: Record<number, string> = {
  0: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  1: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30',
  2: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  3: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30',
};

export default function OrderManagePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [userIdFilter, setUserIdFilter] = useState<string>(() => searchParams.get('user_id') || '');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [commissionFilter, setCommissionFilter] = useState<string>('all');
  const [onlyCommission, setOnlyCommission] = useState(false);
  const [sortField, setSortField] = useState<string>('created_at');
  const [sortDesc, setSortDesc] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignEmail, setAssignEmail] = useState('');
  const [assignPlanId, setAssignPlanId] = useState('');
  const [assignPeriod, setAssignPeriod] = useState('month_price');
  const [assignAmountYuan, setAssignAmountYuan] = useState('');

  const [detailOrderId, setDetailOrderId] = useState<number | null>(null);
  const [confirmPaidTradeNo, setConfirmPaidTradeNo] = useState<string | null>(null);
  const [confirmCancelTradeNo, setConfirmCancelTradeNo] = useState<string | null>(null);

  useEffect(() => {
    const uid = searchParams.get('user_id');
    if (uid) setUserIdFilter(uid);
  }, [searchParams]);

  useEffect(() => {
    const next = searchDraft.trim();
    if (next === search) return;
    const apply = () => {
      setPage(1);
      setSearch(next);
    };
    if (!next) {
      apply();
      return;
    }
    const timer = window.setTimeout(apply, 250);
    return () => window.clearTimeout(timer);
  }, [searchDraft, search]);

  const filters = useMemo<OrderFilter[]>(() => {
    const arr: OrderFilter[] = [];
    const q = search.trim();
    if (q) {
      arr.push({ id: 'trade_no', value: `like:${q}` });
    }
    if (userIdFilter.trim()) {
      const val = userIdFilter.startsWith('eq:') ? userIdFilter : `eq:${userIdFilter}`;
      arr.push({ id: 'user_id', value: val });
    }
    if (typeFilter !== 'all') {
      arr.push({ id: 'type', value: `eq:${typeFilter}` });
    }
    if (statusFilter !== 'all') {
      arr.push({ id: 'status', value: `eq:${statusFilter}` });
    }
    if (commissionFilter !== 'all') {
      arr.push({ id: 'commission_status', value: `eq:${commissionFilter}` });
    }
    return arr;
  }, [search, userIdFilter, typeFilter, statusFilter, commissionFilter]);

  const ordersQuery = useQuery({
    queryKey: ['admin-orders', page, pageSize, onlyCommission, filters, sortField, sortDesc],
    queryFn: () =>
      fetchOrders({
        current: page,
        pageSize,
        is_commission: onlyCommission || undefined,
        filter: filters.length > 0 ? filters : undefined,
        sort: [{ id: sortField, desc: sortDesc }],
      }),
  });

  const plansQuery = useQuery({
    queryKey: ['admin-plans'],
    queryFn: fetchPlans,
  });

  const detailQuery = useQuery({
    queryKey: ['admin-order-detail', detailOrderId],
    queryFn: () => getOrderDetail(detailOrderId!),
    enabled: Boolean(detailOrderId),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['admin-orders'] });

  const assignMutation = useMutation({
    mutationFn: assignOrder,
    onSuccess: () => {
      toast.success(t('order.assignSuccess'));
      setAssignOpen(false);
      invalidate();
    },
  });

  const paidMutation = useMutation({
    mutationFn: markOrderPaid,
    onSuccess: () => {
      toast.success(t('common.operationSuccess'));
      setConfirmPaidTradeNo(null);
      invalidate();
    },
  });

  const cancelMutation = useMutation({
    mutationFn: cancelOrder,
    onSuccess: () => {
      toast.success(t('common.operationSuccess'));
      setConfirmCancelTradeNo(null);
      invalidate();
    },
  });

  const commissionMutation = useMutation({
    mutationFn: updateOrderCommission,
    onSuccess: () => {
      toast.success(t('common.operationSuccess'));
      invalidate();
    },
  });

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDesc((v) => !v);
    else {
      setSortField(field);
      setSortDesc(true);
    }
  };

  const handlePlanOrPeriodChange = (nextPlanId: string, nextPeriod: string) => {
    setAssignPlanId(nextPlanId);
    setAssignPeriod(nextPeriod);
    const plan = (plansQuery.data ?? []).find((p) => String(p.id) === nextPlanId);
    if (!plan?.prices) return;
    const newPeriodKey = Object.entries(LEGACY_PERIOD_MAP).find(
      ([, legacy]) => legacy === nextPeriod,
    )?.[0];
    if (newPeriodKey && plan.prices[newPeriodKey as keyof typeof plan.prices] != null) {
      setAssignAmountYuan(String(plan.prices[newPeriodKey as keyof typeof plan.prices]));
    }
  };

  const handleAssignSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const email = assignEmail.trim();
    const pid = Number(assignPlanId);
    const cents = parseCents(assignAmountYuan);
    if (!email || !pid || cents === null || cents < 0) {
      toast.error(t('order.assignValidationError'));
      return;
    }
    assignMutation.mutate({
      email,
      plan_id: pid,
      period: assignPeriod,
      total_amount: cents,
    });
  };

  const orders = ordersQuery.data?.data ?? [];
  const total = ordersQuery.data?.total ?? 0;
  useEffect(() => {
    if (ordersQuery.data) setPage((current) => Math.min(current, Math.max(1, Math.ceil(total / pageSize))));
  }, [ordersQuery.data, total, pageSize]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t('nav.orderManagement')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('order.pageSubtitle')}</p>
      </div>

      {/* Single-Row Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setAssignEmail('');
            setAssignPlanId(plansQuery.data?.[0] ? String(plansQuery.data[0].id) : '');
            setAssignPeriod('month_price');
            setAssignAmountYuan('');
            setAssignOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          {t('order.create')}
        </Button>

        <div className="relative min-w-[160px] flex-1 max-w-[210px]">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder={t('order.searchPlaceholder')}
            className="h-8 pl-8 text-xs"
          />
        </div>

        <Select
          value={typeFilter}
          onValueChange={(v) => {
            setTypeFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-8 w-[105px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('order.allTypes')}</SelectItem>
            <SelectItem value="1">{t('order.types.1')}</SelectItem>
            <SelectItem value="2">{t('order.types.2')}</SelectItem>
            <SelectItem value="3">{t('order.types.3')}</SelectItem>
            <SelectItem value="4">{t('order.types.4')}</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-8 w-[110px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('order.allStatuses')}</SelectItem>
            <SelectItem value="0">{t('order.statuses.0')}</SelectItem>
            <SelectItem value="1">{t('order.statuses.1')}</SelectItem>
            <SelectItem value="2">{t('order.statuses.2')}</SelectItem>
            <SelectItem value="3">{t('order.statuses.3')}</SelectItem>
            <SelectItem value="4">{t('order.statuses.4')}</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={commissionFilter}
          onValueChange={(v) => {
            setCommissionFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-8 w-[115px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('order.allCommissions')}</SelectItem>
            <SelectItem value="0">{t('order.commissions.0')}</SelectItem>
            <SelectItem value="1">{t('order.commissions.1')}</SelectItem>
            <SelectItem value="2">{t('order.commissions.2')}</SelectItem>
            <SelectItem value="3">{t('order.commissions.3')}</SelectItem>
          </SelectContent>
        </Select>

        <label className="flex items-center gap-1.5 rounded-md border bg-[var(--input-bg)] px-2.5 py-1 text-xs">
          <Switch
            checked={onlyCommission}
            onCheckedChange={(v) => {
              setOnlyCommission(v);
              setPage(1);
            }}
          />
          <span>{t('order.onlyCommission')}</span>
        </label>

        {userIdFilter && (
          <Badge variant="secondary" className="gap-1 text-xs">
            User #{userIdFilter.replace(/^eq:/, '')}
            <button
              type="button"
              className="ml-1 hover:text-foreground cursor-pointer"
              onClick={() => setUserIdFilter('')}
            >
              ×
            </button>
          </Badge>
        )}

        <Button
          variant="outline"
          size="icon"
          className="ml-auto h-8 w-8"
          onClick={() => void ordersQuery.refetch()}
          disabled={ordersQuery.isFetching}
          title={t('common.refresh')}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${ordersQuery.isFetching ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border bg-card/60">
        {searchDraft.trim() !== search || ordersQuery.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <table className="w-full min-w-[1020px] text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t('order.tradeNo')}</th>
                <th className="px-3 py-3 font-medium">{t('order.type')}</th>
                <th className="px-3 py-3 font-medium">{t('order.plan')}</th>
                <th className="px-3 py-3 font-medium">{t('order.period')}</th>
                <th className="px-3 py-3 font-medium">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                    onClick={() => toggleSort('total_amount')}
                  >
                    {t('order.amount')}
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-3 py-3 font-medium">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                    onClick={() => toggleSort('status')}
                  >
                    {t('order.status')}
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-3 py-3 font-medium">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                    onClick={() => toggleSort('commission_balance')}
                  >
                    {t('order.commissionAmount')}
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-3 py-3 font-medium">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                    onClick={() => toggleSort('commission_status')}
                  >
                    {t('order.commissionStatus')}
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-3 py-3 font-medium">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                    onClick={() => toggleSort('created_at')}
                  >
                    {t('order.createdAt')}
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="sticky right-0 w-20 border-l bg-card/95 px-3 py-3 text-right font-medium backdrop-blur-sm">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-sm text-muted-foreground">
                    {t('order.empty')}
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          className="text-left text-[var(--xb-accent)] hover:underline cursor-pointer"
                          onClick={() => setDetailOrderId(order.id)}
                        >
                          {order.trade_no}
                        </button>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground cursor-pointer"
                          onClick={() => void copyText(order.trade_no)}
                          title={t('common.copy')}
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs">{t(`order.types.${order.type}`)}</td>
                    <td className="px-3 py-3 text-xs font-medium">
                      {order.plan?.name || `#${order.plan_id}`}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {t(`order.periods.${order.period}`, { defaultValue: order.period })}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">
                      {formatCurrency(order.total_amount)}
                    </td>
                    <td className="px-3 py-3">
                      <Badge
                        variant="outline"
                        className={ORDER_STATUS_BADGE[order.status] ?? ''}
                      >
                        {t(`order.statuses.${order.status}`)}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                      {order.commission_balance
                        ? formatCurrency(order.commission_balance)
                        : '—'}
                    </td>
                    <td className="px-3 py-3">
                      {order.invite_user_id ? (
                        <Badge
                          variant="outline"
                          className={COMMISSION_STATUS_BADGE[order.commission_status] ?? ''}
                        >
                          {t(`order.commissions.${order.commission_status}`)}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      {formatTimestamp(order.created_at)}
                    </td>
                    <td className="sticky right-0 border-l bg-card/95 px-3 py-3 text-right backdrop-blur-sm">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setDetailOrderId(order.id)}>
                            <Eye className="mr-2 h-4 w-4" />
                            {t('order.detail')}
                          </DropdownMenuItem>
                          {order.status === 0 && (
                            <>
                              <DropdownMenuItem
                                onClick={() => setConfirmPaidTradeNo(order.trade_no)}
                              >
                                <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-500" />
                                {t('order.markPaid')}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setConfirmCancelTradeNo(order.trade_no)}
                              >
                                <XCircle className="mr-2 h-4 w-4" />
                                {t('order.cancelOrder')}
                              </DropdownMenuItem>
                            </>
                          )}
                          {order.invite_user_id && order.commission_status !== 2 && (
                            <>
                              <DropdownMenuSeparator />
                              {([3, 4].includes(order.status) ? [0, 1, 3] : [0, 3]).map((st) => (
                                <DropdownMenuItem
                                  key={st}
                                  onClick={() =>
                                    commissionMutation.mutate({
                                      trade_no: order.trade_no,
                                      commission_status: st,
                                    })
                                  }
                                >
                                  {t('order.setCommissionTo')} · {t(`order.commissions.${st}`)}
                                </DropdownMenuItem>
                              ))}
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
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

      {/* Order Assign Dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('order.assignTitle')}</DialogTitle>
            <DialogDescription>{t('order.assignDesc')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAssignSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('order.userEmail')}</Label>
              <Input
                type="email"
                value={assignEmail}
                onChange={(e) => setAssignEmail(e.target.value)}
                placeholder="user@example.com"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t('order.plan')}</Label>
              <Select
                value={assignPlanId}
                onValueChange={(v) => handlePlanOrPeriodChange(v, assignPeriod)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('order.selectPlan')} />
                </SelectTrigger>
                <SelectContent>
                  {(plansQuery.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t('order.period')}</Label>
              <Select
                value={assignPeriod}
                onValueChange={(v) => handlePlanOrPeriodChange(assignPlanId, v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEGACY_PERIOD_KEYS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {t(`order.periods.${p}`, { defaultValue: p })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t('order.amount')}</Label>
              <div className="relative flex items-center">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  className="pr-12 font-mono text-xs"
                  value={assignAmountYuan}
                  onChange={(e) => setAssignAmountYuan(e.target.value)}
                  placeholder="0.00"
                />
                <span className="pointer-events-none absolute right-3 text-xs text-muted-foreground">
                  {getPanelSettings().currency}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setAssignOpen(false)}
                disabled={assignMutation.isPending}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={assignMutation.isPending}>
                {assignMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('common.confirm')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Order Detail Dialog */}
      <Dialog open={Boolean(detailOrderId)} onOpenChange={(o) => !o && setDetailOrderId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('order.detailTitle')}</DialogTitle>
            <DialogDescription className="font-mono text-xs">
              {detailQuery.data?.trade_no}
            </DialogDescription>
          </DialogHeader>
          {detailQuery.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : detailQuery.isError ? (
            <p role="alert" className="text-sm text-destructive">{detailQuery.error.message}</p>
          ) : detailQuery.data ? (
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-muted-foreground">{t('order.userEmail')}</span>
                <p className="mt-0.5 font-medium">{detailQuery.data.user?.email || `#${detailQuery.data.user_id}`}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t('order.plan')}</span>
                <p className="mt-0.5 font-medium">{detailQuery.data.plan?.name || `#${detailQuery.data.plan_id}`}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t('order.amount')}</span>
                <p className="mt-0.5 font-mono font-medium">
                  {formatCurrency(detailQuery.data.total_amount)}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">{t('order.discountAmount')}</span>
                <p className="mt-0.5 font-mono">
                  {formatCurrency(detailQuery.data.discount_amount)}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">{t('order.balanceAmount')}</span>
                <p className="mt-0.5 font-mono">
                  {formatCurrency(detailQuery.data.balance_amount)}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">{t('order.paidAt')}</span>
                <p className="mt-0.5">{formatTimestamp(detailQuery.data.paid_at)}</p>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">{t('order.callbackNo')}</span>
                <p className="mt-0.5 font-mono">{detailQuery.data.callback_no || '—'}</p>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(confirmPaidTradeNo)}
        onOpenChange={(o) => !o && setConfirmPaidTradeNo(null)}
        title={t('order.markPaid')}
        description={t('order.markPaidConfirm', { tradeNo: confirmPaidTradeNo ?? '' })}
        destructive={false}
        loading={paidMutation.isPending}
        onConfirm={() => confirmPaidTradeNo && paidMutation.mutate(confirmPaidTradeNo)}
      />

      <ConfirmDialog
        open={Boolean(confirmCancelTradeNo)}
        onOpenChange={(o) => !o && setConfirmCancelTradeNo(null)}
        title={t('order.cancelOrder')}
        description={t('order.cancelOrderConfirm', { tradeNo: confirmCancelTradeNo ?? '' })}
        loading={cancelMutation.isPending}
        onConfirm={() => confirmCancelTradeNo && cancelMutation.mutate(confirmCancelTradeNo)}
      />
    </div>
  );
}
