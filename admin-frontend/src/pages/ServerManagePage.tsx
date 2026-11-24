import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Server,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { fetchServerGroups } from '@/api/serverGroup';
import { fetchServerMachines } from '@/api/serverMachine';
import {
  batchDeleteServerNodes,
  batchResetServerNodeTraffic,
  batchUpdateServerNodes,
  copyServerNode,
  dropServerNode,
  getServerNodes,
  resetServerNodeTraffic,
  sortServerNodes,
  updateServerNode,
  type ServerNodeItem,
} from '@/api/serverNode';
import { fetchServerRoutes } from '@/api/serverRoute';
import { NodeEditorDialog } from '@/components/server/NodeEditorDialog';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataTablePagination } from '@/components/shared/DataTablePagination';
import { useDragSort } from '@/hooks/useDragSort';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { formatBytes, getTrafficUsageTone } from '@/lib/format';
import { PROTOCOL_LIST, PROTOCOL_MAP } from '@/lib/serverPresets';
import { cn } from '@/lib/utils';

type SortKey = 'default' | 'id' | 'online';

export default function ServerManagePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState('');
  const [protocolFilter, setProtocolFilter] = useState<string>('all');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [machineFilter, setMachineFilter] = useState<string>(
    () => searchParams.get('machine_id') || 'all',
  );
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('default');
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(500);
  const dragSort = useDragSort<ServerNodeItem>();

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<ServerNodeItem | null>(null);
  const [openAdvancedOnStart, setOpenAdvancedOnStart] = useState(false);

  const [deletingNode, setDeletingNode] = useState<ServerNodeItem | null>(null);
  const [resetTrafficNode, setResetTrafficNode] = useState<ServerNodeItem | null>(null);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [batchResetOpen, setBatchResetOpen] = useState(false);
  const [batchMachineOpen, setBatchMachineOpen] = useState(false);
  const [batchMachineId, setBatchMachineId] = useState<string>('none');

  useEffect(() => {
    const paramMachine = searchParams.get('machine_id');
    if (paramMachine) setMachineFilter(paramMachine);
  }, [searchParams]);

  const nodesQuery = useQuery({
    queryKey: ['server-nodes'],
    queryFn: getServerNodes,
  });

  const groupsQuery = useQuery({
    queryKey: ['server-groups'],
    queryFn: fetchServerGroups,
  });

  const routesQuery = useQuery({
    queryKey: ['server-routes'],
    queryFn: fetchServerRoutes,
  });

  const machinesQuery = useQuery({
    queryKey: ['server-machines'],
    queryFn: fetchServerMachines,
  });

  const machineNameMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const m of machinesQuery.data ?? []) {
      map.set(m.id, m.name);
    }
    return map;
  }, [machinesQuery.data]);

  const filteredNodes = useMemo(() => {
    const list = [...(nodesQuery.data ?? [])];
    const q = search.trim().toLowerCase();
    const filtered = list.filter((node) => {
      if (protocolFilter !== 'all' && node.type !== protocolFilter) return false;
      if (groupFilter !== 'all' && !(node.group_ids ?? []).includes(Number(groupFilter))) {
        return false;
      }
      if (machineFilter === 'unbound' && node.machine_id) return false;
      if (
        machineFilter !== 'all' &&
        machineFilter !== 'unbound' &&
        String(node.machine_id ?? '') !== machineFilter
      ) {
        return false;
      }
      if (statusFilter === 'online' && (node.available_status ?? 0) === 0) return false;
      if (statusFilter === 'offline' && (node.available_status ?? 0) !== 0) return false;
      if (statusFilter === 'visible' && !node.show) return false;
      if (statusFilter === 'hidden' && Boolean(node.show)) return false;

      if (!q) return true;
      return (
        node.name.toLowerCase().includes(q) ||
        node.host.toLowerCase().includes(q) ||
        String(node.id).includes(q) ||
        (node.code ?? '').toLowerCase().includes(q) ||
        (node.tags ?? []).some((tag) => tag.toLowerCase().includes(q))
      );
    });

    if (sortKey !== 'default') {
      filtered.sort((a, b) => {
        const cmp =
          sortKey === 'id' ? a.id - b.id : Number(a.online ?? 0) - Number(b.online ?? 0);
        return sortAsc ? cmp : -cmp;
      });
    }

    return filtered;
  }, [
    nodesQuery.data,
    search,
    protocolFilter,
    groupFilter,
    machineFilter,
    statusFilter,
    sortKey,
    sortAsc,
  ]);

  const pagedNodes = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredNodes.slice(start, start + pageSize);
  }, [filteredNodes, page, pageSize]);

  const toggleSort = (key: 'id' | 'online') => {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const invalidateNodes = () =>
    void queryClient.invalidateQueries({ queryKey: ['server-nodes'] });

  const updateMutation = useMutation({
    mutationFn: updateServerNode,
    onSuccess: () => {
      toast.success(t('common.operationSuccess'));
      invalidateNodes();
    },
  });

  const copyMutation = useMutation({
    mutationFn: copyServerNode,
    onSuccess: () => {
      toast.success(t('serverNode.copySuccess'));
      invalidateNodes();
    },
  });

  const dropMutation = useMutation({
    mutationFn: dropServerNode,
    onSuccess: () => {
      toast.success(t('common.deleteSuccess'));
      setDeletingNode(null);
      invalidateNodes();
    },
  });

  const resetTrafficMutation = useMutation({
    mutationFn: resetServerNodeTraffic,
    onSuccess: () => {
      toast.success(t('serverNode.resetTrafficSuccess'));
      setResetTrafficNode(null);
      invalidateNodes();
    },
  });

  const sortMutation = useMutation({
    mutationFn: sortServerNodes,
    onSuccess: () => {
      toast.success(t('common.sortSaved'));
      dragSort.exitSortMode();
      invalidateNodes();
    },
  });

  const batchUpdateMutation = useMutation({
    mutationFn: batchUpdateServerNodes,
    onSuccess: () => {
      toast.success(t('common.operationSuccess'));
      setSelectedIds([]);
      setBatchMachineOpen(false);
      invalidateNodes();
    },
  });

  const batchDeleteMutation = useMutation({
    mutationFn: batchDeleteServerNodes,
    onSuccess: () => {
      toast.success(t('common.deleteSuccess'));
      setSelectedIds([]);
      setBatchDeleteOpen(false);
      invalidateNodes();
    },
  });

  const batchResetMutation = useMutation({
    mutationFn: batchResetServerNodeTraffic,
    onSuccess: () => {
      toast.success(t('serverNode.resetTrafficSuccess'));
      setSelectedIds([]);
      setBatchResetOpen(false);
      invalidateNodes();
    },
  });

  const toggleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? pagedNodes.map((n) => n.id) : []);
  };

  const toggleSelectOne = (id: number, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter((item) => item !== id),
    );
  };

  const openCreate = () => {
    setEditingNode(null);
    setOpenAdvancedOnStart(false);
    setEditorOpen(true);
  };

  const openEdit = (node: ServerNodeItem, advanced = false) => {
    setEditingNode(node);
    setOpenAdvancedOnStart(advanced);
    setEditorOpen(true);
  };

  const allPagedSelected =
    pagedNodes.length > 0 && pagedNodes.every((n) => selectedIds.includes(n.id));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t('nav.nodeManage')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('serverNode.pageSubtitle')}</p>
      </div>

      {/* Single-Row Toolbar matching Xboard-u */}
      <div className="flex flex-wrap items-center gap-2">
        {dragSort.isSortMode ? (
          <>
            <p className="text-sm text-muted-foreground">{t('common.sortHintNode')}</p>
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
                onClick={() =>
                  sortMutation.mutate(
                    dragSort.draftItems.map((n, index) => ({ id: n.id, order: index + 1 })),
                  )
                }
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
          {t('serverNode.create')}
        </Button>

        <div className="relative min-w-[150px] flex-1 max-w-[190px]">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={t('serverNode.searchPlaceholder')}
            className="h-8 pl-8 text-xs"
          />
        </div>

        <Select
          value={protocolFilter}
          onValueChange={(v) => {
            setProtocolFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-8 w-[105px] text-xs">
            <SelectValue placeholder={t('serverNode.protocol')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('serverNode.allProtocols')}</SelectItem>
            {PROTOCOL_LIST.map((p) => (
              <SelectItem key={p.type} value={p.type}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={machineFilter}
          onValueChange={(v) => {
            setMachineFilter(v);
            setPage(1);
            if (searchParams.has('machine_id')) {
              searchParams.delete('machine_id');
              setSearchParams(searchParams, { replace: true });
            }
          }}
        >
          <SelectTrigger className="h-8 w-[115px] text-xs">
            <SelectValue placeholder={t('serverNode.machine')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('serverNode.allMachines')}</SelectItem>
            <SelectItem value="unbound">{t('serverNode.unboundMachine')}</SelectItem>
            {(machinesQuery.data ?? []).map((m) => (
              <SelectItem key={m.id} value={String(m.id)}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={groupFilter}
          onValueChange={(v) => {
            setGroupFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-8 w-[110px] text-xs">
            <SelectValue placeholder={t('serverNode.groups')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('serverNode.allGroups')}</SelectItem>
            {(groupsQuery.data ?? []).map((g) => (
              <SelectItem key={g.id} value={String(g.id)}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-8 w-[95px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.all')}</SelectItem>
            <SelectItem value="online">{t('serverMachine.online')}</SelectItem>
            <SelectItem value="offline">{t('serverMachine.offline')}</SelectItem>
            <SelectItem value="visible">{t('serverNode.visible')}</SelectItem>
            <SelectItem value="hidden">{t('serverNode.hidden')}</SelectItem>
          </SelectContent>
        </Select>

        {/* Batch Operations Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
              {t('common.actions')}
              {selectedIds.length > 0 && (
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                  {selectedIds.length}
                </Badge>
              )}
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              disabled={selectedIds.length === 0}
              onClick={() => batchUpdateMutation.mutate({ ids: selectedIds, show: 1 })}
            >
              <Eye className="mr-2 h-4 w-4" />
              {t('serverNode.batchShow')}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={selectedIds.length === 0}
              onClick={() => batchUpdateMutation.mutate({ ids: selectedIds, show: 0 })}
            >
              <EyeOff className="mr-2 h-4 w-4" />
              {t('serverNode.batchHide')}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={selectedIds.length === 0}
              onClick={() => setBatchMachineOpen(true)}
            >
              <Server className="mr-2 h-4 w-4" />
              {t('serverNode.batchBindMachine')}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={selectedIds.length === 0}
              onClick={() => setBatchResetOpen(true)}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              {t('serverNode.resetTraffic')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={selectedIds.length === 0}
              className="text-destructive focus:text-destructive"
              onClick={() => setBatchDeleteOpen(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t('common.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-auto flex items-center gap-2">
          {(nodesQuery.data?.length ?? 0) > 0 && filteredNodes.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => {
                setSelectedIds([]);
                setSortKey('default');
                dragSort.enterSortMode(nodesQuery.data ?? []);
              }}
            >
              {t('common.editSort')}
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => void nodesQuery.refetch()}
            disabled={nodesQuery.isFetching}
            title={t('common.refresh')}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${nodesQuery.isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
          </>
        )}
      </div>

      {/* Main Nodes Table matching Xboard-u columns */}
      <div className="overflow-x-auto rounded-lg border bg-card/60">
        {nodesQuery.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : dragSort.isSortMode ? (
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-10 px-2 py-3" />
                <th className="px-3 py-3 font-medium">{t('serverNode.nodeId')}</th>
                <th className="px-3 py-3 font-medium">{t('serverNode.nodeCol')}</th>
                <th className="px-3 py-3 font-medium">{t('serverNode.traffic')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {dragSort.draftItems.map((node, idx) => {
                const meta = PROTOCOL_MAP[node.type];
                const usedBytes = Number(node.u ?? 0) + Number(node.d ?? 0);
                const limitBytes = Number(node.transfer_enable ?? 0);
                const trafficTone = getTrafficUsageTone(usedBytes, limitBytes);
                const pct = Math.round(trafficTone.pct);
                const { className: dragRowClass, ...rowDragProps } = dragSort.getRowProps(idx);
                return (
                  <tr
                    key={node.id}
                    {...rowDragProps}
                    className={`hover:bg-muted/30${dragRowClass ? ` ${dragRowClass}` : ''}`}
                  >
                    <td className="px-2 py-3">
                      <div className="flex items-center justify-center">
                        <GripVertical className="h-4 w-4 cursor-move text-muted-foreground" />
                      </div>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                      {node.id}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium">{node.name}</span>
                        <Badge variant="outline" className={meta?.badgeClass ?? ''}>
                          {meta?.label ?? node.type}
                        </Badge>
                        {node.cdn_settings?.enabled && (
                          <Badge variant="secondary" className="text-[10px]">
                            CDN
                          </Badge>
                        )}
                        {Boolean(node.parent_id) && (
                          <Badge variant="outline" className="text-[10px]">
                            #{node.parent_id}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      <div className={cn('font-mono', trafficTone.textClass)}>
                        {formatBytes(usedBytes)}
                      </div>
                      {limitBytes > 0 && (
                        <div className="mt-1 w-24 space-y-0.5">
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn('h-full transition-colors', trafficTone.barClass)}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            / {formatBytes(limitBytes)}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table className="w-full min-w-[1040px] text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-3">
                  <Checkbox
                    checked={allPagedSelected}
                    onCheckedChange={(c) => toggleSelectAll(Boolean(c))}
                  />
                </th>
                <th className="px-3 py-3 font-medium">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                    onClick={() => toggleSort('id')}
                  >
                    {t('serverNode.nodeId')}
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
                <th className="px-3 py-3 font-medium">{t('serverNode.show')}</th>
                <th className="px-3 py-3 font-medium">{t('serverNode.nodeCol')}</th>
                <th className="px-3 py-3 font-medium">{t('serverNode.deployMode')}</th>
                <th className="px-3 py-3 font-medium">{t('serverNode.address')}</th>
                <th className="px-3 py-3 font-medium">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                    onClick={() => toggleSort('online')}
                  >
                    {t('serverNode.onlineCount')}
                    {sortKey === 'online' ? (
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
                <th className="px-3 py-3 font-medium">{t('serverNode.rate')}</th>
                <th className="px-3 py-3 font-medium">{t('serverNode.groups')}</th>
                <th className="px-3 py-3 font-medium">{t('serverNode.traffic')}</th>
                <th className="sticky right-0 border-l bg-card/95 px-3 py-3 text-right font-medium backdrop-blur-sm">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pagedNodes.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-sm text-muted-foreground">
                    {t('serverNode.empty')}
                  </td>
                </tr>
              ) : (
                pagedNodes.map((node) => {
                  const meta = PROTOCOL_MAP[node.type];
                  const usedBytes = Number(node.u ?? 0) + Number(node.d ?? 0);
                  const limitBytes = Number(node.transfer_enable ?? 0);
                  const trafficTone = getTrafficUsageTone(usedBytes, limitBytes);
                  const pct = Math.round(trafficTone.pct);
                  const avail = node.available_status ?? 0;
                  const displayServerPort = node.cdn_settings?.enabled
                    ? node.cdn_settings.server?.server_port ?? ''
                    : node.server_port;

                  return (
                    <tr key={node.id} className="hover:bg-muted/30">
                      <td className="px-3 py-3">
                        <Checkbox
                          checked={selectedIds.includes(node.id)}
                          onCheckedChange={(c) => toggleSelectOne(node.id, Boolean(c))}
                        />
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                        {node.id}
                      </td>
                      <td className="px-3 py-3">
                        <Switch
                          checked={Boolean(node.show)}
                          onCheckedChange={(checked) =>
                            updateMutation.mutate({ id: node.id, show: checked ? 1 : 0 })
                          }
                        />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium">{node.name}</span>
                          <Badge variant="outline" className={meta?.badgeClass ?? ''}>
                            {meta?.label ?? node.type}
                          </Badge>
                          {node.cdn_settings?.enabled && (
                            <Badge variant="secondary" className="text-[10px]">
                              CDN
                            </Badge>
                          )}
                          {Boolean(node.parent_id) && (
                            <Badge variant="outline" className="text-[10px]">
                              #{node.parent_id}
                            </Badge>
                          )}
                        </div>
                        {(node.tags ?? []).length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {node.tags?.map((tag) => (
                              <Badge
                                key={tag}
                                variant="secondary"
                                className="px-1.5 py-0 text-[10px]"
                              >
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {node.machine_id ? (
                          <Badge variant="outline" className="font-normal">
                            {machineNameMap.get(node.machine_id) || `#${node.machine_id}`}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">
                            {t('serverNode.standalone')}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs">
                        <div>
                          {node.host}:{node.port}
                        </div>
                        {String(displayServerPort) !== String(node.port) && (
                          <div className="text-[11px] text-muted-foreground">
                            ({t('serverNode.internalPort')} {displayServerPort})
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5 text-xs">
                          <span
                            className={`h-2 w-2 rounded-full ${
                              avail === 2
                                ? 'bg-emerald-500'
                                : avail === 1
                                  ? 'bg-amber-500'
                                  : 'bg-muted-foreground/40'
                            }`}
                          />
                          <span className="font-mono">{node.online ?? 0}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs">
                        <span>{node.rate}x</span>
                        {node.rate_time_enable && (
                          <Badge variant="outline" className="ml-1 px-1 py-0 text-[10px]">
                            {t('serverNode.timed')}
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <div className="flex flex-wrap gap-1">
                          {(node.groups ?? []).length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            (node.groups ?? []).map((g) => (
                              <Badge key={g.id} variant="outline" className="text-[10px]">
                                {g.name}
                              </Badge>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <div className={cn('font-mono', trafficTone.textClass)}>
                          {formatBytes(usedBytes)}
                        </div>
                        {limitBytes > 0 && (
                          <div className="mt-1 w-24 space-y-0.5">
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn('h-full transition-colors', trafficTone.barClass)}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              / {formatBytes(limitBytes)}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="sticky right-0 border-l bg-card/95 px-3 py-3 text-right backdrop-blur-sm">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(node, false)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              {t('common.edit')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEdit(node, true)}>
                              <SlidersHorizontal className="mr-2 h-4 w-4" />
                              {t('serverNode.advancedSettings')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => copyMutation.mutate(node.id)}>
                              <Copy className="mr-2 h-4 w-4" />
                              {t('serverNode.copy')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setResetTrafficNode(node)}>
                              <RotateCcw className="mr-2 h-4 w-4" />
                              {t('serverNode.resetTraffic')}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeletingNode(node)}
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

      {!dragSort.isSortMode && (
        <DataTablePagination
          total={filteredNodes.length}
          selectedCount={selectedIds.length}
          page={page}
          pageSize={pageSize}
          pageSizeOptions={[20, 50, 100, 500]}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      )}

      <NodeEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        editing={editingNode}
        openAdvancedOnStart={openAdvancedOnStart}
        allNodes={nodesQuery.data ?? []}
        groups={groupsQuery.data ?? []}
        routes={routesQuery.data ?? []}
        machines={machinesQuery.data ?? []}
      />

      {/* Batch Bind Machine Dialog */}
      <Dialog open={batchMachineOpen} onOpenChange={setBatchMachineOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('serverNode.batchBindMachine')}</DialogTitle>
            <DialogDescription>
              {t('serverNode.selectedCount', { count: selectedIds.length })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={batchMachineId} onValueChange={setBatchMachineId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('serverNode.unboundMachine')}</SelectItem>
                {(machinesQuery.data ?? []).map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    #{m.id} {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setBatchMachineOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                onClick={() =>
                  batchUpdateMutation.mutate({
                    ids: selectedIds,
                    machine_id: batchMachineId === 'none' ? null : Number(batchMachineId),
                  })
                }
              >
                {t('common.confirm')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deletingNode)}
        onOpenChange={(o) => !o && setDeletingNode(null)}
        title={t('serverNode.deleteTitle')}
        description={t('serverNode.deleteDescription', { name: deletingNode?.name ?? '' })}
        loading={dropMutation.isPending}
        onConfirm={() => deletingNode && dropMutation.mutate(deletingNode.id)}
      />

      <ConfirmDialog
        open={Boolean(resetTrafficNode)}
        onOpenChange={(o) => !o && setResetTrafficNode(null)}
        title={t('serverNode.resetTraffic')}
        description={t('serverNode.resetTrafficDescription', {
          name: resetTrafficNode?.name ?? '',
        })}
        destructive={false}
        loading={resetTrafficMutation.isPending}
        onConfirm={() => resetTrafficNode && resetTrafficMutation.mutate(resetTrafficNode.id)}
      />

      <ConfirmDialog
        open={batchDeleteOpen}
        onOpenChange={setBatchDeleteOpen}
        title={t('serverNode.batchDeleteTitle')}
        description={t('serverNode.batchDeleteDescription', { count: selectedIds.length })}
        loading={batchDeleteMutation.isPending}
        onConfirm={() => batchDeleteMutation.mutate(selectedIds)}
      />

      <ConfirmDialog
        open={batchResetOpen}
        onOpenChange={setBatchResetOpen}
        title={t('serverNode.resetTraffic')}
        description={t('serverNode.batchResetDescription', { count: selectedIds.length })}
        destructive={false}
        loading={batchResetMutation.isPending}
        onConfirm={() => batchResetMutation.mutate(selectedIds)}
      />
    </div>
  );
}
