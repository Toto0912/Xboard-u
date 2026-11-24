import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, Loader2, Tag } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { saveOrder } from '@/api/order';
import {
  checkCoupon,
  fetchPlanById,
  PLAN_PERIOD_KEYS,
  type CouponCheckResult,
  type PlanPeriodKey,
} from '@/api/plan';
import { fetchUserCommConfig } from '@/api/user';
import { MarkdownContent } from '@/components/shared/MarkdownContent';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function PlanOrderPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { plan_id } = useParams<{ plan_id: string }>();

  const [selectedPeriod, setSelectedPeriod] = useState<PlanPeriodKey | ''>('');
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<CouponCheckResult | null>(null);

  const planQuery = useQuery({
    queryKey: ['plan-detail', plan_id],
    queryFn: () => fetchPlanById(plan_id!),
    enabled: Boolean(plan_id),
  });

  const commQuery = useQuery({
    queryKey: ['user-comm-config'],
    queryFn: fetchUserCommConfig,
  });

  const symbol = commQuery.data?.currency_symbol || '¥';
  const plan = planQuery.data;

  const availablePeriods = useMemo(() => {
    if (!plan) return [];
    return PLAN_PERIOD_KEYS.filter((k) => typeof plan[k] === 'number' && plan[k]! >= 0);
  }, [plan]);

  useEffect(() => {
    if (availablePeriods.length > 0 && !selectedPeriod) {
      setSelectedPeriod(availablePeriods[0]);
    }
  }, [availablePeriods, selectedPeriod]);

  const basePrice = selectedPeriod && plan ? Number(plan[selectedPeriod] ?? 0) : 0;

  const discountAmount = useMemo(() => {
    if (!appliedCoupon || basePrice <= 0) return 0;
    if (appliedCoupon.type === 1) return Math.min(basePrice, appliedCoupon.value);
    if (appliedCoupon.type === 2) return Math.round((basePrice * appliedCoupon.value) / 100);
    return 0;
  }, [appliedCoupon, basePrice]);

  const finalAmount = Math.max(0, basePrice - discountAmount);

  const couponMutation = useMutation({
    mutationFn: () =>
      checkCoupon({
        code: couponInput.trim(),
        plan_id: Number(plan_id),
        period: selectedPeriod,
      }),
    onSuccess: (data) => {
      setAppliedCoupon(data);
      toast.success(
        t('plan.couponApplied', {
          amount:
            data.type === 1
              ? formatCurrency(data.value, symbol)
              : `${data.value}%`,
        }),
      );
    },
    onError: () => {
      setAppliedCoupon(null);
    },
  });

  const orderMutation = useMutation({
    mutationFn: () =>
      saveOrder({
        plan_id: Number(plan_id),
        period: selectedPeriod,
        coupon_code: appliedCoupon?.code || undefined,
      }),
    onSuccess: (tradeNo) => {
      navigate(`/order/${tradeNo}`);
    },
  });

  if (planQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={() => navigate('/plan')}>
          <ArrowLeft className="h-4 w-4" />
          {t('common.back')}
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">{t('plan.configureOrder')}</h1>
      </div>

      {plan && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{plan.name}</CardTitle>
              </CardHeader>
              {plan.content && (
                <CardContent>
                  <MarkdownContent content={plan.content} />
                </CardContent>
              )}
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('plan.selectPeriod')}</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {availablePeriods.map((key) => {
                  const active = selectedPeriod === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setSelectedPeriod(key);
                        setAppliedCoupon(null);
                      }}
                      className={cn(
                        'flex flex-col items-start rounded-xl border p-3 text-left transition-colors cursor-pointer',
                        active
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'hover:bg-accent/50',
                      )}
                    >
                      <span className="text-xs text-muted-foreground">
                        {t(`plan.periods.${key}`)}
                      </span>
                      <span className="mt-1 font-mono text-base font-semibold">
                        {formatCurrency(plan[key], symbol)}
                      </span>
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('plan.orderSummary')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      placeholder={t('plan.couponPlaceholder')}
                      value={couponInput}
                      onChange={(e) => {
                        setCouponInput(e.target.value);
                        if (appliedCoupon) setAppliedCoupon(null);
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!couponInput.trim() || !selectedPeriod || couponMutation.isPending}
                      onClick={() => couponMutation.mutate()}
                    >
                      {couponMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Tag className="h-4 w-4" />
                      )}
                      {t('plan.verifyCoupon')}
                    </Button>
                  </div>
                  {appliedCoupon && (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                      <Check className="h-3.5 w-3.5" />
                      <span>{appliedCoupon.name || appliedCoupon.code}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2 border-t pt-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('plan.planPrice')}</span>
                    <span className="font-mono">{formatCurrency(basePrice, symbol)}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                      <span>{t('plan.couponDiscount')}</span>
                      <span className="font-mono">-{formatCurrency(discountAmount, symbol)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t pt-2 text-base font-semibold">
                    <span>{t('plan.totalAmount')}</span>
                    <span className="font-mono">{formatCurrency(finalAmount, symbol)}</span>
                  </div>
                </div>

                <Button
                  type="button"
                  className="w-full"
                  disabled={!selectedPeriod || orderMutation.isPending}
                  onClick={() => orderMutation.mutate()}
                >
                  {orderMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t('plan.submitOrder')}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
