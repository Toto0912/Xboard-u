import { useQuery } from '@tanstack/react-query';
import { ShoppingBag } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { fetchPlans, PLAN_PERIOD_KEYS, type PlanItem } from '@/api/plan';
import { fetchUserCommConfig } from '@/api/user';
import { MarkdownContent } from '@/components/shared/MarkdownContent';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatBytes, formatCurrency } from '@/lib/format';

function getLowestPrice(plan: PlanItem): { price: number; periodKey: string } | null {
  for (const key of PLAN_PERIOD_KEYS) {
    if (key === 'reset_price') continue;
    const val = plan[key];
    if (typeof val === 'number' && val >= 0) {
      return { price: val, periodKey: key };
    }
  }
  return null;
}

export default function PlanPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'recurring' | 'onetime'>('all');

  const plansQuery = useQuery({
    queryKey: ['user-plans'],
    queryFn: fetchPlans,
  });

  const commQuery = useQuery({
    queryKey: ['user-comm-config'],
    queryFn: fetchUserCommConfig,
  });

  const symbol = commQuery.data?.currency_symbol || '¥';

  const filteredPlans = useMemo(() => {
    const list = plansQuery.data ?? [];
    if (filter === 'all') return list;
    if (filter === 'onetime') {
      return list.filter((p) => typeof p.onetime_price === 'number');
    }
    return list.filter((p) =>
      PLAN_PERIOD_KEYS.some(
        (k) => k !== 'onetime_price' && k !== 'reset_price' && typeof p[k] === 'number',
      ),
    );
  }, [plansQuery.data, filter]);

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{t('plan.title')}</h1>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList>
            <TabsTrigger value="all">{t('plan.all')}</TabsTrigger>
            <TabsTrigger value="recurring">{t('plan.recurring')}</TabsTrigger>
            <TabsTrigger value="onetime">{t('plan.onetime')}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {plansQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, idx) => (
            <Skeleton key={idx} className="h-72 w-full rounded-xl" />
          ))}
        </div>
      ) : filteredPlans.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <ShoppingBag className="h-8 w-8 opacity-40" />
            <span>{t('common.noData')}</span>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredPlans.map((plan) => {
            const lowest = getLowestPrice(plan);
            const soldOut =
              typeof plan.capacity_limit === 'string' ||
              (typeof plan.capacity_limit === 'number' && plan.capacity_limit <= 0);
            return (
              <Card key={plan.id} className="flex flex-col justify-between">
                <div>
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <CardTitle className="text-lg">{plan.name}</CardTitle>
                      <div className="flex flex-wrap gap-1">
                        {plan.tags?.map((tag) => (
                          <Badge key={tag} variant="secondary">
                            {tag}
                          </Badge>
                        ))}
                        {soldOut && <Badge variant="destructive">{t('plan.soldOut')}</Badge>}
                      </div>
                    </div>
                    {lowest && (
                      <div className="pt-2">
                        <span className="font-mono text-2xl font-bold">
                          {formatCurrency(lowest.price, symbol)}
                        </span>
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          / {t(`plan.periods.${lowest.periodKey}`)}
                        </span>
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                      <Badge variant="outline">
                        {formatBytes(Number(plan.transfer_enable) * 1073741824)}
                      </Badge>
                      <Badge variant="outline">
                        {plan.speed_limit ? `${plan.speed_limit} Mbps` : t('common.unlimited')}
                      </Badge>
                      {typeof plan.capacity_limit === 'number' && plan.capacity_limit > 0 && (
                        <Badge variant="outline">
                          {t('plan.remainingCapacity', { count: plan.capacity_limit })}
                        </Badge>
                      )}
                    </div>
                    {plan.content && (
                      <MarkdownContent content={plan.content} className="text-xs" />
                    )}
                  </CardContent>
                </div>
                <CardFooter>
                  <Button
                    type="button"
                    className="w-full"
                    disabled={soldOut || !plan.sell}
                    onClick={() => navigate(`/plan/${plan.id}`)}
                  >
                    {soldOut ? t('plan.soldOut') : t('plan.subscribeNow')}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
