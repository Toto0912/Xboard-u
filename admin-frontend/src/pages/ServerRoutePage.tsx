import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowUpDown, Loader2, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  dropServerRoute,
  fetchServerRoutes,
  saveServerRoute,
  type ServerRouteAction,
  type ServerRouteItem,
} from '@/api/serverRoute';
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
import { Textarea } from '@/components/ui/textarea';

const ACTION_BADGE_MAP: Record<ServerRouteAction, string> = {
  block: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30',
  direct: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  dns: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30',
  proxy: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
};

export default function ServerRoutePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ServerRouteItem | null>(null);
  const [deleting, setDeleting] = useState<ServerRouteItem | null>(null);

  const [remarks, setRemarks] = useState('');
  const [action, setAction] = useState<ServerRouteAction>('block');
  const [actionValue, setActionValue] = useState('');
  const [matchText, setMatchText] = useState('');

  const routesQuery = useQuery({
    queryKey: ['server-routes'],
    queryFn: fetchServerRoutes,
  });

  const filteredRoutes = useMemo(() => {
    const list = [...(routesQuery.data ?? [])];
    const q = search.trim().toLowerCase();
    const filtered = list.filter((route) => {
      if (actionFilter !== 'all' && route.action !== actionFilter) return false;
      if (!q) return true;
      return (
        route.remarks.toLowerCase().includes(q) ||
        String(route.id).includes(q) ||
        (route.match ?? []).some((m) => m.toLowerCase().includes(q)) ||
        (route.action_value ?? '').toLowerCase().includes(q)
      );
    });
    filtered.sort((a, b) => (sortAsc ? a.id - b.id : b.id - a.id));
    return filtered;
  }, [routesQuery.data, search, actionFilter, sortAsc]);

  const pagedRoutes = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRoutes.slice(start, start + pageSize);
  }, [filteredRoutes, page, pageSize]);

  const saveMutation = useMutation({
    mutationFn: saveServerRoute,
    onSuccess: () => {
      toast.success(t('common.saveSuccess'));
      setDialogOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['server-routes'] });
    },
  });

  const dropMutation = useMutation({
    mutationFn: dropServerRoute,
    onSuccess: () => {
      toast.success(t('common.deleteSuccess'));
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: ['server-routes'] });
    },
  });

  const openCreate = () => {
    setEditing(null);
    setRemarks('');
    setAction('block');
    setActionValue('');
    setMatchText('');
    setDialogOpen(true);
  };

  const openEdit = (route: ServerRouteItem) => {
    setEditing(route);
    setRemarks(route.remarks);
    setAction(route.action);
    setActionValue(route.action_value ?? '');
    setMatchText((route.match ?? []).join('\n'));
    setDialogOpen(true);
  };

  const handleSave = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmedRemarks = remarks.trim();
    if (!trimmedRemarks) {
      toast.error(t('serverRoute.remarksRequired'));
      return;
    }
    const rules = matchText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (rules.length === 0) {
      toast.error(t('serverRoute.matchRequired'));
      return;
    }
    const needsActionValue = action === 'dns' || action === 'proxy';
    saveMutation.mutate({
      ...(editing ? { id: editing.id } : {}),
      remarks: trimmedRemarks,
      match: rules,
      action,
      action_value: needsActionValue ? actionValue.trim() || null : null,
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t('nav.routeManagement')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('serverRoute.pageSubtitle')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <Button variant="outline" size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          {t('serverRoute.create')}
        </Button>
        <div className="relative min-w-[220px] flex-1 max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={t('serverRoute.searchPlaceholder')}
            className="h-8 pl-9 text-xs"
          />
        </div>
        <Select
          value={actionFilter}
          onValueChange={(v) => {
            setActionFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-8 w-[150px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.all')}</SelectItem>
            <SelectItem value="block">{t('serverRoute.actions.block')}</SelectItem>
            <SelectItem value="direct">{t('serverRoute.actions.direct')}</SelectItem>
            <SelectItem value="dns">{t('serverRoute.actions.dns')}</SelectItem>
            <SelectItem value="proxy">{t('serverRoute.actions.proxy')}</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          className="ml-auto h-8 w-8"
          onClick={() => void routesQuery.refetch()}
          disabled={routesQuery.isFetching}
          title={t('common.refresh')}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${routesQuery.isFetching ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card/60">
        {routesQuery.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
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
                    onClick={() => setSortAsc((v) => !v)}
                  >
                    {t('serverGroup.groupId')}
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-4 py-3 font-medium">{t('serverRoute.remarks')}</th>
                <th className="px-4 py-3 font-medium">{t('serverRoute.action')}</th>
                <th className="px-4 py-3 font-medium">{t('serverRoute.actionValue')}</th>
                <th className="px-4 py-3 font-medium">{t('serverRoute.matchRules')}</th>
                <th className="w-28 border-l px-4 py-3 text-right font-medium">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pagedRoutes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                    {t('serverRoute.empty')}
                  </td>
                </tr>
              ) : (
                pagedRoutes.map((route) => {
                  const rules = route.match ?? [];
                  const preview = rules.slice(0, 2);
                  const rest = rules.length - preview.length;
                  return (
                    <tr key={route.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        #{route.id}
                      </td>
                      <td className="px-4 py-3 font-medium">{route.remarks}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={ACTION_BADGE_MAP[route.action] ?? ''}>
                          {t(`serverRoute.actions.${route.action}`)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {route.action_value || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="secondary">{rules.length}</Badge>
                          {preview.map((rule, idx) => (
                            <code
                              key={idx}
                              className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground"
                            >
                              {rule}
                            </code>
                          ))}
                          {rest > 0 && (
                            <span className="text-xs text-muted-foreground">+{rest}</span>
                          )}
                        </div>
                      </td>
                      <td className="border-l px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(route)}
                            title={t('common.edit')}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleting(route)}
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
        total={filteredRoutes.length}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? t('serverRoute.editTitle') : t('serverRoute.createTitle')}
            </DialogTitle>
            <DialogDescription>{t('serverRoute.dialogDescription')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="route-remarks">{t('serverRoute.remarks')}</Label>
              <Input
                id="route-remarks"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder={t('serverRoute.remarksPlaceholder')}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t('serverRoute.action')}</Label>
                <Select value={action} onValueChange={(v) => setAction(v as ServerRouteAction)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="block">{t('serverRoute.actions.block')}</SelectItem>
                    <SelectItem value="direct">{t('serverRoute.actions.direct')}</SelectItem>
                    <SelectItem value="dns">{t('serverRoute.actions.dns')}</SelectItem>
                    <SelectItem value="proxy">{t('serverRoute.actions.proxy')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(action === 'dns' || action === 'proxy') && (
                <div className="space-y-1.5">
                  <Label htmlFor="route-action-value">{t('serverRoute.actionValue')}</Label>
                  <Input
                    id="route-action-value"
                    value={actionValue}
                    onChange={(e) => setActionValue(e.target.value)}
                    placeholder={
                      action === 'dns'
                        ? t('serverRoute.actionValueDnsPlaceholder')
                        : t('serverRoute.actionValueProxyPlaceholder')
                    }
                  />
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="route-match">{t('serverRoute.matchRules')}</Label>
              <Textarea
                id="route-match"
                rows={7}
                value={matchText}
                onChange={(e) => setMatchText(e.target.value)}
                placeholder={t('serverRoute.matchPlaceholder')}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">{t('serverRoute.matchHint')}</p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={saveMutation.isPending}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('common.save')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('serverRoute.deleteTitle')}
        description={t('serverRoute.deleteDescription', { name: deleting?.remarks ?? '' })}
        loading={dropMutation.isPending}
        onConfirm={() => deleting && dropMutation.mutate(deleting.id)}
      />
    </div>
  );
}
