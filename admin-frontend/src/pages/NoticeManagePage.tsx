import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  GripVertical,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  dropNotice,
  fetchNotices,
  saveNotice,
  sortNotices,
  toggleNoticeShow,
  type NoticeRecord,
} from '@/api/notice';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useDragSort } from '@/hooks/useDragSort';

export default function NoticeManagePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [sortAsc, setSortAsc] = useState<boolean | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const dragSort = useDragSort<NoticeRecord>();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<NoticeRecord | null>(null);
  const [deleting, setDeleting] = useState<NoticeRecord | null>(null);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [imgUrl, setImgUrl] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [show, setShow] = useState(false);

  const noticesQuery = useQuery({
    queryKey: ['admin-notices'],
    queryFn: fetchNotices,
  });

  const filteredNotices = useMemo(() => {
    const list = [...(noticesQuery.data ?? [])];
    const q = search.trim().toLowerCase();
    const filtered = q
      ? list.filter(
          (n) =>
            n.title.toLowerCase().includes(q) ||
            String(n.id).includes(q) ||
            (n.tags ?? []).some((tag) => tag.toLowerCase().includes(q)),
        )
      : list;

    if (sortAsc !== null) {
      filtered.sort((a, b) => (sortAsc ? a.id - b.id : b.id - a.id));
    }
    return filtered;
  }, [noticesQuery.data, search, sortAsc]);

  const pagedNotices = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredNotices.slice(start, start + pageSize);
  }, [filteredNotices, page, pageSize]);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['admin-notices'] });

  const saveMutation = useMutation({
    mutationFn: saveNotice,
    onSuccess: () => {
      toast.success(t('common.saveSuccess'));
      setDialogOpen(false);
      invalidate();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: toggleNoticeShow,
    onSuccess: () => {
      toast.success(t('common.operationSuccess'));
      invalidate();
    },
  });

  const dropMutation = useMutation({
    mutationFn: dropNotice,
    onSuccess: () => {
      toast.success(t('common.deleteSuccess'));
      setDeleting(null);
      invalidate();
    },
  });

  const sortMutation = useMutation({
    mutationFn: sortNotices,
    onSuccess: () => {
      toast.success(t('common.sortSaved'));
      dragSort.exitSortMode();
      invalidate();
    },
  });

  const openCreate = () => {
    setEditing(null);
    setTitle('');
    setContent('');
    setImgUrl('');
    setTags([]);
    setTagInput('');
    setShow(false);
    setDialogOpen(true);
  };

  const openEdit = (notice: NoticeRecord) => {
    setEditing(notice);
    setTitle(notice.title);
    setContent(notice.content);
    setImgUrl(notice.img_url ?? '');
    setTags(Array.isArray(notice.tags) ? notice.tags : []);
    setTagInput('');
    setShow(Boolean(notice.show));
    setDialogOpen(true);
  };

  const addTag = () => {
    const val = tagInput.trim();
    if (!val) return;
    if (!tags.includes(val)) setTags([...tags, val]);
    setTagInput('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    if (!trimmedTitle) {
      toast.error(t('notice.titleRequired'));
      return;
    }
    if (!trimmedContent) {
      toast.error(t('notice.contentRequired'));
      return;
    }

    saveMutation.mutate({
      ...(editing ? { id: editing.id } : {}),
      title: trimmedTitle,
      content: content,
      img_url: imgUrl.trim() ? imgUrl.trim() : null,
      tags,
      show,
    });
  };

  const displayedNotices = dragSort.isSortMode ? dragSort.draftItems : pagedNotices;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t('nav.noticeManagement')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('notice.pageSubtitle')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        {dragSort.isSortMode ? (
          <>
            <p className="text-sm text-muted-foreground">{t('common.sortHintNotice')}</p>
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
                onClick={() => sortMutation.mutate(dragSort.draftItems.map((n) => n.id))}
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
              {t('notice.create')}
            </Button>

            <div className="relative min-w-[200px] flex-1 max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder={t('notice.searchPlaceholder')}
                className="h-8 pl-9 text-xs"
              />
            </div>

            <div className="ml-auto flex items-center gap-2">
              {(noticesQuery.data?.length ?? 0) > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => {
                    setSortAsc(null);
                    dragSort.enterSortMode(noticesQuery.data ?? []);
                  }}
                >
                  {t('common.editSort')}
                </Button>
              )}
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => void noticesQuery.refetch()}
                disabled={noticesQuery.isFetching}
                title={t('common.refresh')}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${noticesQuery.isFetching ? 'animate-spin' : ''}`}
                />
              </Button>
            </div>
          </>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card/60">
        {noticesQuery.isLoading ? (
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
                    onClick={() => {
                      if (dragSort.isSortMode) return;
                      setSortAsc((prev) => (prev === null ? true : prev ? false : null));
                    }}
                  >
                    ID
                    {sortAsc === true ? (
                      <ArrowUp className="h-3 w-3" />
                    ) : sortAsc === false ? (
                      <ArrowDown className="h-3 w-3" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3" />
                    )}
                  </button>
                </th>
                <th className="w-28 px-3 py-3 font-medium">{t('notice.show')}</th>
                <th className="px-3 py-3 font-medium">{t('notice.title')}</th>
                {!dragSort.isSortMode && (
                  <th className="sticky right-0 w-28 border-l bg-card/95 px-4 py-3 text-right font-medium backdrop-blur-sm">
                    {t('common.actions')}
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {displayedNotices.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-sm text-muted-foreground">
                    {t('notice.empty')}
                  </td>
                </tr>
              ) : (
                displayedNotices.map((notice, idx) => {
                  const { className: dragRowClass, ...rowDragProps } = dragSort.getRowProps(idx);
                  return (
                    <tr
                      key={notice.id}
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
                        #{notice.id}
                      </td>
                      <td className="px-3 py-3">
                        <Switch
                          checked={Boolean(notice.show)}
                          disabled={dragSort.isSortMode}
                          onCheckedChange={() => toggleMutation.mutate(notice.id)}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{notice.title}</span>
                          {notice.img_url && (
                            <Badge variant="outline" className="gap-1 text-[10px]">
                              <ImageIcon className="h-3 w-3" />
                              {t('notice.hasImage')}
                            </Badge>
                          )}
                          {(notice.tags ?? []).map((tag) => (
                            <Badge key={tag} variant="secondary" className="px-1.5 py-0 text-[10px]">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      {!dragSort.isSortMode && (
                        <td className="sticky right-0 border-l bg-card/95 px-4 py-3 text-right backdrop-blur-sm">
                          <div className="inline-flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEdit(notice)}
                              title={t('common.edit')}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeleting(notice)}
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
          total={filteredNotices.length}
          page={page}
          pageSize={pageSize}
          pageSizeOptions={[10, 20, 50, 100]}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b bg-[var(--xb-heading)] px-6 py-4">
            <DialogTitle>{editing ? t('notice.editTitle') : t('notice.createTitle')}</DialogTitle>
            <DialogDescription>{t('notice.dialogDescription')}</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('notice.title')}</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('notice.titlePlaceholder')}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">{t('notice.content')}</Label>
                <MarkdownEditor
                  value={content}
                  onChange={setContent}
                  placeholder={t('notice.contentPlaceholder')}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">{t('notice.imgUrl')}</Label>
                <Input
                  value={imgUrl}
                  onChange={(e) => setImgUrl(e.target.value)}
                  placeholder={t('notice.imgUrlPlaceholder')}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('notice.tags')}</Label>
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
                  </div>
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                    placeholder={t('notice.tagsPlaceholder')}
                    className="h-8 text-xs"
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div>
                    <div className="text-sm font-medium">{t('notice.show')}</div>
                    <p className="text-xs text-muted-foreground">{t('notice.showHint')}</p>
                  </div>
                  <Switch checked={show} onCheckedChange={setShow} />
                </div>
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
        title={t('notice.deleteTitle')}
        description={t('notice.deleteDescription', { title: deleting?.title ?? '' })}
        destructive
        loading={dropMutation.isPending}
        onConfirm={() => {
          if (deleting) dropMutation.mutate(deleting.id);
        }}
      />
    </div>
  );
}
