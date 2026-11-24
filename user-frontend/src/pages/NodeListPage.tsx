import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Network, RefreshCw, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { fetchServers } from '@/api/server';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { formatTimestamp } from '@/lib/format';

export default function NodeListPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');

  const serversQuery = useQuery({
    queryKey: ['user-servers'],
    queryFn: fetchServers,
  });

  const filtered = useMemo(() => {
    const list = serversQuery.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.type.toLowerCase().includes(q) ||
        (s.tags ?? []).some((tag) => tag.toLowerCase().includes(q)),
    );
  }, [serversQuery.data, search]);

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{t('node.title')}</h1>
        <div className="flex items-center gap-2">
          <div className="relative w-52 sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('node.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-9 text-xs"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => void serversQuery.refetch()}
            disabled={serversQuery.isFetching}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${serversQuery.isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {serversQuery.isLoading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : (serversQuery.data ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
            <AlertCircle className="h-8 w-8 text-amber-500" />
            <div className="text-sm font-medium">{t('node.noNodesTitle')}</div>
            <p className="max-w-sm text-xs text-muted-foreground">{t('node.noNodesDesc')}</p>
            <Button type="button" size="sm" asChild>
              <Link to="/plan">{t('node.goSubscribe')}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Network className="h-7 w-7 opacity-40" />
            <span>{t('common.noData')}</span>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((node) => {
            const online = Boolean(node.is_online);
            return (
              <Card key={`${node.type}-${node.id}`}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                        online ? 'bg-emerald-500' : 'bg-rose-500'
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium">{node.name}</span>
                        <Badge variant="outline" className="font-mono text-[11px] uppercase">
                          {node.type}
                        </Badge>
                        {node.tags?.map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-[11px]">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                      {node.last_check_at && (
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {t('node.lastCheck')}: {formatTimestamp(node.last_check_at)}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="font-mono">
                      {t('node.rate')} {node.rate}x
                    </Badge>
                    <Badge variant={online ? 'success' : 'destructive'}>
                      {online ? t('node.online') : t('node.offline')}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
