import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowUpDown, Loader2, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  dropServerGroup,
  fetchServerGroups,
  saveServerGroup,
  type ServerGroupItem,
} from '@/api/serverGroup';
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
import { Skeleton } from '@/components/ui/skeleton';

type SortKey = 'id' | 'name' | 'users_count' | 'server_count';

export default function ServerGroupPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('id');
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ServerGroupItem | null>(null);
  const [deleting, setDeleting] = useState<ServerGroupItem | null>(null);
  const [name, setName] = useState('');

  const groupsQuery = useQuery({
    queryKey: ['server-groups'],
    queryFn: fetchServerGroups,
  });

  const filteredGroups = useMemo(() => {
    const list = [...(groupsQuery.data ?? [])];
    const q = search.trim().toLowerCase();
    const filtered = q
      ? list.filter((g) => g.name.toLowerCase().includes(q) || String(g.id).includes(q))
      : list;

    filtered.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
      else cmp = Number(a[sortKey] ?? 0) - Number(b[sortKey] ?? 0);
      return sortAsc ? cmp : -cmp;
    });
    return filtered;
  }, [groupsQuery.data, search, sortKey, sortAsc]);

  const pagedGroups = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredGroups.slice(start, start + pageSize);
  }, [filteredGroups, page, pageSize]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const saveMutation = useMutation({
    mutationFn: saveServerGroup,
    onSuccess: () => {
      toast.success(t('common.saveSuccess'));
      setDialogOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['server-groups'] });
    },
  });

  const dropMutation = useMutation({
    mutationFn: dropServerGroup,
    onSuccess: () => {
      toast.success(t('common.deleteSuccess'));
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: ['server-groups'] });
    },
  });

  const openCreate = () => {
    setEditing(null);
    setName('');
    setDialogOpen(true);
  };

  const openEdit = (group: ServerGroupItem) => {
    setEditing(group);
    setName(group.name);
    setDialogOpen(true);
  };

  const handleSave = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(t('serverGroup.nameRequired'));
      return;
    }
    saveMutation.mutate(editing ? { id: editing.id, name: trimmed } : { name: trimmed });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t('nav.permissionGroupManagement')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('serverGroup.pageSubtitle')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <Button variant="outline" size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          {t('serverGroup.create')}
        </Button>
        <div className="relative min-w-[220px] flex-1 max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={t('serverGroup.searchPlaceholder')}
            className="h-8 pl-9 text-xs"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          className="ml-auto h-8 w-8"
          onClick={() => void groupsQuery.refetch()}
          disabled={groupsQuery.isFetching}
          title={t('common.refresh')}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${groupsQuery.isFetching ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card/60">
        {groupsQuery.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
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
                    onClick={() => toggleSort('id')}
                  >
                    {t('serverGroup.groupId')}
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-4 py-3 font-medium">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                    onClick={() => toggleSort('name')}
                  >
                    {t('serverGroup.name')}
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-4 py-3 font-medium">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                    onClick={() => toggleSort('users_count')}
                  >
                    {t('serverGroup.usersCount')}
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-4 py-3 font-medium">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                    onClick={() => toggleSort('server_count')}
                  >
                    {t('serverGroup.serversCount')}
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="w-28 border-l px-4 py-3 text-right font-medium">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pagedGroups.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                    {t('serverGroup.empty')}
                  </td>
                </tr>
              ) : (
                pagedGroups.map((group) => (
                  <tr key={group.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      #{group.id}
                    </td>
                    <td className="px-4 py-3 font-medium">{group.name}</td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary">{group.users_count}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{group.server_count}</Badge>
                    </td>
                    <td className="border-l px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(group)}
                          title={t('common.edit')}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleting(group)}
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
        total={filteredGroups.length}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? t('serverGroup.editTitle') : t('serverGroup.createTitle')}
            </DialogTitle>
            <DialogDescription>{t('serverGroup.dialogDescription')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="group-name">{t('serverGroup.name')}</Label>
              <Input
                id="group-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('serverGroup.namePlaceholder')}
                autoFocus
              />
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
        title={t('serverGroup.deleteTitle')}
        description={t('serverGroup.deleteDescription', { name: deleting?.name ?? '' })}
        loading={dropMutation.isPending}
        onConfirm={() => deleting && dropMutation.mutate(deleting.id)}
      />
    </div>
  );
}
