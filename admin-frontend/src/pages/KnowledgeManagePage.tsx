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
} from 'lucide-react';
import { toast } from 'sonner';
import {
  dropKnowledge,
  fetchKnowledgeDetail,
  fetchKnowledgeList,
  KNOWLEDGE_LANGUAGES,
  saveKnowledge,
  sortKnowledge,
  toggleKnowledgeShow,
  type KnowledgeSummaryItem,
} from '@/api/knowledge';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataTablePagination } from '@/components/shared/DataTablePagination';
import { MarkdownEditor } from '@/components/shared/MarkdownEditor';
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
import { useDragSort } from '@/hooks/useDragSort';

type SortKey = 'default' | 'id' | 'title' | 'category';

export default function KnowledgeManagePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('default');
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const dragSort = useDragSort<KnowledgeSummaryItem>();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loadingDetailId, setLoadingDetailId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<KnowledgeSummaryItem | null>(null);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [language, setLanguage] = useState('zh-CN');
  const [body, setBody] = useState('');
  const [show, setShow] = useState(false);

  const listQuery = useQuery({
    queryKey: ['admin-knowledge'],
    queryFn: fetchKnowledgeList,
  });

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const item of listQuery.data ?? []) {
      if (item.category) set.add(item.category);
    }
    return Array.from(set);
  }, [listQuery.data]);

  const filteredItems = useMemo(() => {
    const list = [...(listQuery.data ?? [])];
    const q = search.trim().toLowerCase();
    const filtered = list.filter((item) => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        String(item.id).includes(q)
      );
    });

    if (sortKey !== 'default') {
      filtered.sort((a, b) => {
        let cmp = 0;
        if (sortKey === 'id') cmp = a.id - b.id;
        else if (sortKey === 'title') cmp = a.title.localeCompare(b.title);
        else cmp = a.category.localeCompare(b.category);
        return sortAsc ? cmp : -cmp;
      });
    }
    return filtered;
  }, [listQuery.data, search, categoryFilter, sortKey, sortAsc]);

  const pagedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, page, pageSize]);

  const toggleSort = (key: 'id' | 'title' | 'category') => {
    if (dragSort.isSortMode) return;
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['admin-knowledge'] });

  const saveMutation = useMutation({
    mutationFn: saveKnowledge,
    onSuccess: () => {
      toast.success(t('common.saveSuccess'));
      setDialogOpen(false);
      invalidate();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: toggleKnowledgeShow,
    onSuccess: () => {
      toast.success(t('common.operationSuccess'));
      invalidate();
    },
  });

  const dropMutation = useMutation({
    mutationFn: dropKnowledge,
    onSuccess: () => {
      toast.success(t('common.deleteSuccess'));
      setDeleting(null);
      invalidate();
    },
  });

  const sortMutation = useMutation({
    mutationFn: sortKnowledge,
    onSuccess: () => {
      toast.success(t('common.sortSaved'));
      dragSort.exitSortMode();
      invalidate();
    },
  });

  const openCreate = () => {
    setEditingId(null);
    setTitle('');
    setCategory('');
    setLanguage('zh-CN');
    setBody('');
    setShow(false);
    setDialogOpen(true);
  };

  const openEdit = async (item: KnowledgeSummaryItem) => {
    setLoadingDetailId(item.id);
    try {
      const detail = await fetchKnowledgeDetail(item.id);
      setEditingId(detail.id);
      setTitle(detail.title ?? '');
      setCategory(detail.category ?? '');
      setLanguage(detail.language || 'zh-CN');
      setBody(detail.body ?? '');
      setShow(Boolean(detail.show));
      setDialogOpen(true);
    } finally {
      setLoadingDetailId(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    const trimmedCategory = category.trim();
    const trimmedBody = body.trim();
    if (!trimmedTitle) {
      toast.error(t('knowledge.titleRequired'));
      return;
    }
    if (!trimmedCategory) {
      toast.error(t('knowledge.categoryRequired'));
      return;
    }
    if (!trimmedBody) {
      toast.error(t('knowledge.bodyRequired'));
      return;
    }

    saveMutation.mutate({
      ...(editingId ? { id: editingId } : {}),
      title: trimmedTitle,
      category: trimmedCategory,
      language,
      body,
      show,
    });
  };

  const displayedItems = dragSort.isSortMode ? dragSort.draftItems : pagedItems;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t('nav.knowledgeManagement')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('knowledge.pageSubtitle')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        {dragSort.isSortMode ? (
          <>
            <p className="text-sm text-muted-foreground">{t('common.sortHintKnowledge')}</p>
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
                onClick={() => sortMutation.mutate(dragSort.draftItems.map((k) => k.id))}
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
              {t('knowledge.create')}
            </Button>

            <div className="relative min-w-[200px] flex-1 max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder={t('knowledge.searchPlaceholder')}
                className="h-8 pl-9 text-xs"
              />
            </div>

            <Select
              value={categoryFilter}
              onValueChange={(v) => {
                setCategoryFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue placeholder={t('knowledge.allCategories')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('knowledge.allCategories')}</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="ml-auto flex items-center gap-2">
              {(listQuery.data?.length ?? 0) > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => {
                    setSortKey('default');
                    dragSort.enterSortMode(listQuery.data ?? []);
                  }}
                >
                  {t('common.editSort')}
                </Button>
              )}
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => void listQuery.refetch()}
                disabled={listQuery.isFetching}
                title={t('common.refresh')}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${listQuery.isFetching ? 'animate-spin' : ''}`}
                />
              </Button>
            </div>
          </>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card/60">
        {listQuery.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                {dragSort.isSortMode && <th className="w-10 px-2 py-3" />}
                <th className="w-24 px-4 py-3 font-medium">
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
                <th className="w-24 px-3 py-3 font-medium">{t('knowledge.status')}</th>
                <th className="px-3 py-3 font-medium">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                    onClick={() => toggleSort('title')}
                  >
                    {t('knowledge.title')}
                    {sortKey === 'title' ? (
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
                <th className="px-3 py-3 font-medium">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                    onClick={() => toggleSort('category')}
                  >
                    {t('knowledge.category')}
                    {sortKey === 'category' ? (
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
                {!dragSort.isSortMode && (
                  <th className="sticky right-0 w-28 border-l bg-card/95 px-4 py-3 text-right font-medium backdrop-blur-sm">
                    {t('common.actions')}
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {displayedItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                    {t('knowledge.empty')}
                  </td>
                </tr>
              ) : (
                displayedItems.map((item, idx) => {
                  const { className: dragRowClass, ...rowDragProps } = dragSort.getRowProps(idx);
                  const isDetailLoading = loadingDetailId === item.id;
                  return (
                    <tr
                      key={item.id}
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
                        #{item.id}
                      </td>
                      <td className="px-3 py-3">
                        <Switch
                          checked={Boolean(item.show)}
                          disabled={dragSort.isSortMode}
                          onCheckedChange={() => toggleMutation.mutate(item.id)}
                        />
                      </td>
                      <td className="px-3 py-3 font-medium">{item.title}</td>
                      <td className="px-3 py-3">
                        <Badge variant="outline">{item.category}</Badge>
                      </td>
                      {!dragSort.isSortMode && (
                        <td className="sticky right-0 border-l bg-card/95 px-4 py-3 text-right backdrop-blur-sm">
                          <div className="inline-flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={isDetailLoading}
                              onClick={() => void openEdit(item)}
                              title={t('common.edit')}
                            >
                              {isDetailLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Pencil className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeleting(item)}
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
          total={filteredItems.length}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b bg-[var(--xb-heading)] px-6 py-4">
            <DialogTitle>
              {editingId ? t('knowledge.editTitle') : t('knowledge.createTitle')}
            </DialogTitle>
            <DialogDescription>{t('knowledge.dialogDescription')}</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('knowledge.title')}</Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t('knowledge.titlePlaceholder')}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('knowledge.category')}</Label>
                  <Input
                    list="knowledge-categories-list"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder={t('knowledge.categoryPlaceholder')}
                  />
                  <datalist id="knowledge-categories-list">
                    {categories.map((cat) => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('knowledge.language')}</Label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('knowledge.languagePlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {KNOWLEDGE_LANGUAGES.map((lang) => (
                        <SelectItem key={lang.value} value={lang.value}>
                          {lang.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between rounded-lg border px-4 py-2.5">
                  <div>
                    <div className="text-sm font-medium">{t('knowledge.show')}</div>
                    <p className="text-xs text-muted-foreground">{t('knowledge.showHint')}</p>
                  </div>
                  <Switch checked={show} onCheckedChange={setShow} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">{t('knowledge.body')}</Label>
                <MarkdownEditor
                  value={body}
                  onChange={setBody}
                  placeholder={t('knowledge.bodyPlaceholder')}
                />
              </div>
            </div>

            <div className="flex shrink-0 items-center justify-end gap-2 border-t bg-[var(--xb-heading)] px-6 py-3">
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
                {t('common.submit')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={t('knowledge.deleteTitle')}
        description={t('knowledge.deleteDescription', { title: deleting?.title ?? '' })}
        destructive
        loading={dropMutation.isPending}
        onConfirm={() => {
          if (deleting) dropMutation.mutate(deleting.id);
        }}
      />
    </div>
  );
}
