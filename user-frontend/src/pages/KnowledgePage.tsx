import { useQuery } from '@tanstack/react-query';
import { BookOpen, ChevronRight, Search } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchKnowledgeDetail, fetchKnowledgeList, type KnowledgeItem } from '@/api/knowledge';
import { MarkdownContent } from '@/components/shared/MarkdownContent';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/format';

export default function KnowledgePage() {
  const { t, i18n } = useTranslation();
  const [keyword, setKeyword] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const listQuery = useQuery({
    queryKey: ['knowledge-list', i18n.language, keyword],
    queryFn: () =>
      fetchKnowledgeList({
        language: i18n.language || 'zh-CN',
        keyword: keyword.trim() || undefined,
      }),
  });

  const detailQuery = useQuery({
    queryKey: ['knowledge-detail', selectedId],
    queryFn: () => fetchKnowledgeDetail(selectedId!),
    enabled: selectedId !== null,
  });

  const categories = Object.entries(listQuery.data ?? {});

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{t('knowledge.title')}</h1>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('knowledge.searchPlaceholder')}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {listQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : categories.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center text-sm text-muted-foreground">
            <BookOpen className="h-8 w-8 opacity-40" />
            <span>{t('knowledge.empty')}</span>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {categories.map(([category, items]: [string, KnowledgeItem[]]) => (
            <Card key={category}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{category}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border bg-muted/20 px-4 py-3 text-left transition-colors hover:bg-accent/50 cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{item.title}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {t('knowledge.updatedAt')}: {formatDate(item.updated_at)}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={selectedId !== null} onOpenChange={(o) => !o && setSelectedId(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detailQuery.data?.title || t('common.loading')}</DialogTitle>
            <DialogDescription>
              {detailQuery.data
                ? `${detailQuery.data.category} · ${t('knowledge.updatedAt')} ${formatDate(detailQuery.data.updated_at)}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {detailQuery.isLoading ? (
            <div className="space-y-2 py-4">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          ) : (
            <MarkdownContent content={detailQuery.data?.body || ''} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
