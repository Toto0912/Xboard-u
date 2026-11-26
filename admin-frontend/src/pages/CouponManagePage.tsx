import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ArrowUpDown,
  Copy,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { copyText } from '@/lib/clipboard';
import {
  batchGenerateCouponsCsv,
  dropCoupon,
  fetchCoupons,
  saveCoupon,
  toggleCouponShow,
  type CouponRecord,
} from '@/api/coupon';
import { fetchPlans, PLAN_PERIOD_KEYS, LEGACY_PERIOD_MAP } from '@/api/plan';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataTablePagination } from '@/components/shared/DataTablePagination';
import { DateTimePicker } from '@/components/shared/DateTimePicker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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

function toDatetimeLocal(ts: number): string {
  const d = new Date(ts * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(str: string): number {
  const ms = Date.parse(str);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : Math.floor(Date.now() / 1000);
}

export default function CouponManagePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<string>('created_at');
  const [sortDesc, setSortDesc] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CouponRecord | null>(null);
  const [deleting, setDeleting] = useState<CouponRecord | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [generateCount, setGenerateCount] = useState('');
  const [code, setCode] = useState('');
  const [type, setType] = useState<1 | 2>(1);
  const [valueInput, setValueInput] = useState('');
  const [startedAt, setStartedAt] = useState('');
  const [endedAt, setEndedAt] = useState('');
  const [limitUse, setLimitUse] = useState('');
  const [limitUsePerUser, setLimitUsePerUser] = useState('');
  const [limitPeriods, setLimitPeriods] = useState<string[]>([]);
  const [limitPlanIds, setLimitPlanIds] = useState<number[]>([]);

  const filters = useMemo(() => {
    const arr: Array<{ id: string; value: unknown }> = [];
    if (search.trim()) arr.push({ id: 'name', value: search.trim() });
    if (typeFilter !== 'all') arr.push({ id: 'type', value: [Number(typeFilter)] });
    return arr;
  }, [search, typeFilter]);

  const couponsQuery = useQuery({
    queryKey: ['admin-coupons', page, pageSize, filters, sortField, sortDesc],
    queryFn: () =>
      fetchCoupons({
        current: page,
        pageSize,
        filter: filters.length > 0 ? filters : undefined,
        sort: [{ id: sortField, desc: sortDesc }],
      }),
  });

  const plansQuery = useQuery({
    queryKey: ['admin-plans'],
    queryFn: fetchPlans,
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });

  const saveMutation = useMutation({
    mutationFn: saveCoupon,
    onSuccess: () => {
      toast.success(t('common.saveSuccess'));
      setDialogOpen(false);
      invalidate();
    },
  });

  const batchMutation = useMutation({
    mutationFn: batchGenerateCouponsCsv,
    onSuccess: () => {
      toast.success(t('coupon.batchSuccess'));
      setDialogOpen(false);
      invalidate();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: toggleCouponShow,
    onSuccess: () => {
      toast.success(t('common.operationSuccess'));
      invalidate();
    },
  });

  const dropMutation = useMutation({
    mutationFn: dropCoupon,
    onSuccess: () => {
      toast.success(t('common.deleteSuccess'));
      setDeleting(null);
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

  const openCreate = () => {
    const now = Math.floor(Date.now() / 1000);
    setEditing(null);
    setName('');
    setGenerateCount('');
    setCode('');
    setType(1);
    setValueInput('');
    setStartedAt(toDatetimeLocal(now));
    setEndedAt(toDatetimeLocal(now + 30 * 86400));
    setLimitUse('');
    setLimitUsePerUser('');
    setLimitPeriods([]);
    setLimitPlanIds([]);
    setDialogOpen(true);
  };

  const openEdit = (coupon: CouponRecord) => {
    setEditing(coupon);
    setName(coupon.name);
    setGenerateCount('');
    setCode(coupon.code);
    setType(coupon.type);
    setValueInput(
      coupon.type === 1 ? String(coupon.value / 100) : String(coupon.value),
    );
    setStartedAt(toDatetimeLocal(coupon.started_at));
    setEndedAt(toDatetimeLocal(coupon.ended_at));
    setLimitUse(coupon.limit_use != null ? String(coupon.limit_use) : '');
    setLimitUsePerUser(
      coupon.limit_use_with_user != null ? String(coupon.limit_use_with_user) : '',
    );
    const stored = coupon.limit_period ?? [];
    setLimitPeriods(PLAN_PERIOD_KEYS.filter((period) => stored.includes(period) || stored.includes(LEGACY_PERIOD_MAP[period])));
    setLimitPlanIds((coupon.limit_plan_ids ?? []).map(Number));
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const rawVal = Number(valueInput);
    const intVal = type === 1 ? parseCents(valueInput) : rawVal;
    if (!trimmedName || intVal === null || !Number.isSafeInteger(intVal) || intVal <= 0 || (type === 2 && intVal > 100)) {
      toast.error(t('coupon.validationError'));
      return;
    }

    const startTs = fromDatetimeLocal(startedAt);
    const endTs = fromDatetimeLocal(endedAt);
    if (endTs <= startTs) {
      toast.error(t('coupon.dateRangeError'));
      return;
    }

    const countNum = Number(generateCount);
    if (!editing && Number.isFinite(countNum) && countNum > 0) {
      batchMutation.mutate({
        generate_count: Math.min(500, Math.floor(countNum)),
        name: trimmedName,
        type,
        value: intVal,
        started_at: startTs,
        ended_at: endTs,
        limit_use: limitUse.trim() !== '' ? Number(limitUse) : null,
        limit_use_with_user:
          limitUsePerUser.trim() !== '' ? Number(limitUsePerUser) : null,
        limit_plan_ids: limitPlanIds.length > 0 ? limitPlanIds : null,
        limit_period: limitPeriods.length > 0 ? limitPeriods : null,
      });
      return;
    }

    saveMutation.mutate({
      ...(editing ? { id: editing.id } : {}),
      name: trimmedName,
      type,
      value: intVal,
      started_at: startTs,
      ended_at: endTs,
      limit_use: limitUse.trim() !== '' ? Number(limitUse) : null,
      limit_use_with_user:
        limitUsePerUser.trim() !== '' ? Number(limitUsePerUser) : null,
      limit_plan_ids: limitPlanIds.length > 0 ? limitPlanIds : null,
      limit_period: limitPeriods.length > 0 ? limitPeriods : null,
      ...(code.trim() ? { code: code.trim() } : {}),
    });
  };

  const coupons = couponsQuery.data?.data ?? [];
  const total = couponsQuery.data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t('nav.couponManagement')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('coupon.pageSubtitle')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <Button variant="outline" size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          {t('coupon.create')}
        </Button>

        <div className="relative min-w-[200px] flex-1 max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={t('coupon.searchPlaceholder')}
            className="h-8 pl-9 text-xs"
          />
        </div>

        <Select
          value={typeFilter}
          onValueChange={(v) => {
            setTypeFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('coupon.allTypes')}</SelectItem>
            <SelectItem value="1">{t('coupon.typeAmount')}</SelectItem>
            <SelectItem value="2">{t('coupon.typePercent')}</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="icon"
          className="ml-auto h-8 w-8"
          onClick={() => void couponsQuery.refetch()}
          disabled={couponsQuery.isFetching}
          title={t('common.refresh')}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${couponsQuery.isFetching ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card/60">
        {couponsQuery.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <table className="w-full min-w-[960px] text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                    onClick={() => toggleSort('id')}
                  >
                    ID
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-3 py-3 font-medium">{t('coupon.enable')}</th>
                <th className="px-3 py-3 font-medium">{t('coupon.name')}</th>
                <th className="px-3 py-3 font-medium">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                    onClick={() => toggleSort('type')}
                  >
                    {t('coupon.type')}
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-3 py-3 font-medium">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                    onClick={() => toggleSort('code')}
                  >
                    {t('coupon.code')}
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-3 py-3 font-medium">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                    onClick={() => toggleSort('limit_use')}
                  >
                    {t('coupon.limitUse')}
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-3 py-3 font-medium">{t('coupon.limitUsePerUser')}</th>
                <th className="px-3 py-3 font-medium">{t('coupon.validity')}</th>
                <th className="sticky right-0 w-24 border-l bg-card/95 px-4 py-3 text-right font-medium backdrop-blur-sm">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {coupons.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-sm text-muted-foreground">
                    {t('coupon.empty')}
                  </td>
                </tr>
              ) : (
                coupons.map((coupon) => (
                  <tr key={coupon.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      #{coupon.id}
                    </td>
                    <td className="px-3 py-3">
                      <Switch
                        checked={Boolean(coupon.show)}
                        onCheckedChange={() => toggleMutation.mutate(coupon.id)}
                      />
                    </td>
                    <td className="px-3 py-3 font-medium">{coupon.name}</td>
                    <td className="px-3 py-3">
                      <Badge variant="secondary" className="font-mono text-xs">
                        {coupon.type === 1
                          ? `${t('coupon.typeAmount')} · ${formatCurrency(coupon.value)}`
                          : `${t('coupon.typePercent')} · ${coupon.value}%`}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">
                      <div className="flex items-center gap-1.5">
                        <code>{coupon.code}</code>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground cursor-pointer"
                          onClick={() => void copyText(coupon.code)}
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">
                      {coupon.limit_use != null ? coupon.limit_use : '∞'}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">
                      {coupon.limit_use_with_user != null ? coupon.limit_use_with_user : '∞'}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      <div>{formatTimestamp(coupon.started_at)}</div>
                      <div>~ {formatTimestamp(coupon.ended_at)}</div>
                    </td>
                    <td className="sticky right-0 border-l bg-card/95 px-4 py-3 text-right backdrop-blur-sm">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(coupon)}
                          title={t('common.edit')}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleting(coupon)}
                          title={t('common.delete')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
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

      {/* Add / Edit Coupon Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b bg-[var(--xb-heading)] px-6 py-4">
            <DialogTitle>{editing ? t('coupon.editTitle') : t('coupon.createTitle')}</DialogTitle>
            <DialogDescription>{t('coupon.dialogDescription')}</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('coupon.name')} *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('coupon.namePlaceholder')}
                />
              </div>

              {!editing && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('coupon.batchCount')}</Label>
                    <Input
                      type="number"
                      min={1}
                      max={500}
                      value={generateCount}
                      onChange={(e) => setGenerateCount(e.target.value)}
                      placeholder={t('coupon.batchCountPlaceholder')}
                    />
                  </div>
                  {(!generateCount || Number(generateCount) <= 0) && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t('coupon.customCode')}</Label>
                      <Input
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder={t('coupon.customCodePlaceholder')}
                        className="font-mono text-xs"
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('coupon.type')}</Label>
                  <Select value={String(type)} onValueChange={(v) => setType(Number(v) as 1 | 2)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">{t('coupon.typeAmount')}</SelectItem>
                      <SelectItem value="2">{t('coupon.typePercent')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">
                    {type === 1 ? t('coupon.valueYuan') : t('coupon.valuePercent')}
                  </Label>
                  <div className="relative flex items-center">
                    <Input
                      type="number"
                      min={type === 1 ? 0.01 : 1}
                      max={type === 2 ? 100 : undefined}
                      step={type === 1 ? '0.01' : '1'}
                      className="pr-10 font-mono text-xs"
                      value={valueInput}
                      onChange={(e) => setValueInput(e.target.value)}
                    />
                    <span className="pointer-events-none absolute right-3 text-xs text-muted-foreground">
                      {type === 1 ? getPanelSettings().currency_symbol : '%'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      [7, 'preset1Week'],
                      [14, 'preset2Weeks'],
                      [30, 'preset1Month'],
                      [90, 'preset3Months'],
                      [180, 'preset6Months'],
                      [365, 'preset1Year'],
                    ] as const
                  ).map(([days, key]) => (
                    <Button
                      key={days}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => {
                        const now = new Date();
                        const end = new Date(now.getTime() + days * 86_400_000);
                        const fmt = (d: Date) => {
                          const pad = (n: number) => String(n).padStart(2, '0');
                          return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                        };
                        setStartedAt(fmt(now));
                        setEndedAt(fmt(end));
                      }}
                    >
                      {t(`common.datePicker.${key}`)}
                    </Button>
                  ))}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('coupon.startedAt')}</Label>
                    <DateTimePicker value={startedAt} onChange={setStartedAt} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('coupon.endedAt')}</Label>
                    <DateTimePicker value={endedAt} onChange={setEndedAt} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('coupon.limitUse')}</Label>
                  <Input
                    type="number"
                    min={1}
                    value={limitUse}
                    onChange={(e) => setLimitUse(e.target.value)}
                    placeholder={t('plan.unlimited')}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('coupon.limitUsePerUser')}</Label>
                  <Input
                    type="number"
                    min={1}
                    value={limitUsePerUser}
                    onChange={(e) => setLimitUsePerUser(e.target.value)}
                    placeholder={t('plan.unlimited')}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">{t('coupon.limitPeriods')}</Label>
                <div className="flex flex-wrap gap-3 rounded-lg border bg-[var(--input-bg)] p-3">
                  {PLAN_PERIOD_KEYS.map((p) => {
                    const checked = limitPeriods.includes(p);
                    return (
                      <label key={p} className="flex items-center gap-1.5 text-xs">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(c) =>
                            setLimitPeriods(
                              c
                                ? [...limitPeriods, p]
                                : limitPeriods.filter((item) => item !== p),
                            )
                          }
                        />
                        <span>{t(`order.periods.${LEGACY_PERIOD_MAP[p]}`, { defaultValue: p })}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">{t('coupon.limitPlans')}</Label>
                <div className="flex flex-wrap gap-3 rounded-lg border bg-[var(--input-bg)] p-3">
                  {(plansQuery.data ?? []).length === 0 ? (
                    <span className="text-xs text-muted-foreground">{t('plan.empty')}</span>
                  ) : (
                    (plansQuery.data ?? []).map((p) => {
                      const checked = limitPlanIds.includes(p.id);
                      return (
                        <label key={p.id} className="flex items-center gap-1.5 text-xs">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(c) =>
                              setLimitPlanIds(
                                c
                                  ? [...limitPlanIds, p.id]
                                  : limitPlanIds.filter((id) => id !== p.id),
                              )
                            }
                          />
                          <span>{p.name}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t bg-[var(--xb-heading)] px-6 py-3.5">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDialogOpen(false)}
                disabled={saveMutation.isPending || batchMutation.isPending}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={saveMutation.isPending || batchMutation.isPending}
              >
                {(saveMutation.isPending || batchMutation.isPending) && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {t('common.confirm')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t('coupon.deleteTitle')}
        description={t('coupon.deleteDescription', { name: deleting?.name ?? '' })}
        loading={dropMutation.isPending}
        onConfirm={() => deleting && dropMutation.mutate(deleting.id)}
      />
    </div>
  );
}
