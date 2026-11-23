import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react';
import type { NavLeafItem } from '@/config/navigation';
import { adminApiRequest } from '@/lib/api';
import { getPanelSettings } from '@/lib/settings';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function ModulePlaceholderPage({ item }: { item: NavLeafItem }) {
  const { t } = useTranslation();
  const { secure_path } = getPanelSettings();
  const Icon = item.icon;
  const isDashboard = item.href === '/';

  const pingQuery = useQuery({
    queryKey: ['admin-connectivity', secure_path],
    queryFn: () => adminApiRequest('/stat/getOverride', { silentError: true }),
    enabled: isDashboard,
    retry: false,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border bg-card">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{t(item.titleKey)}</h1>
            <p className="text-xs text-muted-foreground">{t('common.phaseReady')}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="secondary">{t(`placeholder.${item.phaseKey}`)}</Badge>
          {isDashboard && (
            <>
              {pingQuery.isLoading ? (
                <Badge variant="outline" className="gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t('common.loading')}
                </Badge>
              ) : pingQuery.isSuccess ? (
                <Badge variant="success" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  {t('common.backendConnected')}
                </Badge>
              ) : (
                <Badge variant="destructive" className="gap-1">
                  <XCircle className="h-3 w-3" />
                  {t('common.backendDisconnected')}
                </Badge>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => void pingQuery.refetch()}
                disabled={pingQuery.isFetching}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {t('common.refresh')}
              </Button>
            </>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t(item.titleKey)}</CardTitle>
          <CardDescription>
            {t('placeholder.description', {
              phase: t(`placeholder.${item.phaseKey}`),
              securePath: secure_path,
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">{t('placeholder.routeLabel')}</div>
            <div className="mt-1 font-mono text-xs">#{item.href}</div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">{t('placeholder.apiEndpoint')}</div>
            <div className="mt-1 font-mono text-xs">
              /api/v2/{secure_path}
              {item.sampleEndpoint}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
