import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  ArrowUpDown,
  Ban,
  ChevronDown,
  Copy,
  Download,
  FileText,
  Filter,
  KeyRound,
  Loader2,
  Mail,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingCart,
  Trash2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { copyText } from '@/lib/clipboard';
import { assignOrder } from '@/api/order';
import { fetchPlans, LEGACY_PERIOD_KEYS, LEGACY_PERIOD_MAP } from '@/api/plan';
import { resetUserTraffic } from '@/api/trafficReset';
import {
  banUsers,
  destroyUser,
  exportUsersCsv,
  fetchUsers,
  generateUsers,
  generateUsersCsv,
  resetUserSecret,
  sendMailToUsers,
  type UserFilterItem,
  type UserRecord,
} from '@/api/user';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataTablePagination } from '@/components/shared/DataTablePagination';
import { DateTimePicker, type DateTimePreset } from '@/components/shared/DateTimePicker';
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
import { Textarea } from '@/components/ui/textarea';
import { UserEditDrawer } from '@/components/user/UserEditDrawer';
import { UserTrafficLogsDialog } from '@/components/user/UserTrafficLogsDialog';
import { getPanelSettings } from '@/lib/settings';
import { formatBytes, formatTimestamp, getTrafficUsageTone, parseCents } from '@/lib/format';
import { cn } from '@/lib/utils';

interface AdvancedFilterRow {
  field: string;
  operator: string;
  value: string;
}

type BulkTarget =
  | { scope: 'selected'; user_ids: number[] }
  | { scope: 'filtered'; filter: UserFilterItem[] }
  | { scope: 'all' };

export default function UserManagePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [inviteUserFilter, setInviteUserFilter] = useState<string>('');
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilterRow[]>([]);
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<AdvancedFilterRow[]>([]);

  const [sortField, setSortField] = useState('id');
  const [sortDesc, setSortDesc] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [emailPrefix, setEmailPrefix] = useState('');
  const [emailSuffix, setEmailSuffix] = useState('example.com');
  const [createPassword, setCreatePassword] = useState('');
  const [createExpiredAt, setCreateExpiredAt] = useState('');
  const [createPlanId, setCreatePlanId] = useState('none');
  const [createCount, setCreateCount] = useState('');
  const [createCsv, setCreateCsv] = useState(false);

  const [bulk, setBulk] = useState<{ action: 'mail' | 'ban'; target: BulkTarget } | null>(null);
  const [mailSubject, setMailSubject] = useState('');
  const [mailContent, setMailContent] = useState('');

  const [assignUser, setAssignUser] = useState<UserRecord | null>(null);
  const [assignPlanId, setAssignPlanId] = useState('');
  const [assignPeriod, setAssignPeriod] = useState('month_price');
  const [assignAmountYuan, setAssignAmountYuan] = useState('');

  const [resetSecretTarget, setResetSecretTarget] = useState<UserRecord | null>(null);
  const [resetOperationId, setResetOperationId] = useState<string>();
  const [resetTrafficTarget, setResetTrafficTarget] = useState<UserRecord | null>(null);
  const [deletingTarget, setDeletingTarget] = useState<UserRecord | null>(null);
  const [trafficLogsUser, setTrafficLogsUser] = useState<UserRecord | null>(null);

  const activeFilters = useMemo<UserFilterItem[]>(() => {
    const arr: UserFilterItem[] = [];
    if (search.trim()) {
      arr.push({ id: 'email', value: search.trim() });
    }
    if (inviteUserFilter.trim()) {
      arr.push({ id: 'invite_user_id', value: `eq:${inviteUserFilter.trim()}` });
    }
    for (const f of advancedFilters) {
      if (f.value.trim() === '') continue;
      const raw = f.value.trim();
      const value = f.field === 'balance' ? parseCents(raw) : raw;
      arr.push({
        id: f.field,
        value: `${f.operator}:${value}`,
      });
    }
    return arr;
  }, [search, inviteUserFilter, advancedFilters]);

  const usersQuery = useQuery({
    queryKey: ['admin-users', page, pageSize, activeFilters, sortField, sortDesc],
    queryFn: () =>
      fetchUsers({
        current: page,
        pageSize,
        filter: activeFilters.length > 0 ? activeFilters : undefined,
        sort: [{ id: sortField, desc: sortDesc }],
      }),
  });

  const plansQuery = useQuery({
    queryKey: ['admin-plans'],
    queryFn: fetchPlans,
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['admin-users'] });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const countNum = createCount.trim() ? Number(createCount) : undefined;
      const expiredTs = createExpiredAt.trim()
        ? Math.floor(Date.parse(createExpiredAt) / 1000)
        : null;
      const pid = createPlanId === 'none' ? null : Number(createPlanId);

      if (countNum && countNum > 0 && createCsv) {
        await generateUsersCsv({
          email_prefix: emailPrefix.trim() || undefined,
          email_suffix: emailSuffix.trim(),
          password: createPassword.trim() || undefined,
          expired_at: expiredTs,
          plan_id: pid,
          generate_count: countNum,
        });
        return;
      }

      await generateUsers({
        email_prefix: emailPrefix.trim() || undefined,
        email_suffix: emailSuffix.trim(),
        password: createPassword.trim() || undefined,
        expired_at: expiredTs,
        plan_id: pid,
        generate_count: countNum,
      });
    },
    onSuccess: () => {
      toast.success(t('userManage.createSuccess'));
      setCreateOpen(false);
      invalidate();
    },
  });

  const mailMutation = useMutation({
    mutationFn: sendMailToUsers,
    onSuccess: () => {
      toast.success(t('userManage.mailSent'));
      setBulk(null);
      setMailSubject('');
      setMailContent('');
    },
  });

  const banMutation = useMutation({
    mutationFn: banUsers,
    onSuccess: () => {
      toast.success(t('common.operationSuccess'));
      setBulk(null);
      setSelectedIds([]);
      invalidate();
    },
  });

  const assignMutation = useMutation({
    mutationFn: assignOrder,
    onSuccess: () => {
      toast.success(t('order.assignSuccess'));
      setAssignUser(null);
      invalidate();
    },
  });

  const resetSecretMutation = useMutation({
    mutationFn: resetUserSecret,
    onSuccess: () => {
      toast.success(t('common.operationSuccess'));
      setResetSecretTarget(null);
      invalidate();
    },
  });

  const resetTrafficMutation = useMutation({
    mutationFn: (id: number) => resetUserTraffic(id, 'Admin manual reset', resetOperationId),
    onSuccess: () => {
      toast.success(t('serverNode.resetTrafficSuccess'));
      setResetTrafficTarget(null);
      invalidate();
    },
  });

  const destroyMutation = useMutation({
    mutationFn: destroyUser,
    onSuccess: () => {
      toast.success(t('common.deleteSuccess'));
      setDeletingTarget(null);
      setSelectedIds([]);
      invalidate();
    },
  });

  const users = usersQuery.data?.data ?? [];
  const total = usersQuery.data?.total ?? 0;

  useEffect(() => {
    setSelectedIds([]);
  }, [activeFilters, page, pageSize, sortField, sortDesc]);

  useEffect(() => {
    if (!usersQuery.data) return;
    setPage((current) => Math.min(current, Math.max(1, Math.ceil(total / pageSize))));
    const visible = new Set(usersQuery.data.data.map((user) => user.id));
    setSelectedIds((ids) => ids.filter((id) => visible.has(id)));
  }, [usersQuery.data, total, pageSize]);

  const currentScope =
    selectedIds.length > 0
      ? ('selected' as const)
      : activeFilters.length > 0
        ? ('filtered' as const)
        : ('all' as const);

  const openBulk = (action: 'mail' | 'ban') => {
    const target: BulkTarget = currentScope === 'selected'
      ? { scope: 'selected', user_ids: [...new Set(selectedIds)] }
      : currentScope === 'filtered'
        ? { scope: 'filtered', filter: structuredClone(activeFilters) }
        : { scope: 'all' };
    setBulk({ action, target });
  };
  const bulkLabel = bulk && t(`userManage.scopes.${bulk.target.scope}`, {
    count: bulk.target.scope === 'selected' ? bulk.target.user_ids.length : undefined,
  });

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDesc((v) => !v);
    else {
      setSortField(field);
      setSortDesc(true);
    }
  };

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? users.map((u) => u.id) : []);
  };

  const toggleOne = (id: number, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter((item) => item !== id),
    );
  };

  const handleOpenAssign = (u: UserRecord) => {
    setAssignUser(u);
    const firstPlan = plansQuery.data?.[0];
    setAssignPlanId(firstPlan ? String(firstPlan.id) : '');
    setAssignPeriod('month_price');
    setAssignAmountYuan('');
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

  const allSelected = users.length > 0 && users.every((u) => selectedIds.includes(u.id));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t('nav.userManage')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('userManage.pageSubtitle')}</p>
      </div>

      {/* Single-Row Toolbar matching Xboard-u */}
      <div className="flex flex-wrap items-center gap-2.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setEmailPrefix('');
            setEmailSuffix('example.com');
            setCreatePassword('');
            setCreateExpiredAt('');
            setCreatePlanId('none');
            setCreateCount('');
            setCreateCsv(false);
            setCreateOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          {t('userManage.create')}
        </Button>

        <div className="relative min-w-[200px] flex-1 max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={t('userManage.searchPlaceholder')}
            className="h-8 pl-9 text-xs"
          />
        </div>

        {inviteUserFilter && (
          <Badge variant="secondary" className="gap-1 text-xs">
            Inviter #{inviteUserFilter}
            <button
              type="button"
              className="ml-1 cursor-pointer"
              onClick={() => setInviteUserFilter('')}
            >
              ×
            </button>
          </Badge>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              setDraftFilters(
                advancedFilters.length > 0
                  ? [...advancedFilters]
                  : [{ field: 'email', operator: 'like', value: '' }],
              );
              setFilterDialogOpen(true);
            }}
          >
            <Filter className="h-3.5 w-3.5" />
            {t('userManage.advancedFilter')}
            {advancedFilters.length > 0 && (
              <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">
                {advancedFilters.length}
              </Badge>
            )}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                {t('common.actions')}
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => openBulk('mail')}>
                <Mail className="mr-2 h-4 w-4" />
                {t('userManage.sendMailScope', {
                  scope: t(`userManage.scopes.${currentScope}`, { count: selectedIds.length }),
                })}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  void exportUsersCsv({
                    scope: currentScope,
                    ...(currentScope === 'selected' ? { user_ids: selectedIds } : {}),
                    ...(currentScope === 'filtered' ? { filter: activeFilters } : {}),
                  })
                }
              >
                <Download className="mr-2 h-4 w-4" />
                {t('userManage.exportCsvScope', {
                  scope: t(`userManage.scopes.${currentScope}`, { count: selectedIds.length }),
                })}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => openBulk('ban')}
              >
                <Ban className="mr-2 h-4 w-4" />
                {t('userManage.banScope', {
                  scope: t(`userManage.scopes.${currentScope}`, { count: selectedIds.length }),
                })}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => void usersQuery.refetch()}
            disabled={usersQuery.isFetching}
            title={t('common.refresh')}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${usersQuery.isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* 14-Column Table */}
      <div className="overflow-x-auto rounded-lg border bg-card/60">
        {usersQuery.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <table className="w-full min-w-[1220px] text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-3">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(c) => toggleAll(Boolean(c))}
                  />
                </th>
                <th className="px-3 py-3 font-medium">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                    onClick={() => toggleSort('id')}
                  >
                    ID
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-3 py-3 font-medium">{t('userManage.email')}</th>
                <th className="px-3 py-3 font-medium">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                    onClick={() => toggleSort('online_count')}
                  >
                    {t('userManage.onlineDevices')}
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-3 py-3 font-medium">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                    onClick={() => toggleSort('banned')}
                  >
                    {t('userManage.status')}
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-3 py-3 font-medium">{t('order.plan')}</th>
                <th className="px-3 py-3 font-medium">{t('plan.group')}</th>
                <th className="px-3 py-3 font-medium">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                    onClick={() => toggleSort('total_used')}
                  >
                    {t('userManage.usedTraffic')}
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-3 py-3 font-medium">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                    onClick={() => toggleSort('transfer_enable')}
                  >
                    {t('userManage.totalTraffic')}
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-3 py-3 font-medium">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                    onClick={() => toggleSort('expired_at')}
                  >
                    {t('userManage.expiredAt')}
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-3 py-3 font-medium">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                    onClick={() => toggleSort('balance')}
                  >
                    {t('userManage.balance')}
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-3 py-3 font-medium">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                    onClick={() => toggleSort('commission_balance')}
                  >
                    {t('userManage.commissionBalance')}
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-3 py-3 font-medium">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                    onClick={() => toggleSort('created_at')}
                  >
                    {t('userManage.createdAt')}
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="sticky right-0 w-20 border-l bg-card/95 px-3 py-3 text-right font-medium backdrop-blur-sm">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={14} className="py-12 text-center text-sm text-muted-foreground">
                    {t('userManage.empty')}
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const usedBytes = Number(u.u ?? 0) + Number(u.d ?? 0);
                  const totalBytes = Number(u.transfer_enable ?? 0);
                  const trafficTone = getTrafficUsageTone(usedBytes, totalBytes);
                  const pct = Math.round(trafficTone.pct);

                  return (
                    <tr key={u.id} className="hover:bg-muted/30">
                      <td className="px-3 py-3">
                        <Checkbox
                          checked={selectedIds.includes(u.id)}
                          onCheckedChange={(c) => toggleOne(u.id, Boolean(c))}
                        />
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{u.id}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium">{u.email}</span>
                          {Boolean(u.is_admin) && (
                            <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                              Admin
                            </Badge>
                          )}
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground cursor-pointer"
                            onClick={() => void copyText(u.email)}
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant="outline" className="font-mono text-xs">
                          {u.online_count ?? 0} / {Number(u.device_limit) > 0 ? u.device_limit : '∞'}
                        </Badge>
                      </td>
                      <td className="px-3 py-3">
                        <Badge
                          variant="outline"
                          className={
                            u.banned
                              ? 'border-rose-500/30 bg-rose-500/15 text-rose-500'
                              : 'border-emerald-500/30 bg-emerald-500/15 text-emerald-500'
                          }
                        >
                          {u.banned ? t('userManage.statusBanned') : t('userManage.statusNormal')}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-xs">{u.plan?.name || '—'}</td>
                      <td className="px-3 py-3 text-xs">{u.group?.name || '—'}</td>
                      <td className="px-3 py-3 text-xs">
                        <div className={cn('font-mono', trafficTone.textClass)}>
                          {formatBytes(usedBytes)}
                        </div>
                        {totalBytes > 0 && (
                          <div className="mt-1 h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn('h-full transition-colors', trafficTone.barClass)}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs">{formatBytes(totalBytes)}</td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        {u.expired_at ? formatTimestamp(u.expired_at) : t('giftCard.permanent')}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs">
                        {getPanelSettings().currency_symbol}{Number(u.balance ?? 0).toFixed(2)}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs">
                        {getPanelSettings().currency_symbol}{Number(u.commission_balance ?? 0).toFixed(2)}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        {formatTimestamp(u.created_at)}
                      </td>
                      <td className="sticky right-0 border-l bg-card/95 px-3 py-3 text-right backdrop-blur-sm">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditingUser(u)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              {t('common.edit')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleOpenAssign(u)}>
                              <ShoppingCart className="mr-2 h-4 w-4" />
                              {t('order.assignTitle')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => u.subscribe_url && void copyText(u.subscribe_url)}
                            >
                              <Copy className="mr-2 h-4 w-4" />
                              {t('userManage.copySubUrl')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setResetSecretTarget(u)}>
                              <KeyRound className="mr-2 h-4 w-4" />
                              {t('userManage.resetSecret')}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => navigate(`/finance/order?user_id=eq:${u.id}`)}
                            >
                              <FileText className="mr-2 h-4 w-4" />
                              {t('userManage.userOrders')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setInviteUserFilter(String(u.id));
                                setPage(1);
                              }}
                            >
                              <Users className="mr-2 h-4 w-4" />
                              {t('userManage.userInvites')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setTrafficLogsUser(u)}>
                              <Activity className="mr-2 h-4 w-4" />
                              {t('userManage.userTrafficLogs')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => {
                              setResetOperationId(globalThis.crypto?.randomUUID?.());
                              setResetTrafficTarget(u);
                            }}>
                              <RotateCcw className="mr-2 h-4 w-4" />
                              {t('serverNode.resetTraffic')}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeletingTarget(u)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              {t('common.delete')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      <DataTablePagination
        total={total}
        selectedCount={selectedIds.length}
        page={page}
        pageSize={pageSize}
        pageSizeOptions={[10, 20, 50, 100]}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      {/* Right-Side User Edit Drawer */}
      <UserEditDrawer
        open={Boolean(editingUser)}
        onOpenChange={(o) => !o && setEditingUser(null)}
        user={editingUser}
        plans={plansQuery.data ?? []}
      />

      <UserTrafficLogsDialog
        open={Boolean(trafficLogsUser)}
        onOpenChange={(o) => !o && setTrafficLogsUser(null)}
        user={trafficLogsUser}
      />

      {/* Create / Generate User Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('userManage.createTitle')}</DialogTitle>
            <DialogDescription>{t('userManage.createDesc')}</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!emailSuffix.trim() || (!emailPrefix.trim() && !createCount.trim())) {
                toast.error(t('userManage.emailRequired'));
                return;
              }
              generateMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label className="text-xs">{t('userManage.email')} *</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={emailPrefix}
                  onChange={(e) => setEmailPrefix(e.target.value)}
                  placeholder={t('userManage.emailPrefixPlaceholder')}
                />
                <span className="text-sm text-muted-foreground">@</span>
                <Input
                  value={emailSuffix}
                  onChange={(e) => setEmailSuffix(e.target.value)}
                  placeholder="example.com"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t('userManage.password')}</Label>
              <Input
                type="password"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
                placeholder={t('userManage.passwordCreatePlaceholder')}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('userManage.expiredAt')}</Label>
                <DateTimePicker
                  value={createExpiredAt}
                  onChange={setCreateExpiredAt}
                  allowClear
                  placeholder={t('userManage.expiredAtHint')}
                  presets={
                    [
                      { label: t('common.datePicker.permanent'), getValue: () => '' },
                      {
                        label: t('common.datePicker.plus1Month'),
                        getValue: () => {
                          const d = new Date();
                          d.setMonth(d.getMonth() + 1);
                          d.setHours(23, 59, 0, 0);
                          const pad = (n: number) => String(n).padStart(2, '0');
                          return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                        },
                      },
                      {
                        label: t('common.datePicker.plus3Months'),
                        getValue: () => {
                          const d = new Date();
                          d.setMonth(d.getMonth() + 3);
                          d.setHours(23, 59, 0, 0);
                          const pad = (n: number) => String(n).padStart(2, '0');
                          return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                        },
                      },
                      {
                        label: t('common.datePicker.plus1Year'),
                        getValue: () => {
                          const d = new Date();
                          d.setFullYear(d.getFullYear() + 1);
                          d.setHours(23, 59, 0, 0);
                          const pad = (n: number) => String(n).padStart(2, '0');
                          return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                        },
                      },
                    ] satisfies DateTimePreset[]
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('order.plan')}</Label>
                <Select value={createPlanId} onValueChange={setCreatePlanId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('userManage.noPlan')}</SelectItem>
                    {(plansQuery.data ?? []).map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t('userManage.generateCount')}</Label>
              <Input
                type="number"
                min={1}
                max={500}
                value={createCount}
                onChange={(e) => setCreateCount(e.target.value)}
                placeholder={t('userManage.generateCountPlaceholder')}
              />
            </div>

            {Number(createCount) > 0 && (
              <div className="flex items-center justify-between rounded-lg border bg-[var(--xb-panel)] px-3.5 py-2.5">
                <Label className="text-xs">{t('giftCard.downloadCsv')}</Label>
                <Switch checked={createCsv} onCheckedChange={setCreateCsv} />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCreateOpen(false)}
                disabled={generateMutation.isPending}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={generateMutation.isPending}>
                {generateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('common.confirm')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Advanced Filter Dialog */}
      <Dialog open={filterDialogOpen} onOpenChange={setFilterDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('userManage.advancedFilter')}</DialogTitle>
            <DialogDescription>{t('userManage.advancedFilterDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {draftFilters.map((row, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_100px_1fr_36px] items-center gap-2">
                <Select
                  value={row.field}
                  onValueChange={(v) => {
                    const next = [...draftFilters];
                    next[idx] = { ...row, field: v };
                    setDraftFilters(next);
                  }}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">{t('userManage.email')}</SelectItem>
                    <SelectItem value="id">ID</SelectItem>
                    <SelectItem value="plan_id">{t('order.plan')} ID</SelectItem>
                    <SelectItem value="group_id">{t('plan.group')} ID</SelectItem>
                    <SelectItem value="banned">{t('userManage.status')} (0/1)</SelectItem>
                    <SelectItem value="balance">{t('userManage.balance')}</SelectItem>
                    <SelectItem value="invite_user.email">
                      {t('userManage.inviteUserEmail')}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={row.operator}
                  onValueChange={(v) => {
                    const next = [...draftFilters];
                    next[idx] = { ...row, operator: v };
                    setDraftFilters(next);
                  }}
                >
                  <SelectTrigger className="h-9 font-mono text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="like">like</SelectItem>
                    <SelectItem value="eq">=</SelectItem>
                    <SelectItem value="gt">&gt;</SelectItem>
                    <SelectItem value="gte">&gt;=</SelectItem>
                    <SelectItem value="lt">&lt;</SelectItem>
                    <SelectItem value="lte">&lt;=</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  className="h-9 text-xs"
                  value={row.value}
                  onChange={(e) => {
                    const next = [...draftFilters];
                    next[idx] = { ...row, value: e.target.value };
                    setDraftFilters(next);
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setDraftFilters(draftFilters.filter((_, i) => i !== idx))}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setDraftFilters([...draftFilters, { field: 'email', operator: 'like', value: '' }])
              }
            >
              <Plus className="h-3.5 w-3.5" />
              {t('userManage.addCondition')}
            </Button>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setAdvancedFilters([]);
                  setDraftFilters([]);
                  setFilterDialogOpen(false);
                  setPage(1);
                }}
              >
                {t('userManage.resetFilters')}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  if (draftFilters.some((f) => f.field === 'balance' && f.value.trim() && parseCents(f.value) === null)) {
                    toast.error(t('common.invalidAmount', { defaultValue: 'Invalid amount' }));
                    return;
                  }
                  setAdvancedFilters(draftFilters.filter((r) => r.value.trim() !== ''));
                  setFilterDialogOpen(false);
                  setPage(1);
                }}
              >
                {t('userManage.applyFilters')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Send Mail Dialog */}
      <Dialog open={bulk?.action === 'mail'} onOpenChange={(open) => !open && setBulk(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('userManage.sendMailTitle')}</DialogTitle>
            <DialogDescription>
              {bulkLabel}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (bulk?.action !== 'mail') return;
              if (!mailSubject.trim() || !mailContent.trim()) {
                toast.error(t('userManage.mailValidation'));
                return;
              }
              mailMutation.mutate({
                ...bulk.target,
                subject: mailSubject.trim(),
                content: mailContent.trim(),
              });
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label className="text-xs">{t('userManage.mailSubject')}</Label>
              <Input value={mailSubject} onChange={(e) => setMailSubject(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('userManage.mailContent')}</Label>
              <Textarea
                rows={5}
                value={mailContent}
                onChange={(e) => setMailContent(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setBulk(null)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={mailMutation.isPending}>
                {mailMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('common.confirm')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign Order Dialog */}
      <Dialog open={Boolean(assignUser)} onOpenChange={(o) => !o && setAssignUser(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('order.assignTitle')}</DialogTitle>
            <DialogDescription>{assignUser?.email}</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!assignUser) return;
              const pid = Number(assignPlanId);
              const cents = parseCents(assignAmountYuan);
              if (!pid || cents === null || cents < 0) {
                toast.error(t('order.assignValidationError'));
                return;
              }
              assignMutation.mutate({
                email: assignUser.email,
                plan_id: pid,
                period: assignPeriod,
                total_amount: cents,
              });
            }}
            className="space-y-4"
          >
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
                />
                <span className="pointer-events-none absolute right-3 text-xs text-muted-foreground">
                  {getPanelSettings().currency}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setAssignUser(null)}>
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

      <ConfirmDialog
        open={bulk?.action === 'ban'}
        onOpenChange={(open) => !open && setBulk(null)}
        title={t('userManage.banTitle')}
        description={t('userManage.banConfirmDesc', {
          scope: bulkLabel,
        })}
        loading={banMutation.isPending}
        onConfirm={() =>
          bulk?.action === 'ban' && banMutation.mutate(bulk.target)
        }
      />

      <ConfirmDialog
        open={Boolean(resetSecretTarget)}
        onOpenChange={(o) => !o && setResetSecretTarget(null)}
        title={t('userManage.resetSecret')}
        description={t('userManage.resetSecretDesc', {
          email: resetSecretTarget?.email ?? '',
        })}
        loading={resetSecretMutation.isPending}
        onConfirm={() =>
          resetSecretTarget && resetSecretMutation.mutate(resetSecretTarget.id)
        }
      />

      <ConfirmDialog
        open={Boolean(resetTrafficTarget)}
        onOpenChange={(o) => !o && setResetTrafficTarget(null)}
        title={t('serverNode.resetTraffic')}
        description={t('userManage.resetTrafficDesc', {
          email: resetTrafficTarget?.email ?? '',
        })}
        destructive={false}
        loading={resetTrafficMutation.isPending}
        onConfirm={() =>
          resetTrafficTarget && resetTrafficMutation.mutate(resetTrafficTarget.id)
        }
      />

      <ConfirmDialog
        open={Boolean(deletingTarget)}
        onOpenChange={(o) => !o && setDeletingTarget(null)}
        title={t('userManage.deleteTitle')}
        description={t('userManage.deleteDesc', { email: deletingTarget?.email ?? '' })}
        loading={destroyMutation.isPending}
        onConfirm={() => deletingTarget && destroyMutation.mutate(deletingTarget.id)}
      />
    </div>
  );
}
