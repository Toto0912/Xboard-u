import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Copy,
  Download,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Ticket,
  Trash2,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';
import {
  createGiftCardTemplate,
  deleteGiftCardCode,
  deleteGiftCardTemplate,
  exportGiftCardCodes,
  fetchGiftCardCodes,
  fetchGiftCardStatistics,
  fetchGiftCardTemplates,
  fetchGiftCardUsages,
  generateGiftCardCodes,
  generateGiftCardCodesCsv,
  toggleGiftCardCode,
  updateGiftCardTemplate,
  type GiftCardCodeItem,
  type GiftCardTemplateItem,
} from '@/api/giftCard';
import { fetchPlans } from '@/api/plan';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataTablePagination } from '@/components/shared/DataTablePagination';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { formatBytes, formatCurrency, formatTimestamp } from '@/lib/format';

const CODE_STATUS_BADGE: Record<number, string> = {
  0: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  1: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30',
  2: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  3: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30',
};

export default function GiftCardManagePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'templates' | 'codes' | 'usages' | 'stats'>(
    'templates',
  );

  // Templates state
  const [tplSearch, setTplSearch] = useState('');
  const [tplType, setTplType] = useState<string>('all');
  const [tplStatus, setTplStatus] = useState<string>('all');
  const [tplPage, setTplPage] = useState(1);
  const [tplPageSize, setTplPageSize] = useState(20);
  const [tplDialogOpen, setTplDialogOpen] = useState(false);
  const [editingTpl, setEditingTpl] = useState<GiftCardTemplateItem | null>(null);
  const [deletingTpl, setDeletingTpl] = useState<GiftCardTemplateItem | null>(null);

  // Template form states
  const [tplName, setTplName] = useState('');
  const [tplDesc, setTplDesc] = useState('');
  const [tplFormType, setTplFormType] = useState<1 | 2 | 3>(1);
  const [tplSort, setTplSort] = useState('0');
  const [tplEnabled, setTplEnabled] = useState(true);
  const [rewardBalanceYuan, setRewardBalanceYuan] = useState('');
  const [rewardTrafficGb, setRewardTrafficGb] = useState('');
  const [rewardExpireDays, setRewardExpireDays] = useState('');
  const [rewardDeviceLimit, setRewardDeviceLimit] = useState('');
  const [rewardResetPkg, setRewardResetPkg] = useState(false);
  const [rewardPlanId, setRewardPlanId] = useState('');
  const [rewardPlanDays, setRewardPlanDays] = useState('30');
  const [condNewUserOnly, setCondNewUserOnly] = useState(false);
  const [condNewUserDays, setCondNewUserDays] = useState('7');
  const [condPaidOnly, setCondPaidOnly] = useState(false);
  const [condRequireInvite, setCondRequireInvite] = useState(false);
  const [condAllowedPlans, setCondAllowedPlans] = useState<number[]>([]);
  const [limitMaxPerUser, setLimitMaxPerUser] = useState('');
  const [limitCooldownHours, setLimitCooldownHours] = useState('');
  const [limitInviteRate, setLimitInviteRate] = useState('');

  // Codes state
  const [codeTemplateFilter, setCodeTemplateFilter] = useState<string>('all');
  const [codeStatusFilter, setCodeStatusFilter] = useState<string>('all');
  const [codeBatchFilter, setCodeBatchFilter] = useState('');
  const [codePage, setCodePage] = useState(1);
  const [codePageSize, setCodePageSize] = useState(20);
  const [genOpen, setGenOpen] = useState(false);
  const [genTemplateId, setGenTemplateId] = useState('');
  const [genCount, setGenCount] = useState('10');
  const [genPrefix, setGenPrefix] = useState('GC');
  const [genExpiresHours, setGenExpiresHours] = useState('');
  const [genMaxUsage, setGenMaxUsage] = useState('1');
  const [genDownloadCsv, setGenDownloadCsv] = useState(false);
  const [deletingCode, setDeletingCode] = useState<GiftCardCodeItem | null>(null);

  // Usages state
  const [usageTemplateFilter, setUsageTemplateFilter] = useState<string>('all');
  const [usagePage, setUsagePage] = useState(1);
  const [usagePageSize, setUsagePageSize] = useState(20);

  const plansQuery = useQuery({
    queryKey: ['admin-plans'],
    queryFn: fetchPlans,
  });

  const templatesQuery = useQuery({
    queryKey: ['gift-card-templates', tplPage, tplPageSize, tplType, tplStatus],
    queryFn: () =>
      fetchGiftCardTemplates({
        page: tplPage,
        per_page: tplPageSize,
        ...(tplType !== 'all' ? { type: Number(tplType) } : {}),
        ...(tplStatus !== 'all' ? { status: Number(tplStatus) } : {}),
      }),
  });

  const codesQuery = useQuery({
    queryKey: [
      'gift-card-codes',
      codePage,
      codePageSize,
      codeTemplateFilter,
      codeStatusFilter,
      codeBatchFilter,
    ],
    queryFn: () =>
      fetchGiftCardCodes({
        page: codePage,
        per_page: codePageSize,
        ...(codeTemplateFilter !== 'all' ? { template_id: Number(codeTemplateFilter) } : {}),
        ...(codeStatusFilter !== 'all' ? { status: Number(codeStatusFilter) } : {}),
        ...(codeBatchFilter.trim() ? { batch_id: codeBatchFilter.trim() } : {}),
      }),
    enabled: activeTab === 'codes',
  });

  const usagesQuery = useQuery({
    queryKey: ['gift-card-usages', usagePage, usagePageSize, usageTemplateFilter],
    queryFn: () =>
      fetchGiftCardUsages({
        page: usagePage,
        per_page: usagePageSize,
        ...(usageTemplateFilter !== 'all' ? { template_id: Number(usageTemplateFilter) } : {}),
      }),
    enabled: activeTab === 'usages',
  });

  const statsQuery = useQuery({
    queryKey: ['gift-card-stats'],
    queryFn: () => fetchGiftCardStatistics(),
    enabled: activeTab === 'stats',
  });

  const filteredTemplates = useMemo(() => {
    const list = templatesQuery.data?.data ?? [];
    const q = tplSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (tpl) =>
        tpl.name.toLowerCase().includes(q) ||
        (tpl.description ?? '').toLowerCase().includes(q) ||
        String(tpl.id).includes(q),
    );
  }, [templatesQuery.data, tplSearch]);

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['gift-card-templates'] });
    void queryClient.invalidateQueries({ queryKey: ['gift-card-codes'] });
    void queryClient.invalidateQueries({ queryKey: ['gift-card-stats'] });
  };

  const saveTplMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editingTpl ? updateGiftCardTemplate(payload) : createGiftCardTemplate(payload),
    onSuccess: () => {
      toast.success(t('common.saveSuccess'));
      setTplDialogOpen(false);
      invalidateAll();
    },
  });

  const toggleTplMutation = useMutation({
    mutationFn: (tpl: GiftCardTemplateItem) =>
      updateGiftCardTemplate({ id: tpl.id, status: !tpl.status }),
    onSuccess: () => {
      toast.success(t('common.operationSuccess'));
      invalidateAll();
    },
  });

  const deleteTplMutation = useMutation({
    mutationFn: deleteGiftCardTemplate,
    onSuccess: () => {
      toast.success(t('common.deleteSuccess'));
      setDeletingTpl(null);
      invalidateAll();
    },
  });

  const genCodesMutation = useMutation({
    mutationFn: async (payload: {
      template_id: number;
      count: number;
      prefix?: string;
      expires_hours?: number;
      max_usage?: number;
      download_csv: boolean;
    }) => {
      const { download_csv, ...rest } = payload;
      if (download_csv) {
        await generateGiftCardCodesCsv(rest);
        return null;
      }
      return generateGiftCardCodes(rest);
    },
    onSuccess: (res, variables) => {
      toast.success(t('giftCard.generateSuccess', { count: variables.count }));
      setGenOpen(false);
      if (res?.batch_id) {
        setCodeBatchFilter(res.batch_id);
      }
      setActiveTab('codes');
      invalidateAll();
    },
  });

  const toggleCodeMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'enable' | 'disable' }) =>
      toggleGiftCardCode(id, action),
    onSuccess: () => {
      toast.success(t('common.operationSuccess'));
      void queryClient.invalidateQueries({ queryKey: ['gift-card-codes'] });
    },
  });

  const deleteCodeMutation = useMutation({
    mutationFn: deleteGiftCardCode,
    onSuccess: () => {
      toast.success(t('common.deleteSuccess'));
      setDeletingCode(null);
      invalidateAll();
    },
  });

  const openCreateTpl = () => {
    setEditingTpl(null);
    setTplName('');
    setTplDesc('');
    setTplFormType(1);
    setTplSort('0');
    setTplEnabled(true);
    setRewardBalanceYuan('');
    setRewardTrafficGb('');
    setRewardExpireDays('');
    setRewardDeviceLimit('');
    setRewardResetPkg(false);
    setRewardPlanId(plansQuery.data?.[0] ? String(plansQuery.data[0].id) : '');
    setRewardPlanDays('30');
    setCondNewUserOnly(false);
    setCondNewUserDays('7');
    setCondPaidOnly(false);
    setCondRequireInvite(false);
    setCondAllowedPlans([]);
    setLimitMaxPerUser('');
    setLimitCooldownHours('');
    setLimitInviteRate('');
    setTplDialogOpen(true);
  };

  const openEditTpl = (tpl: GiftCardTemplateItem) => {
    setEditingTpl(tpl);
    setTplName(tpl.name);
    setTplDesc(tpl.description ?? '');
    setTplFormType(tpl.type);
    setTplSort(String(tpl.sort ?? 0));
    setTplEnabled(Boolean(tpl.status));
    const r = tpl.rewards ?? {};
    setRewardBalanceYuan(r.balance ? String(Number(r.balance) / 100) : '');
    setRewardTrafficGb(
      r.transfer_enable ? String(Number((Number(r.transfer_enable) / 1073741824).toFixed(2))) : '',
    );
    setRewardExpireDays(r.expire_days ? String(r.expire_days) : '');
    setRewardDeviceLimit(r.device_limit ? String(r.device_limit) : '');
    setRewardResetPkg(Boolean(r.reset_package));
    setRewardPlanId(r.plan_id ? String(r.plan_id) : '');
    setRewardPlanDays(r.plan_validity_days ? String(r.plan_validity_days) : '30');
    const c = tpl.conditions ?? {};
    setCondNewUserOnly(Boolean(c.new_user_only));
    setCondNewUserDays(c.new_user_max_days ? String(c.new_user_max_days) : '7');
    setCondPaidOnly(Boolean(c.paid_user_only));
    setCondRequireInvite(Boolean(c.require_invite));
    setCondAllowedPlans(Array.isArray(c.allowed_plans) ? c.allowed_plans.map(Number) : []);
    const l = tpl.limits ?? {};
    setLimitMaxPerUser(l.max_use_per_user ? String(l.max_use_per_user) : '');
    setLimitCooldownHours(l.cooldown_hours ? String(l.cooldown_hours) : '');
    setLimitInviteRate(r.invite_reward_rate ? String(Number(r.invite_reward_rate) * 100) : '');
    setTplDialogOpen(true);
  };

  const handleSaveTpl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tplName.trim()) {
      toast.error(t('giftCard.nameRequired'));
      return;
    }

    const rewards: Record<string, unknown> = {};
    if (Number(rewardBalanceYuan) > 0) {
      rewards.balance = Math.round(Number(rewardBalanceYuan) * 100);
    }
    if (Number(rewardTrafficGb) > 0) {
      rewards.transfer_enable = Math.round(Number(rewardTrafficGb) * 1073741824);
    }
    if (Number(rewardExpireDays) > 0) {
      rewards.expire_days = Math.floor(Number(rewardExpireDays));
    }
    if (Number(rewardDeviceLimit) > 0) {
      rewards.device_limit = Math.floor(Number(rewardDeviceLimit));
    }
    if (rewardResetPkg) rewards.reset_package = true;
    if (tplFormType === 2 && rewardPlanId) {
      rewards.plan_id = Number(rewardPlanId);
      rewards.plan_validity_days = Number(rewardPlanDays) || 30;
    }
    if (Number(limitInviteRate) > 0) {
      rewards.invite_reward_rate = Number(limitInviteRate) / 100;
    }

    if (Object.keys(rewards).length === 0) {
      toast.error(t('giftCard.rewardsRequired'));
      return;
    }

    const conditions: Record<string, unknown> = {};
    if (condNewUserOnly) {
      conditions.new_user_only = true;
      conditions.new_user_max_days = Number(condNewUserDays) || 7;
    }
    if (condPaidOnly) conditions.paid_user_only = true;
    if (condRequireInvite) conditions.require_invite = true;
    if (condAllowedPlans.length > 0) conditions.allowed_plans = condAllowedPlans;

    const limits: Record<string, unknown> = {};
    if (Number(limitMaxPerUser) > 0) limits.max_use_per_user = Number(limitMaxPerUser);
    if (Number(limitCooldownHours) > 0) limits.cooldown_hours = Number(limitCooldownHours);

    saveTplMutation.mutate({
      ...(editingTpl ? { id: editingTpl.id } : {}),
      name: tplName.trim(),
      description: tplDesc.trim() || null,
      type: tplFormType,
      status: tplEnabled,
      sort: Number(tplSort) || 0,
      rewards,
      conditions,
      limits,
    });
  };

  const openGenerateForTemplate = (tplId?: number) => {
    setGenTemplateId(
      tplId
        ? String(tplId)
        : templatesQuery.data?.data?.[0]
          ? String(templatesQuery.data.data[0].id)
          : '',
    );
    setGenCount('10');
    setGenPrefix('GC');
    setGenExpiresHours('');
    setGenMaxUsage('1');
    setGenDownloadCsv(false);
    setGenOpen(true);
  };

  const handleGenerateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const tid = Number(genTemplateId);
    const count = Number(genCount);
    if (!tid || !Number.isFinite(count) || count < 1) {
      toast.error(t('giftCard.generateValidationError'));
      return;
    }
    genCodesMutation.mutate({
      template_id: tid,
      count: Math.floor(count),
      prefix: genPrefix.trim().toUpperCase() || undefined,
      expires_hours: genExpiresHours.trim() ? Number(genExpiresHours) : undefined,
      max_usage: Number(genMaxUsage) || 1,
      download_csv: genDownloadCsv,
    });
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('common.copied'));
    } catch {
      toast.error(t('common.copyFailed'));
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t('nav.giftCardManagement')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('giftCard.pageSubtitle')}</p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) =>
          setActiveTab(v as 'templates' | 'codes' | 'usages' | 'stats')
        }
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="templates">{t('giftCard.tabs.templates')}</TabsTrigger>
          <TabsTrigger value="codes">{t('giftCard.tabs.codes')}</TabsTrigger>
          <TabsTrigger value="usages">{t('giftCard.tabs.usages')}</TabsTrigger>
          <TabsTrigger value="stats">{t('giftCard.tabs.stats')}</TabsTrigger>
        </TabsList>

        {/* Tab 1: Templates */}
        <TabsContent value="templates" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-[180px] flex-1 max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={tplSearch}
                onChange={(e) => setTplSearch(e.target.value)}
                placeholder={t('giftCard.searchTemplates')}
                className="h-8 pl-9 text-xs"
              />
            </div>

            <Select
              value={tplType}
              onValueChange={(v) => {
                setTplType(v);
                setTplPage(1);
              }}
            >
              <SelectTrigger className="h-8 w-[130px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('giftCard.allTypes')}</SelectItem>
                <SelectItem value="1">{t('giftCard.types.1')}</SelectItem>
                <SelectItem value="2">{t('giftCard.types.2')}</SelectItem>
                <SelectItem value="3">{t('giftCard.types.3')}</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={tplStatus}
              onValueChange={(v) => {
                setTplStatus(v);
                setTplPage(1);
              }}
            >
              <SelectTrigger className="h-8 w-[120px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all')}</SelectItem>
                <SelectItem value="1">{t('giftCard.enabled')}</SelectItem>
                <SelectItem value="0">{t('common.disabled')}</SelectItem>
              </SelectContent>
            </Select>

            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={openCreateTpl}>
                <Plus className="h-4 w-4" />
                {t('giftCard.createTemplate')}
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => void templatesQuery.refetch()}
                disabled={templatesQuery.isFetching}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${templatesQuery.isFetching ? 'animate-spin' : ''}`}
                />
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border bg-card/60">
            {templatesQuery.isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <table className="w-full min-w-[880px] text-sm">
                <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">ID</th>
                    <th className="px-3 py-3 font-medium">{t('giftCard.status')}</th>
                    <th className="px-3 py-3 font-medium">{t('giftCard.name')}</th>
                    <th className="px-3 py-3 font-medium">{t('giftCard.type')}</th>
                    <th className="px-3 py-3 font-medium">{t('giftCard.rewards')}</th>
                    <th className="px-3 py-3 font-medium">{t('serverNode.sort')}</th>
                    <th className="px-3 py-3 font-medium">{t('order.createdAt')}</th>
                    <th className="sticky right-0 w-32 border-l bg-card/95 px-4 py-3 text-right font-medium backdrop-blur-sm">
                      {t('common.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredTemplates.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                        {t('giftCard.emptyTemplates')}
                      </td>
                    </tr>
                  ) : (
                    filteredTemplates.map((tpl) => {
                      const r = tpl.rewards ?? {};
                      return (
                        <tr key={tpl.id} className="hover:bg-muted/30">
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                            #{tpl.id}
                          </td>
                          <td className="px-3 py-3">
                            <Switch
                              checked={Boolean(tpl.status)}
                              onCheckedChange={() => toggleTplMutation.mutate(tpl)}
                            />
                          </td>
                          <td className="px-3 py-3">
                            <div className="font-medium">{tpl.name}</div>
                            {tpl.description && (
                              <p className="text-xs text-muted-foreground">{tpl.description}</p>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <Badge variant="outline">{t(`giftCard.types.${tpl.type}`)}</Badge>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-1">
                              {Boolean(r.balance) && (
                                <Badge variant="secondary" className="text-[10px]">
                                  {formatCurrency(Number(r.balance))}
                                </Badge>
                              )}
                              {Boolean(r.transfer_enable) && (
                                <Badge variant="secondary" className="text-[10px]">
                                  +{formatBytes(Number(r.transfer_enable))}
                                </Badge>
                              )}
                              {Boolean(r.expire_days) && (
                                <Badge variant="secondary" className="text-[10px]">
                                  +{String(r.expire_days)}d
                                </Badge>
                              )}
                              {Boolean(r.plan_id) && (
                                <Badge variant="secondary" className="text-[10px]">
                                  Plan #{String(r.plan_id)}
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-3 font-mono text-xs">{tpl.sort}</td>
                          <td className="px-3 py-3 text-xs text-muted-foreground">
                            {formatTimestamp(tpl.created_at)}
                          </td>
                          <td className="sticky right-0 border-l bg-card/95 px-4 py-3 text-right backdrop-blur-sm">
                            <div className="inline-flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openGenerateForTemplate(tpl.id)}
                                title={t('giftCard.generateCodes')}
                              >
                                <Ticket className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditTpl(tpl)}
                                title={t('common.edit')}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => setDeletingTpl(tpl)}
                                title={t('common.delete')}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
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
            total={templatesQuery.data?.total ?? 0}
            page={tplPage}
            pageSize={tplPageSize}
            pageSizeOptions={[15, 20, 50, 100]}
            onPageChange={setTplPage}
            onPageSizeChange={setTplPageSize}
          />
        </TabsContent>

        {/* Tab 2: Codes */}
        <TabsContent value="codes" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <Input
              value={codeBatchFilter}
              onChange={(e) => {
                setCodeBatchFilter(e.target.value);
                setCodePage(1);
              }}
              placeholder={t('giftCard.batchFilterPlaceholder')}
              className="h-8 w-48 font-mono text-xs"
            />

            <Select
              value={codeTemplateFilter}
              onValueChange={(v) => {
                setCodeTemplateFilter(v);
                setCodePage(1);
              }}
            >
              <SelectTrigger className="h-8 w-[150px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('giftCard.allTemplates')}</SelectItem>
                {(templatesQuery.data?.data ?? []).map((tpl) => (
                  <SelectItem key={tpl.id} value={String(tpl.id)}>
                    {tpl.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={codeStatusFilter}
              onValueChange={(v) => {
                setCodeStatusFilter(v);
                setCodePage(1);
              }}
            >
              <SelectTrigger className="h-8 w-[125px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all')}</SelectItem>
                <SelectItem value="0">{t('giftCard.codeStatuses.0')}</SelectItem>
                <SelectItem value="1">{t('giftCard.codeStatuses.1')}</SelectItem>
                <SelectItem value="2">{t('giftCard.codeStatuses.2')}</SelectItem>
                <SelectItem value="3">{t('giftCard.codeStatuses.3')}</SelectItem>
              </SelectContent>
            </Select>

            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => openGenerateForTemplate()}>
                <Plus className="h-4 w-4" />
                {t('giftCard.generateCodes')}
              </Button>
              {codeBatchFilter.trim() && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void exportGiftCardCodes(codeBatchFilter.trim())}
                >
                  <Download className="h-4 w-4" />
                  {t('giftCard.exportBatch')}
                </Button>
              )}
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => void codesQuery.refetch()}
                disabled={codesQuery.isFetching}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${codesQuery.isFetching ? 'animate-spin' : ''}`}
                />
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border bg-card/60">
            {codesQuery.isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <table className="w-full min-w-[960px] text-sm">
                <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">ID</th>
                    <th className="px-3 py-3 font-medium">{t('giftCard.code')}</th>
                    <th className="px-3 py-3 font-medium">{t('giftCard.templateName')}</th>
                    <th className="px-3 py-3 font-medium">{t('giftCard.batchId')}</th>
                    <th className="px-3 py-3 font-medium">{t('giftCard.status')}</th>
                    <th className="px-3 py-3 font-medium">{t('giftCard.expiresAt')}</th>
                    <th className="px-3 py-3 font-medium">{t('giftCard.usageProgress')}</th>
                    <th className="px-3 py-3 font-medium">{t('order.createdAt')}</th>
                    <th className="sticky right-0 w-28 border-l bg-card/95 px-4 py-3 text-right font-medium backdrop-blur-sm">
                      {t('common.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(codesQuery.data?.data ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-sm text-muted-foreground">
                        {t('giftCard.emptyCodes')}
                      </td>
                    </tr>
                  ) : (
                    (codesQuery.data?.data ?? []).map((code) => (
                      <tr key={code.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          #{code.id}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs">
                          <div className="flex items-center gap-1.5">
                            <code>{code.code}</code>
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-foreground cursor-pointer"
                              onClick={() => void copyText(code.code)}
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-xs">
                          {code.template?.name || code.template_name || `#${code.template_id}`}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                          {code.batch_id}
                        </td>
                        <td className="px-3 py-3">
                          <Badge
                            variant="outline"
                            className={CODE_STATUS_BADGE[code.status] ?? ''}
                          >
                            {t(`giftCard.codeStatuses.${code.status}`)}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">
                          {code.expires_at
                            ? formatTimestamp(code.expires_at)
                            : t('giftCard.permanent')}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs">
                          {code.usage_count} / {code.max_usage}
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">
                          {formatTimestamp(code.created_at)}
                        </td>
                        <td className="sticky right-0 border-l bg-card/95 px-4 py-3 text-right backdrop-blur-sm">
                          <div className="inline-flex items-center gap-1">
                            {(code.status === 0 || code.status === 3) && (
                              <Switch
                                checked={code.status === 0}
                                onCheckedChange={(checked) =>
                                  toggleCodeMutation.mutate({
                                    id: code.id,
                                    action: checked ? 'enable' : 'disable',
                                  })
                                }
                              />
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeletingCode(code)}
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
            total={codesQuery.data?.total ?? 0}
            page={codePage}
            pageSize={codePageSize}
            pageSizeOptions={[15, 20, 50, 100]}
            onPageChange={setCodePage}
            onPageSizeChange={setCodePageSize}
          />
        </TabsContent>

        {/* Tab 3: Usages */}
        <TabsContent value="usages" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <Select
              value={usageTemplateFilter}
              onValueChange={(v) => {
                setUsageTemplateFilter(v);
                setUsagePage(1);
              }}
            >
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('giftCard.allTemplates')}</SelectItem>
                {(templatesQuery.data?.data ?? []).map((tpl) => (
                  <SelectItem key={tpl.id} value={String(tpl.id)}>
                    {tpl.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              className="ml-auto h-8 w-8"
              onClick={() => void usagesQuery.refetch()}
              disabled={usagesQuery.isFetching}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${usagesQuery.isFetching ? 'animate-spin' : ''}`}
              />
            </Button>
          </div>

          <div className="overflow-x-auto rounded-lg border bg-card/60">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">ID</th>
                  <th className="px-3 py-3 font-medium">{t('giftCard.code')}</th>
                  <th className="px-3 py-3 font-medium">{t('order.userEmail')}</th>
                  <th className="px-3 py-3 font-medium">{t('giftCard.templateName')}</th>
                  <th className="px-3 py-3 font-medium">{t('giftCard.usedAt')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(usagesQuery.data?.data ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                      {t('giftCard.emptyUsages')}
                    </td>
                  </tr>
                ) : (
                  (usagesQuery.data?.data ?? []).map((u) => (
                    <tr key={u.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">#{u.id}</td>
                      <td className="px-3 py-3 font-mono text-xs">
                        {typeof u.code === 'string' ? u.code : u.code?.code || '—'}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {u.user?.email || u.user_email || '—'}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {u.template?.name || u.template_name || '—'}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        {formatTimestamp(u.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <DataTablePagination
            total={usagesQuery.data?.total ?? 0}
            page={usagePage}
            pageSize={usagePageSize}
            pageSizeOptions={[15, 20, 50, 100]}
            onPageChange={setUsagePage}
            onPageSizeChange={setUsagePageSize}
          />
        </TabsContent>

        {/* Tab 4: Statistics */}
        <TabsContent value="stats" className="mt-4 space-y-4">
          {statsQuery.isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border bg-card/70 p-4">
                  <p className="text-xs text-muted-foreground">{t('giftCard.stats.templates')}</p>
                  <p className="mt-1 text-2xl font-bold">
                    {statsQuery.data?.total_stats.templates_count ?? 0}
                  </p>
                </div>
                <div className="rounded-xl border bg-card/70 p-4">
                  <p className="text-xs text-muted-foreground">
                    {t('giftCard.stats.activeTemplates')}
                  </p>
                  <p className="mt-1 text-2xl font-bold text-emerald-500">
                    {statsQuery.data?.total_stats.active_templates_count ?? 0}
                  </p>
                </div>
                <div className="rounded-xl border bg-card/70 p-4">
                  <p className="text-xs text-muted-foreground">{t('giftCard.stats.totalCodes')}</p>
                  <p className="mt-1 text-2xl font-bold">
                    {statsQuery.data?.total_stats.codes_count ?? 0}
                  </p>
                </div>
                <div className="rounded-xl border bg-card/70 p-4">
                  <p className="text-xs text-muted-foreground">{t('giftCard.stats.usedCodes')}</p>
                  <p className="mt-1 text-2xl font-bold text-[var(--xb-accent)]">
                    {statsQuery.data?.total_stats.used_codes_count ?? 0}
                  </p>
                </div>
              </div>

              {(statsQuery.data?.daily_usages ?? []).length > 0 && (
                <div className="rounded-xl border bg-card/70 p-5">
                  <h3 className="mb-4 text-sm font-medium">{t('giftCard.stats.dailyTrend')}</h3>
                  <div className="h-60 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={statsQuery.data?.daily_usages ?? []}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(val) => Number(val ?? 0)} />
                        <Area
                          type="monotone"
                          dataKey="count"
                          stroke="#6e9ad1"
                          fill="#6e9ad1"
                          fillOpacity={0.2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Create / Edit Template Modal */}
      <Dialog open={tplDialogOpen} onOpenChange={setTplDialogOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b bg-[var(--xb-heading)] px-6 py-4">
            <DialogTitle>
              {editingTpl ? t('giftCard.editTemplate') : t('giftCard.createTemplate')}
            </DialogTitle>
            <DialogDescription>{t('giftCard.templateDialogDesc')}</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveTpl} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              {/* Basic */}
              <div className="space-y-3 rounded-lg border bg-[var(--xb-panel)] p-4">
                <h4 className="text-xs font-semibold text-muted-foreground">
                  {t('giftCard.sections.basic')}
                </h4>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">{t('giftCard.name')}</Label>
                    <Input value={tplName} onChange={(e) => setTplName(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t('giftCard.type')}</Label>
                    <Select
                      value={String(tplFormType)}
                      onValueChange={(v) => setTplFormType(Number(v) as 1 | 2 | 3)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">{t('giftCard.types.1')}</SelectItem>
                        <SelectItem value="2">{t('giftCard.types.2')}</SelectItem>
                        <SelectItem value="3">{t('giftCard.types.3')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t('giftCard.description')}</Label>
                  <Textarea
                    rows={2}
                    value={tplDesc}
                    onChange={(e) => setTplDesc(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">{t('serverNode.sort')}</Label>
                    <Input
                      type="number"
                      value={tplSort}
                      onChange={(e) => setTplSort(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-md border bg-[var(--input-bg)] px-3 py-2 sm:mt-5">
                    <Label className="text-xs">{t('giftCard.status')}</Label>
                    <Switch checked={tplEnabled} onCheckedChange={setTplEnabled} />
                  </div>
                </div>
              </div>

              {/* Rewards */}
              <div className="space-y-3 rounded-lg border bg-[var(--xb-panel)] p-4">
                <h4 className="text-xs font-semibold text-muted-foreground">
                  {t('giftCard.sections.rewards')}
                </h4>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">{t('giftCard.rewardBalanceYuan')}</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={rewardBalanceYuan}
                      onChange={(e) => setRewardBalanceYuan(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t('giftCard.rewardTrafficGb')}</Label>
                    <Input
                      type="number"
                      min={0}
                      value={rewardTrafficGb}
                      onChange={(e) => setRewardTrafficGb(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t('giftCard.rewardExpireDays')}</Label>
                    <Input
                      type="number"
                      min={0}
                      value={rewardExpireDays}
                      onChange={(e) => setRewardExpireDays(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t('giftCard.rewardDeviceLimit')}</Label>
                    <Input
                      type="number"
                      min={0}
                      value={rewardDeviceLimit}
                      onChange={(e) => setRewardDeviceLimit(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </div>

                {tplFormType === 2 && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">{t('order.plan')}</Label>
                      <Select value={rewardPlanId} onValueChange={setRewardPlanId}>
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
                    <div className="space-y-1">
                      <Label className="text-xs">{t('giftCard.planValidityDays')}</Label>
                      <Input
                        type="number"
                        min={1}
                        value={rewardPlanDays}
                        onChange={(e) => setRewardPlanDays(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between rounded-md border bg-[var(--input-bg)] px-3 py-2">
                  <Label className="text-xs">{t('giftCard.resetPackage')}</Label>
                  <Switch checked={rewardResetPkg} onCheckedChange={setRewardResetPkg} />
                </div>
              </div>

              {/* Conditions & Limits */}
              <div className="space-y-3 rounded-lg border bg-[var(--xb-panel)] p-4">
                <h4 className="text-xs font-semibold text-muted-foreground">
                  {t('giftCard.sections.conditionsAndLimits')}
                </h4>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="flex items-center justify-between rounded-md border bg-[var(--input-bg)] px-3 py-2">
                    <Label className="text-xs">{t('giftCard.newUserOnly')}</Label>
                    <Switch checked={condNewUserOnly} onCheckedChange={setCondNewUserOnly} />
                  </div>
                  <div className="flex items-center justify-between rounded-md border bg-[var(--input-bg)] px-3 py-2">
                    <Label className="text-xs">{t('giftCard.paidOnly')}</Label>
                    <Switch checked={condPaidOnly} onCheckedChange={setCondPaidOnly} />
                  </div>
                  <div className="flex items-center justify-between rounded-md border bg-[var(--input-bg)] px-3 py-2">
                    <Label className="text-xs">{t('giftCard.requireInvite')}</Label>
                    <Switch checked={condRequireInvite} onCheckedChange={setCondRequireInvite} />
                  </div>
                </div>

                {condNewUserOnly && (
                  <div className="space-y-1">
                    <Label className="text-xs">{t('giftCard.newUserMaxDays')}</Label>
                    <Input
                      type="number"
                      min={1}
                      value={condNewUserDays}
                      onChange={(e) => setCondNewUserDays(e.target.value)}
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs">{t('giftCard.maxPerUser')}</Label>
                    <Input
                      type="number"
                      min={1}
                      value={limitMaxPerUser}
                      onChange={(e) => setLimitMaxPerUser(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t('giftCard.cooldownHours')}</Label>
                    <Input
                      type="number"
                      min={1}
                      value={limitCooldownHours}
                      onChange={(e) => setLimitCooldownHours(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t('giftCard.inviteRatePct')}</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={limitInviteRate}
                      onChange={(e) => setLimitInviteRate(e.target.value)}
                    />
                  </div>
                </div>

                {(plansQuery.data ?? []).length > 0 && (
                  <div className="space-y-1">
                    <Label className="text-xs">{t('giftCard.allowedPlans')}</Label>
                    <div className="flex flex-wrap gap-3 rounded-md border bg-[var(--input-bg)] p-2.5">
                      {(plansQuery.data ?? []).map((p) => (
                        <label key={p.id} className="flex items-center gap-1.5 text-xs">
                          <Checkbox
                            checked={condAllowedPlans.includes(p.id)}
                            onCheckedChange={(c) =>
                              setCondAllowedPlans(
                                c
                                  ? [...condAllowedPlans, p.id]
                                  : condAllowedPlans.filter((id) => id !== p.id),
                              )
                            }
                          />
                          <span>{p.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t bg-[var(--xb-heading)] px-6 py-3.5">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setTplDialogOpen(false)}
                disabled={saveTplMutation.isPending}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={saveTplMutation.isPending}>
                {saveTplMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('common.confirm')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Generate Codes Modal */}
      <Dialog open={genOpen} onOpenChange={setGenOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('giftCard.generateCodes')}</DialogTitle>
            <DialogDescription>{t('giftCard.generateDialogDesc')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleGenerateSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('giftCard.selectTemplate')} *</Label>
              <Select value={genTemplateId} onValueChange={setGenTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('giftCard.selectTemplate')} />
                </SelectTrigger>
                <SelectContent>
                  {(templatesQuery.data?.data ?? []).map((tpl) => (
                    <SelectItem key={tpl.id} value={String(tpl.id)}>
                      {tpl.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('giftCard.generateCount')} *</Label>
                <Input
                  type="number"
                  min={1}
                  max={10000}
                  value={genCount}
                  onChange={(e) => setGenCount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('giftCard.prefix')}</Label>
                <Input
                  maxLength={10}
                  value={genPrefix}
                  onChange={(e) => setGenPrefix(e.target.value.toUpperCase())}
                  placeholder="GC"
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('giftCard.expiresHours')}</Label>
                <Input
                  type="number"
                  min={1}
                  value={genExpiresHours}
                  onChange={(e) => setGenExpiresHours(e.target.value)}
                  placeholder={t('giftCard.permanent')}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('giftCard.maxUsage')}</Label>
                <Input
                  type="number"
                  min={1}
                  max={1000}
                  value={genMaxUsage}
                  onChange={(e) => setGenMaxUsage(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border bg-[var(--xb-panel)] px-3.5 py-2.5">
              <Label className="text-xs">{t('giftCard.downloadCsv')}</Label>
              <Switch checked={genDownloadCsv} onCheckedChange={setGenDownloadCsv} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setGenOpen(false)}
                disabled={genCodesMutation.isPending}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={genCodesMutation.isPending}>
                {genCodesMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('common.confirm')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deletingTpl)}
        onOpenChange={(o) => !o && setDeletingTpl(null)}
        title={t('giftCard.deleteTemplateTitle')}
        description={t('giftCard.deleteTemplateDesc', { name: deletingTpl?.name ?? '' })}
        loading={deleteTplMutation.isPending}
        onConfirm={() => deletingTpl && deleteTplMutation.mutate(deletingTpl.id)}
      />

      <ConfirmDialog
        open={Boolean(deletingCode)}
        onOpenChange={(o) => !o && setDeletingCode(null)}
        title={t('giftCard.deleteCodeTitle')}
        description={t('giftCard.deleteCodeDesc', { code: deletingCode?.code ?? '' })}
        loading={deleteCodeMutation.isPending}
        onConfirm={() => deletingCode && deleteCodeMutation.mutate(deletingCode.id)}
      />
    </div>
  );
}
