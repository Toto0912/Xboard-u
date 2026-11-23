import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  dropPlan,
  fetchPlans,
  PLAN_PERIOD_KEYS,
  savePlan,
  sortPlans,
  updatePlanFlags,
  type PlanPeriodKey,
  type PlanRecord,
} from '@/api/plan';
import { fetchServerGroups } from '@/api/serverGroup';
import { useDragSort } from '@/hooks/useDragSort';
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
import { Textarea } from '@/components/ui/textarea';

type SortKey = 'default' | 'id' | 'users';

const PLAN_DESC_TEMPLATE = `### 套餐特性
- 高速专线节点全解锁
- 支持流媒体与 AI 服务
- 不限设备系统（iOS / Android / Windows / macOS）`;

export default function PlanManagePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('default');
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const dragSort = useDragSort<PlanRecord>();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PlanRecord | null>(null);
  const [deleting, setDeleting] = useState<PlanRecord | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [groupId, setGroupId] = useState<string>('none');
  const [transferEnable, setTransferEnable] = useState('100');
  const [speedLimit, setSpeedLimit] = useState('');
  const [deviceLimit, setDeviceLimit] = useState('');
  const [capacityLimit, setCapacityLimit] = useState('');
  const [resetMethod, setResetMethod] = useState<string>('system');
  const [prices, setPrices] = useState<Partial<Record<PlanPeriodKey, string>>>({});
  const [content, setContent] = useState('');
  const [forceUpdate, setForceUpdate] = useState(false);

  const plansQuery = useQuery({
    queryKey: ['admin-plans'],
    queryFn: fetchPlans,
  });

  const groupsQuery = useQuery({
    queryKey: ['server-groups'],
    queryFn: fetchServerGroups,
  });

  const filteredPlans = useMemo(() => {
    const list = [...(plansQuery.data ?? [])];
    const q = search.trim().toLowerCase();
    const filtered = q
      ? list.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            String(p.id).includes(q) ||
            (p.tags ?? []).some((tag) => tag.toLowerCase().includes(q)),
        )
      : list;

    if (sortKey !== 'default') {
      filtered.sort((a, b) => {
        const cmp =
          sortKey === 'id'
            ? a.id - b.id
            : Number(a.active_users_count ?? 0) - Number(b.active_users_count ?? 0);
        return sortAsc ? cmp : -cmp;
      });
    }
    return filtered;
  }, [plansQuery.data, search, sortKey, sortAsc]);

  const pagedPlans = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredPlans.slice(start, start + pageSize);
  }, [filteredPlans, page, pageSize]);

  const toggleSort = (key: 'id' | 'users') => {
    if (dragSort.isSortMode) return;
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['admin-plans'] });

  const saveMutation = useMutation({
    mutationFn: savePlan,
    onSuccess: () => {
      toast.success(t('common.saveSuccess'));
      setDialogOpen(false);
      invalidate();
    },
  });

  const flagMutation = useMutation({
    mutationFn: updatePlanFlags,
    onSuccess: () => {
      toast.success(t('common.operationSuccess'));
      invalidate();
    },
  });

  const dropMutation = useMutation({
    mutationFn: dropPlan,
    onSuccess: () => {
      toast.success(t('common.deleteSuccess'));
      setDeleting(null);
      invalidate();
    },
  });

  const sortMutation = useMutation({
    mutationFn: sortPlans,
    onSuccess: () => {
      toast.success(t('common.sortSaved'));
      dragSort.exitSortMode();
      invalidate();
    },
  });

  const openCreate = () => {
    setEditing(null);
    setName('');
    setTags([]);
    setTagInput('');
    setGroupId('none');
    setTransferEnable('100');
    setSpeedLimit('');
    setDeviceLimit('');
    setCapacityLimit('');
    setResetMethod('system');
    setPrices({});
    setContent('');
    setForceUpdate(false);
    setDialogOpen(true);
  };

  const openEdit = (plan: PlanRecord) => {
    setEditing(plan);
    setName(plan.name);
    setTags(plan.tags ?? []);
    setTagInput('');
    setGroupId(plan.group_id ? String(plan.group_id) : 'none');
    setTransferEnable(String(plan.transfer_enable ?? 100));
    setSpeedLimit(plan.speed_limit != null ? String(plan.speed_limit) : '');
    setDeviceLimit(plan.device_limit != null ? String(plan.device_limit) : '');
    setCapacityLimit(plan.capacity_limit != null ? String(plan.capacity_limit) : '');
    setResetMethod(
      plan.reset_traffic_method != null ? String(plan.reset_traffic_method) : 'system',
    );
    const nextPrices: Partial<Record<PlanPeriodKey, string>> = {};
    for (const key of PLAN_PERIOD_KEYS) {
      const val = plan.prices?.[key];
      if (val != null && val > 0) {
        nextPrices[key] = String(val);
      }
    }
    setPrices(nextPrices);
    setContent(plan.content ?? '');
    setForceUpdate(false);
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const gb = Math.floor(Number(transferEnable));
    if (!trimmedName) {
      toast.error(t('plan.nameRequired'));
      return;
    }
    if (!Number.isFinite(gb) || gb < 1) {
      toast.error(t('plan.trafficRequired'));
      return;
    }

    const parsedPrices: Partial<Record<PlanPeriodKey, number | null>> = {};
    for (const key of PLAN_PERIOD_KEYS) {
      const raw = (prices[key] ?? '').trim();
      if (raw !== '') {
        const num = Number(raw);
        if (!Number.isFinite(num) || num < 0) {
          toast.error(t('plan.invalidPrice'));
          return;
        }
        if (num > 0) parsedPrices[key] = Math.round(num * 100) / 100;
      }
    }

    saveMutation.mutate({
      ...(editing ? { id: editing.id } : {}),
      name: trimmedName,
      tags,
      group_id: groupId === 'none' ? null : Number(groupId),
      transfer_enable: gb,
      speed_limit: speedLimit.trim() !== '' ? Number(speedLimit) : null,
      device_limit: deviceLimit.trim() !== '' ? Number(deviceLimit) : null,
      capacity_limit: capacityLimit.trim() !== '' ? Number(capacityLimit) : null,
      reset_traffic_method: resetMethod === 'system' ? null : Number(resetMethod),
      prices: parsedPrices,
      content: content.trim() || null,
      ...(editing ? { force_update: forceUpdate } : {}),
    });
  };

  const addTag = () => {
    const val = tagInput.trim();
    if (!val) return;
    if (!tags.includes(val)) setTags([...tags, val]);
    setTagInput('');
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t('plan.pageTitle')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('plan.pageSubtitle')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        {dragSort.isSortMode ? (
          <>
            <p className="text-sm text-muted-foreground">{t('common.sortHintPlan')}</p>
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={dragSort.exitSortMode}
                disabled={sortMutation.isPending}
              >
                {t('common.cancel')}
              </Button>
              <Button
                variant="default"
                size="sm"
                className="h-8"
                onClick={() => sortMutation.mutate(dragSort.draftItems.map((p) => p.id))}
                disabled={sortMutation.isPending}
              >
                {sortMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {t('common.saveSort')}
              </Button>
            </div>
          </>
        ) : (
          <>
            <Button variant="outline" size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              {t('plan.create')}
            </Button>

            <div className="relative min-w-[200px] flex-1 max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder={t('plan.searchPlaceholder')}
                className="h-8 pl-9 text-xs"
              />
            </div>

            <div className="ml-auto flex items-center gap-2">
              {(plansQuery.data?.length ?? 0) > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => {
                    setSortKey('default');
                    dragSort.enterSortMode(plansQuery.data ?? []);
                  }}
                >
                  {t('common.editSort')}
                </Button>
              )}
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => void plansQuery.refetch()}
                disabled={plansQuery.isFetching}
                title={t('common.refresh')}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${plansQuery.isFetching ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card/60">
        {plansQuery.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <table className="w-full min-w-[920px] text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                {dragSort.isSortMode && <th className="w-10 px-2 py-3" />}
                <th className="px-4 py-3 font-medium">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                    onClick={() => toggleSort('id')}
                  >
                    ID
                    {sortKey === 'id' ? (
                      sortAsc ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3" />
                    )}
                  </button>
                </th>
                <th className="px-3 py-3 font-medium">{t('plan.show')}</th>
                <th className="px-3 py-3 font-medium">{t('plan.sell')}</th>
                <th className="px-3 py-3 font-medium">{t('plan.renew')}</th>
                <th className="px-3 py-3 font-medium">{t('plan.name')}</th>
                <th className="px-3 py-3 font-medium">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                    onClick={() => toggleSort('users')}
                  >
                    {t('plan.stats')}
                    {sortKey === 'users' ? (
                      sortAsc ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3" />
                    )}
                  </button>
                </th>
                <th className="px-3 py-3 font-medium">{t('plan.group')}</th>
                <th className="px-3 py-3 font-medium">{t('plan.prices')}</th>
                {!dragSort.isSortMode && (
                  <th className="sticky right-0 w-28 border-l bg-card/95 px-4 py-3 text-right font-medium backdrop-blur-sm">
                    {t('common.actions')}
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {(dragSort.isSortMode ? dragSort.draftItems : pagedPlans).length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-sm text-muted-foreground">
                    {t('plan.empty')}
                  </td>
                </tr>
              ) : (
                (dragSort.isSortMode ? dragSort.draftItems : pagedPlans).map((plan, idx) => {
                  const activePrices = PLAN_PERIOD_KEYS.filter(
                    (k) => plan.prices?.[k] != null && Number(plan.prices[k]) > 0,
                  );
                  const { className: dragRowClass, ...rowDragProps } = dragSort.getRowProps(idx);
                  return (
                    <tr
                      key={plan.id}
                      {...rowDragProps}
                      className={`hover:bg-muted/30${dragRowClass ? ` ${dragRowClass}` : ''}`}
                    >
                      {dragSort.isSortMode && (
                        <td className="px-2 py-3">
                          <div className="flex items-center justify-center">
                            <GripVertical className="h-4 w-4 cursor-move text-muted-foreground" />
                          </div>
                        </td>
                      )}
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        #{plan.id}
                      </td>
                      <td className="px-3 py-3">
                        <Switch
                          checked={Boolean(plan.show)}
                          disabled={dragSort.isSortMode}
                          onCheckedChange={(checked) =>
                            flagMutation.mutate({ id: plan.id, show: checked })
                          }
                        />
                      </td>
                      <td className="px-3 py-3">
                        <Switch
                          checked={Boolean(plan.sell)}
                          disabled={dragSort.isSortMode}
                          onCheckedChange={(checked) =>
                            flagMutation.mutate({ id: plan.id, sell: checked })
                          }
                        />
                      </td>
                      <td className="px-3 py-3">
                        <Switch
                          checked={Boolean(plan.renew)}
                          disabled={dragSort.isSortMode}
                          onCheckedChange={(checked) =>
                            flagMutation.mutate({ id: plan.id, renew: checked })
                          }
                        />
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium">{plan.name}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                          <span>{plan.transfer_enable} GB</span>
                          {(plan.tags ?? []).map((tag) => (
                            <Badge key={tag} variant="secondary" className="px-1.5 py-0 text-[10px]">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <span className="inline-flex items-center gap-1 font-mono">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          {plan.active_users_count ?? 0} / {plan.users_count ?? 0}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {plan.group ? (
                          <Badge variant="outline">{plan.group.name}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {activePrices.slice(0, 3).map((k) => (
                            <Badge key={k} variant="secondary" className="font-mono text-[10px]">
                              {t(`plan.periods.${k}`)}: ¥{Number(plan.prices?.[k]).toFixed(2)}
                            </Badge>
                          ))}
                          {activePrices.length > 3 && (
                            <Badge variant="outline" className="text-[10px]">
                              +{activePrices.length - 3}
                            </Badge>
                          )}
                        </div>
                      </td>
                      {!dragSort.isSortMode && (
                        <td className="sticky right-0 border-l bg-card/95 px-4 py-3 text-right backdrop-blur-sm">
                          <div className="inline-flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEdit(plan)}
                              title={t('common.edit')}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeleting(plan)}
                              title={t('common.delete')}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {!dragSort.isSortMode && (
        <DataTablePagination
          total={filteredPlans.length}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      )}

      {/* Add / Edit Plan Modal */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b bg-[var(--xb-heading)] px-6 py-4">
            <DialogTitle>{editing ? t('plan.editTitle') : t('plan.createTitle')}</DialogTitle>
            <DialogDescription>{t('plan.dialogDescription')}</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('plan.name')}</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('plan.namePlaceholder')}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">{t('plan.tags')}</Label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1">
                      {tag}
                      <button
                        type="button"
                        onClick={() => setTags(tags.filter((item) => item !== tag))}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  <div className="flex items-center gap-1.5">
                    <Input
                      className="h-8 w-40 text-xs"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addTag();
                        }
                      }}
                      placeholder={t('serverNode.addTagPlaceholder')}
                    />
                    <Button type="button" variant="outline" size="sm" className="h-8" onClick={addTag}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">{t('plan.group')}</Label>
                <Select value={groupId} onValueChange={setGroupId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('plan.noGroup')}</SelectItem>
                    {(groupsQuery.data ?? []).map((g) => (
                      <SelectItem key={g.id} value={String(g.id)}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('plan.trafficGb')}</Label>
                  <div className="relative flex items-center">
                    <Input
                      type="number"
                      min={1}
                      className="pr-10 font-mono text-xs"
                      value={transferEnable}
                      onChange={(e) => setTransferEnable(e.target.value)}
                    />
                    <span className="pointer-events-none absolute right-3 text-xs text-muted-foreground">
                      GB
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">{t('plan.speedLimit')}</Label>
                  <div className="relative flex items-center">
                    <Input
                      type="number"
                      min={0}
                      className="pr-14 font-mono text-xs"
                      value={speedLimit}
                      onChange={(e) => setSpeedLimit(e.target.value)}
                      placeholder={t('plan.unlimited')}
                    />
                    <span className="pointer-events-none absolute right-3 text-xs text-muted-foreground">
                      Mbps
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">{t('plan.deviceLimit')}</Label>
                  <Input
                    type="number"
                    min={0}
                    className="font-mono text-xs"
                    value={deviceLimit}
                    onChange={(e) => setDeviceLimit(e.target.value)}
                    placeholder={t('plan.unlimited')}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">{t('plan.capacityLimit')}</Label>
                  <Input
                    type="number"
                    min={0}
                    className="font-mono text-xs"
                    value={capacityLimit}
                    onChange={(e) => setCapacityLimit(e.target.value)}
                    placeholder={t('plan.unlimited')}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">{t('plan.resetMethod')}</Label>
                <Select value={resetMethod} onValueChange={setResetMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system">{t('plan.resetMethods.system')}</SelectItem>
                    <SelectItem value="0">{t('plan.resetMethods.firstDayMonth')}</SelectItem>
                    <SelectItem value="1">{t('plan.resetMethods.monthly')}</SelectItem>
                    <SelectItem value="2">{t('plan.resetMethods.never')}</SelectItem>
                    <SelectItem value="3">{t('plan.resetMethods.firstDayYear')}</SelectItem>
                    <SelectItem value="4">{t('plan.resetMethods.yearly')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 rounded-lg border bg-[var(--xb-panel)] p-4">
                <Label className="text-xs font-semibold">{t('plan.priceSettings')}</Label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {PLAN_PERIOD_KEYS.map((key) => (
                    <div key={key} className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">
                        {t(`plan.periods.${key}`)}
                      </Label>
                      <div className="relative flex items-center">
                        <span className="pointer-events-none absolute left-3 text-xs text-muted-foreground">
                          ¥
                        </span>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          className="h-9 pl-7 font-mono text-xs"
                          value={prices[key] ?? ''}
                          onChange={(e) =>
                            setPrices({ ...prices, [key]: e.target.value })
                          }
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">{t('plan.content')}</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setContent(PLAN_DESC_TEMPLATE)}
                  >
                    {t('plan.useTemplate')}
                  </Button>
                </div>
                <Textarea
                  rows={4}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={t('plan.contentPlaceholder')}
                  className="font-mono text-xs"
                />
              </div>

              {editing && (
                <div className="flex items-center justify-between rounded-lg border bg-[var(--xb-panel)] px-3.5 py-2.5">
                  <div>
                    <Label className="text-xs font-medium">{t('plan.forceUpdate')}</Label>
                    <p className="text-[11px] text-muted-foreground">{t('plan.forceUpdateHint')}</p>
                  </div>
                  <Switch checked={forceUpdate} onCheckedChange={setForceUpdate} />
                </div>
              )}
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t bg-[var(--xb-heading)] px-6 py-3.5">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDialogOpen(false)}
                disabled={saveMutation.isPending}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('common.submit')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t('plan.deleteTitle')}
        description={t('plan.deleteDescription', { name: deleting?.name ?? '' })}
        loading={dropMutation.isPending}
        onConfirm={() => deleting && dropMutation.mutate(deleting.id)}
      />
    </div>
  );
}
