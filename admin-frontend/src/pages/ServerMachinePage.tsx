import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  CircleOff,
  Copy,
  KeyRound,
  Layers,
  Loader2,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Server,
  Terminal,
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
import { copyText } from '@/lib/clipboard';
import {
  dropServerMachine,
  fetchServerMachines,
  getMachineHistory,
  getMachineInstallCommand,
  getMachineNodes,
  getMachineToken,
  resetMachineToken,
  saveServerMachine,
  type MachineCreateResult,
  type ServerMachineItem,
} from '@/api/serverMachine';
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
import { formatBytes, formatTimestamp } from '@/lib/format';

function isMachineOnline(lastSeenAt: number | null | undefined): boolean {
  if (!lastSeenAt) return false;
  return Date.now() / 1000 - lastSeenAt <= 300;
}

function isMachineHighLoad(m: ServerMachineItem): boolean {
  if (!isMachineOnline(m.last_seen_at) || !m.load_status) return false;
  const cpu = Number(m.load_status.cpu ?? 0);
  const memTotal = Number(m.load_status.mem?.total ?? 0);
  const memUsed = Number(m.load_status.mem?.used ?? 0);
  const memPct = memTotal > 0 ? (memUsed / memTotal) * 100 : 0;
  return cpu >= 80 || memPct >= 85;
}

function formatSpeed(bytesPerSec: number | null | undefined): string {
  const num = Number(bytesPerSec ?? 0);
  if (!Number.isFinite(num) || num <= 0) return '0 B/s';
  return `${formatBytes(num)}/s`;
}

type SortKey = 'id' | 'name' | 'status' | 'last_seen_at';

export default function ServerMachinePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [nodeFilter, setNodeFilter] = useState<'all' | 'bound' | 'unbound'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('id');
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ServerMachineItem | null>(null);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [createdResult, setCreatedResult] = useState<MachineCreateResult | null>(null);

  const [deleting, setDeleting] = useState<ServerMachineItem | null>(null);
  const [installMachine, setInstallMachine] = useState<ServerMachineItem | null>(null);
  const [tokenMachine, setTokenMachine] = useState<ServerMachineItem | null>(null);
  const [confirmResetToken, setConfirmResetToken] = useState(false);
  const [nodesMachine, setNodesMachine] = useState<ServerMachineItem | null>(null);
  const [historyMachine, setHistoryMachine] = useState<ServerMachineItem | null>(null);
  const [rangeHours, setRangeHours] = useState<number>(6);

  const machinesQuery = useQuery({
    queryKey: ['server-machines'],
    queryFn: fetchServerMachines,
  });

  const installCmdQuery = useQuery({
    queryKey: ['machine-install-cmd', installMachine?.id],
    queryFn: () => getMachineInstallCommand(installMachine!.id),
    enabled: Boolean(installMachine),
  });

  const tokenQuery = useQuery({
    queryKey: ['machine-token', tokenMachine?.id],
    queryFn: () => getMachineToken(tokenMachine!.id),
    enabled: Boolean(tokenMachine),
  });

  const machineNodesQuery = useQuery({
    queryKey: ['machine-nodes', nodesMachine?.id],
    queryFn: () => getMachineNodes(nodesMachine!.id),
    enabled: Boolean(nodesMachine),
  });

  const historyQuery = useQuery({
    queryKey: ['machine-history', historyMachine?.id, rangeHours],
    queryFn: () => getMachineHistory(historyMachine!.id, rangeHours, 180),
    enabled: Boolean(historyMachine),
  });

  const stats = useMemo(() => {
    const list = machinesQuery.data ?? [];
    let online = 0;
    let highLoad = 0;
    let totalNodes = 0;
    for (const m of list) {
      if (isMachineOnline(m.last_seen_at)) online += 1;
      if (isMachineHighLoad(m)) highLoad += 1;
      totalNodes += m.servers_count || 0;
    }
    return {
      total: list.length,
      online,
      offline: list.length - online,
      highLoad,
      totalNodes,
    };
  }, [machinesQuery.data]);

  const filteredMachines = useMemo(() => {
    const list = [...(machinesQuery.data ?? [])];
    const q = search.trim().toLowerCase();
    const filtered = list.filter((m) => {
      const online = isMachineOnline(m.last_seen_at);
      if (statusFilter === 'online' && !online) return false;
      if (statusFilter === 'offline' && online) return false;
      if (nodeFilter === 'bound' && (m.servers_count || 0) === 0) return false;
      if (nodeFilter === 'unbound' && (m.servers_count || 0) > 0) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        (m.notes ?? '').toLowerCase().includes(q) ||
        String(m.id).includes(q)
      );
    });

    filtered.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'id') cmp = a.id - b.id;
      else if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortKey === 'status') {
        cmp = Number(isMachineOnline(a.last_seen_at)) - Number(isMachineOnline(b.last_seen_at));
      } else {
        cmp = Number(a.last_seen_at ?? 0) - Number(b.last_seen_at ?? 0);
      }
      return cmp !== 0 ? (sortAsc ? cmp : -cmp) : a.id - b.id;
    });
    return filtered;
  }, [machinesQuery.data, search, statusFilter, nodeFilter, sortKey, sortAsc]);

  const pagedMachines = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredMachines.slice(start, start + pageSize);
  }, [filteredMachines, page, pageSize]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const saveMutation = useMutation({
    mutationFn: saveServerMachine,
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['server-machines'] });
      if (typeof data === 'object' && data !== null && 'token' in data) {
        setCreatedResult(data);
        toast.success(t('serverMachine.createSuccess'));
      } else {
        toast.success(t('common.saveSuccess'));
        setFormOpen(false);
      }
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (m: ServerMachineItem) =>
      saveServerMachine({ id: m.id, name: m.name, is_active: !m.is_active }),
    onSuccess: () => {
      toast.success(t('common.operationSuccess'));
      void queryClient.invalidateQueries({ queryKey: ['server-machines'] });
    },
  });

  const dropMutation = useMutation({
    mutationFn: dropServerMachine,
    onSuccess: () => {
      toast.success(t('common.deleteSuccess'));
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: ['server-machines'] });
    },
  });

  const resetTokenMutation = useMutation({
    mutationFn: resetMachineToken,
    onSuccess: () => {
      toast.success(t('serverMachine.tokenResetSuccess'));
      setConfirmResetToken(false);
      void queryClient.invalidateQueries({ queryKey: ['machine-token', tokenMachine?.id] });
    },
  });

  const openCreate = () => {
    setEditing(null);
    setCreatedResult(null);
    setName('');
    setNotes('');
    setIsActive(true);
    setFormOpen(true);
  };

  const openEdit = (m: ServerMachineItem) => {
    setEditing(m);
    setCreatedResult(null);
    setName(m.name);
    setNotes(m.notes ?? '');
    setIsActive(Boolean(m.is_active));
    setFormOpen(true);
  };

  const handleSave = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(t('serverMachine.nameRequired'));
      return;
    }
    saveMutation.mutate({
      ...(editing ? { id: editing.id } : {}),
      name: trimmed,
      notes: notes.trim() || null,
      is_active: isActive,
    });
  };

  const historyChartData = useMemo(() => {
    return (historyQuery.data ?? []).map((item) => {
      const memPct =
        item.mem_total > 0 ? Math.round((item.mem_used / item.mem_total) * 1000) / 10 : 0;
      const date = new Date(item.recorded_at * 1000);
      const timeLabel = `${String(date.getHours()).padStart(2, '0')}:${String(
        date.getMinutes(),
      ).padStart(2, '0')}`;
      return {
        time: timeLabel,
        cpu: Number((item.cpu ?? 0).toFixed(1)),
        mem: memPct,
        netIn: Math.round((item.net_in_speed ?? 0) / 1024),
        netOut: Math.round((item.net_out_speed ?? 0) / 1024),
      };
    });
  }, [historyQuery.data]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t('nav.machineManagement')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('serverMachine.pageSubtitle')}</p>
      </div>

      {/* 5-Card KPI Strip matching Xboard-u */}
      <div className="grid gap-3 rounded-xl border bg-card/70 p-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="flex items-center justify-between rounded-lg border bg-background/60 px-4 py-3">
          <div>
            <p className="text-xs text-muted-foreground">{t('serverMachine.kpi.total')}</p>
            <p className="mt-1 text-2xl font-bold">{stats.total}</p>
          </div>
          <span className="flex h-8 w-8 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground">
            <Server className="h-4 w-4" />
          </span>
        </div>

        <div className="flex items-center justify-between rounded-lg border bg-background/60 px-4 py-3">
          <div>
            <p className="text-xs text-muted-foreground">{t('serverMachine.kpi.online')}</p>
            <p className="mt-1 text-2xl font-bold">{stats.online}</p>
          </div>
          <span className="flex h-8 w-8 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-500">
            <CheckCircle2 className="h-4 w-4" />
          </span>
        </div>

        <div className="flex items-center justify-between rounded-lg border bg-background/60 px-4 py-3">
          <div>
            <p className="text-xs text-muted-foreground">{t('serverMachine.kpi.offline')}</p>
            <p className="mt-1 text-2xl font-bold">{stats.offline}</p>
          </div>
          <span className="flex h-8 w-8 items-center justify-center rounded-md border border-teal-500/30 bg-teal-500/10 text-teal-500">
            <CircleOff className="h-4 w-4" />
          </span>
        </div>

        <div className="flex items-center justify-between rounded-lg border bg-background/60 px-4 py-3">
          <div>
            <p className="text-xs text-muted-foreground">{t('serverMachine.kpi.highLoad')}</p>
            <p className="mt-1 text-2xl font-bold">{stats.highLoad}</p>
          </div>
          <span className="flex h-8 w-8 items-center justify-center rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-500">
            <AlertTriangle className="h-4 w-4" />
          </span>
        </div>

        <div className="flex items-center justify-between rounded-lg border bg-background/60 px-4 py-3">
          <div>
            <p className="text-xs text-muted-foreground">{t('serverMachine.kpi.linkedNodes')}</p>
            <p className="mt-1 text-2xl font-bold">{stats.totalNodes}</p>
          </div>
          <span className="flex h-8 w-8 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground">
            <Layers className="h-4 w-4" />
          </span>
        </div>
      </div>

      {/* Single-Row Toolbar */}
      <div className="flex flex-wrap items-center gap-2.5">
        <Button variant="outline" size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          {t('serverMachine.create')}
        </Button>

        <div className="relative min-w-[220px] flex-1 max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={t('serverMachine.searchPlaceholder')}
            className="h-8 pl-9 text-xs"
          />
        </div>

        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v as 'all' | 'online' | 'offline');
            setPage(1);
          }}
        >
          <SelectTrigger className="h-8 w-[125px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('serverMachine.filterStatusAll')}</SelectItem>
            <SelectItem value="online">{t('serverMachine.online')}</SelectItem>
            <SelectItem value="offline">{t('serverMachine.offline')}</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={nodeFilter}
          onValueChange={(v) => {
            setNodeFilter(v as 'all' | 'bound' | 'unbound');
            setPage(1);
          }}
        >
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('serverMachine.filterNodesAll')}</SelectItem>
            <SelectItem value="bound">{t('serverMachine.filterNodesBound')}</SelectItem>
            <SelectItem value="unbound">{t('serverMachine.filterNodesUnbound')}</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="icon"
          className="ml-auto h-8 w-8"
          onClick={() => void machinesQuery.refetch()}
          disabled={machinesQuery.isFetching}
          title={t('common.refresh')}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${machinesQuery.isFetching ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Status Pills + Helper Line */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="secondary" className="font-mono font-normal">
            {t('serverMachine.onlineSummary', { online: stats.online, total: stats.total })}
          </Badge>
          <Badge variant="secondary" className="font-mono font-normal">
            {t('serverMachine.highLoadSummary', { count: stats.highLoad })}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">{t('serverMachine.helperText')}</p>
      </div>

      {/* Main 6-Column Table */}
      <div className="overflow-x-auto rounded-lg border bg-card/60">
        {machinesQuery.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                    onClick={() => toggleSort('name')}
                  >
                    {t('serverMachine.machine')}
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-4 py-3 font-medium">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                    onClick={() => toggleSort('status')}
                  >
                    {t('serverMachine.status')}
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-4 py-3 font-medium">{t('serverMachine.load')}</th>
                <th className="px-4 py-3 font-medium">{t('serverMachine.nodes')}</th>
                <th className="px-4 py-3 font-medium">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                    onClick={() => toggleSort('last_seen_at')}
                  >
                    {t('serverMachine.lastHeartbeat')}
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="w-56 border-l px-4 py-3 text-right font-medium">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pagedMachines.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                    {t('serverMachine.empty')}
                  </td>
                </tr>
              ) : (
                pagedMachines.map((machine) => {
                  const online = isMachineOnline(machine.last_seen_at);
                  const load = machine.load_status;
                  const memPct =
                    load?.mem?.total && load.mem.total > 0
                      ? Math.round((load.mem.used / load.mem.total) * 100)
                      : 0;
                  const diskPct =
                    load?.disk?.total && load.disk.total > 0
                      ? Math.round((load.disk.used / load.disk.total) * 100)
                      : 0;
                  return (
                    <tr key={machine.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">
                            #{machine.id}
                          </span>
                          <span className="font-medium">{machine.name}</span>
                          {!machine.is_active && (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                              {t('common.disabled')}
                            </Badge>
                          )}
                        </div>
                        {machine.notes && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{machine.notes}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-2 w-2 rounded-full ${
                              online ? 'bg-emerald-500' : 'bg-muted-foreground/40'
                            }`}
                          />
                          <span
                            className={
                              online
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-muted-foreground'
                            }
                          >
                            {online ? t('serverMachine.online') : t('serverMachine.offline')}
                          </span>
                          <Switch
                            checked={Boolean(machine.is_active)}
                            onCheckedChange={() => toggleActiveMutation.mutate(machine)}
                            aria-label={t('serverMachine.active')}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {load ? (
                          <div className="space-y-1 text-xs">
                            <div className="flex items-center gap-3">
                              <span>CPU {Number(load.cpu ?? 0).toFixed(1)}%</span>
                              <span>
                                MEM {memPct}% ({formatBytes(load.mem?.used)})
                              </span>
                              {load.disk && load.disk.total > 0 && <span>DISK {diskPct}%</span>}
                            </div>
                            {load.net && (
                              <div className="font-mono text-[11px] text-muted-foreground">
                                ↓ {formatSpeed(load.net.in_speed)} · ↑{' '}
                                {formatSpeed(load.net.out_speed)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {t('serverMachine.waitingHeartbeat')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 px-2.5 text-xs"
                          onClick={() => setNodesMachine(machine)}
                        >
                          <Network className="h-3.5 w-3.5" />
                          {machine.servers_count}
                        </Button>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {machine.last_seen_at
                          ? formatTimestamp(machine.last_seen_at)
                          : t('serverMachine.neverSeen')}
                      </td>
                      <td className="border-l px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setInstallMachine(machine)}
                            title={t('serverMachine.installCommand')}
                          >
                            <Terminal className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setHistoryMachine(machine)}
                            title={t('serverMachine.loadHistory')}
                          >
                            <Activity className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setTokenMachine(machine)}
                            title={t('serverMachine.tokenTitle')}
                          >
                            <KeyRound className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(machine)}
                            title={t('common.edit')}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleting(machine)}
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
        total={filteredMachines.length}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      {/* Create / Edit Machine Dialog matching Xboard-u compact 448px modal */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-[448px]">
          <DialogHeader>
            <DialogTitle>
              {createdResult
                ? t('serverMachine.setupReadyTitle')
                : editing
                  ? t('serverMachine.editTitle')
                  : t('serverMachine.createTitle')}
            </DialogTitle>
            <DialogDescription>
              {createdResult
                ? t('serverMachine.setupReadyDescription')
                : t('serverMachine.dialogDescription')}
            </DialogDescription>
          </DialogHeader>

          {createdResult ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t('serverMachine.token')}</Label>
                <div className="flex items-center gap-2">
                  <Input readOnly value={createdResult.token} className="font-mono text-xs" />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void copyText(createdResult.token)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t('serverMachine.installCommand')}</Label>
                <Textarea
                  readOnly
                  rows={4}
                  value={createdResult.install_command}
                  className="font-mono text-xs"
                />
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void copyText(createdResult.install_command)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {t('common.copy')}
                  </Button>
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <Button onClick={() => setFormOpen(false)}>{t('common.close')}</Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="machine-name">{t('serverMachine.name')}</Label>
                <Input
                  id="machine-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('serverMachine.namePlaceholder')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="machine-notes">{t('serverMachine.notes')}</Label>
                <Textarea
                  id="machine-notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('serverMachine.notesPlaceholder')}
                />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border bg-card/70 px-3.5 py-3">
                <div>
                  <Label htmlFor="machine-active" className="cursor-pointer text-sm font-medium">
                    {t('serverMachine.enableMachine')}
                  </Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t('serverMachine.enableMachineHint')}
                  </p>
                </div>
                <Switch
                  id="machine-active"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setFormOpen(false)}
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
          )}
        </DialogContent>
      </Dialog>

      {/* Install Command Dialog */}
      <Dialog open={Boolean(installMachine)} onOpenChange={(o) => !o && setInstallMachine(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {t('serverMachine.installCommand')} — {installMachine?.name}
            </DialogTitle>
            <DialogDescription>{t('serverMachine.installCommandHint')}</DialogDescription>
          </DialogHeader>
          {installCmdQuery.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <div className="space-y-3">
              <Textarea
                readOnly
                rows={4}
                value={installCmdQuery.data?.command ?? ''}
                className="font-mono text-xs"
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => void copyText(installCmdQuery.data?.command ?? '')}
                >
                  <Copy className="h-4 w-4" />
                  {t('common.copy')}
                </Button>
                <Button onClick={() => setInstallMachine(null)}>{t('common.close')}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Token Dialog */}
      <Dialog open={Boolean(tokenMachine)} onOpenChange={(o) => !o && setTokenMachine(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t('serverMachine.tokenTitle')} — {tokenMachine?.name}
            </DialogTitle>
            <DialogDescription>{t('serverMachine.tokenHint')}</DialogDescription>
          </DialogHeader>
          {tokenQuery.isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={tokenQuery.data?.token ?? ''}
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void copyText(tokenQuery.data?.token ?? '')}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex justify-between pt-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmResetToken(true)}
                >
                  {t('serverMachine.resetToken')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setTokenMachine(null)}>
                  {t('common.close')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Linked Nodes Dialog */}
      <Dialog open={Boolean(nodesMachine)} onOpenChange={(o) => !o && setNodesMachine(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {t('serverMachine.linkedNodesTitle')} — {nodesMachine?.name}
            </DialogTitle>
            <DialogDescription>{t('serverMachine.linkedNodesHint')}</DialogDescription>
          </DialogHeader>
          {machineNodesQuery.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (machineNodesQuery.data ?? []).length === 0 ? (
            <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
              {t('serverMachine.noLinkedNodes')}
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">ID</th>
                    <th className="px-3 py-2">{t('serverNode.name')}</th>
                    <th className="px-3 py-2">{t('serverNode.protocol')}</th>
                    <th className="px-3 py-2">{t('serverNode.address')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(machineNodesQuery.data ?? []).map((n) => (
                    <tr key={n.id}>
                      <td className="px-3 py-2 font-mono text-xs">#{n.id}</td>
                      <td className="px-3 py-2 font-medium">{n.name}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline">{n.type}</Badge>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {n.host}:{n.port}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            {nodesMachine && (
              <Button
                variant="outline"
                onClick={() => {
                  const id = nodesMachine.id;
                  setNodesMachine(null);
                  navigate(`/server/manage?machine_id=${id}`);
                }}
              >
                {t('serverMachine.manageInNodes')}
              </Button>
            )}
            <Button onClick={() => setNodesMachine(null)}>{t('common.close')}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Load History Dialog */}
      <Dialog open={Boolean(historyMachine)} onOpenChange={(o) => !o && setHistoryMachine(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <div className="flex items-center justify-between pr-6">
              <div>
                <DialogTitle>
                  {t('serverMachine.loadHistory')} — {historyMachine?.name}
                </DialogTitle>
                <DialogDescription>{t('serverMachine.loadHistoryHint')}</DialogDescription>
              </div>
              <Select
                value={String(rangeHours)}
                onValueChange={(v) => setRangeHours(Number(v))}
              >
                <SelectTrigger className="w-[110px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1h</SelectItem>
                  <SelectItem value="6">6h</SelectItem>
                  <SelectItem value="24">24h</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </DialogHeader>

          {historyQuery.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : historyChartData.length === 0 ? (
            <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
              {t('serverMachine.noHistoryData')}
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  CPU / Memory (%)
                </p>
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={historyChartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(val) => `${Number(val ?? 0).toFixed(1)}%`} />
                      <Area
                        type="monotone"
                        dataKey="cpu"
                        name="CPU"
                        stroke="#3b82f6"
                        fill="#3b82f6"
                        fillOpacity={0.18}
                      />
                      <Area
                        type="monotone"
                        dataKey="mem"
                        name="Memory"
                        stroke="#10b981"
                        fill="#10b981"
                        fillOpacity={0.15}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Network Speed (KB/s)
                </p>
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={historyChartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(val) => `${Number(val ?? 0)} KB/s`} />
                      <Area
                        type="monotone"
                        dataKey="netIn"
                        name="Inbound"
                        stroke="#6366f1"
                        fill="#6366f1"
                        fillOpacity={0.15}
                      />
                      <Area
                        type="monotone"
                        dataKey="netOut"
                        name="Outbound"
                        stroke="#f59e0b"
                        fill="#f59e0b"
                        fillOpacity={0.15}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmResetToken}
        onOpenChange={setConfirmResetToken}
        title={t('serverMachine.resetTokenTitle')}
        description={t('serverMachine.resetTokenDescription')}
        loading={resetTokenMutation.isPending}
        onConfirm={() => tokenMachine && resetTokenMutation.mutate(tokenMachine.id)}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('serverMachine.deleteTitle')}
        description={t('serverMachine.deleteDescription', { name: deleting?.name ?? '' })}
        loading={dropMutation.isPending}
        onConfirm={() => deleting && dropMutation.mutate(deleting.id)}
      />
    </div>
  );
}
