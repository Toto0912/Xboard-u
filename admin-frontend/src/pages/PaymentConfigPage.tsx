import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Copy,
  CreditCard,
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
  dropPayment,
  fetchPayments,
  getPaymentForm,
  getPaymentMethods,
  savePayment,
  sortPayments,
  togglePayment,
  type PaymentRecord,
} from '@/api/payment';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DynamicConfigFields } from '@/components/shared/DynamicConfigFields';
import { useDragSort } from '@/hooks/useDragSort';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { formatCurrency } from '@/lib/format';

export default function PaymentConfigPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentRecord | null>(null);
  const [deleting, setDeleting] = useState<PaymentRecord | null>(null);
  const [search, setSearch] = useState('');
  const dragSort = useDragSort<PaymentRecord>();

  const [name, setName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [icon, setIcon] = useState('');
  const [notifyDomain, setNotifyDomain] = useState('');
  const [feeFixedYuan, setFeeFixedYuan] = useState('');
  const [feePercent, setFeePercent] = useState('');
  const [gatewayConfig, setGatewayConfig] = useState<Record<string, unknown>>({});

  const paymentsQuery = useQuery({
    queryKey: ['admin-payments'],
    queryFn: fetchPayments,
  });

  const methodsQuery = useQuery({
    queryKey: ['admin-payment-methods'],
    queryFn: getPaymentMethods,
  });

  const formQuery = useQuery({
    queryKey: ['admin-payment-form', paymentMethod, editing?.id ?? null],
    queryFn: () => getPaymentForm(paymentMethod, editing?.id),
    enabled: dialogOpen && Boolean(paymentMethod),
  });

  useEffect(() => {
    if (!formQuery.data) return;
    const next: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(formQuery.data)) {
      next[key] = editing?.config?.[key] ?? field.value ?? '';
    }
    setGatewayConfig(next);
  }, [formQuery.data, editing]);

  const openCreate = () => {
    const firstMethod = methodsQuery.data?.[0] || '';
    setEditing(null);
    setName('');
    setPaymentMethod(firstMethod);
    setIcon('');
    setNotifyDomain('');
    setFeeFixedYuan('');
    setFeePercent('');
    setGatewayConfig({});
    setDialogOpen(true);
  };

  const openEdit = (record: PaymentRecord) => {
    setEditing(record);
    setName(record.name);
    setPaymentMethod(record.payment);
    setIcon(record.icon || '');
    setNotifyDomain(record.notify_domain || '');
    setFeeFixedYuan(
      record.handling_fee_fixed !== null && record.handling_fee_fixed !== undefined
        ? (record.handling_fee_fixed / 100).toString()
        : '',
    );
    setFeePercent(
      record.handling_fee_percent !== null && record.handling_fee_percent !== undefined
        ? String(record.handling_fee_percent)
        : '',
    );
    setGatewayConfig(record.config || {});
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const fixedCents =
        feeFixedYuan.trim() === '' ? null : Math.round(Number(feeFixedYuan) * 100);
      const pct = feePercent.trim() === '' ? null : Number(feePercent);
      return savePayment({
        id: editing?.id,
        name: name.trim(),
        payment: paymentMethod,
        icon: icon.trim() || null,
        notify_domain: notifyDomain.trim() || null,
        handling_fee_fixed: fixedCents,
        handling_fee_percent: pct,
        config: gatewayConfig,
      });
    },
    onSuccess: () => {
      toast.success(t('common.saveSuccess'));
      setDialogOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['admin-payments'] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (id: number) => togglePayment(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-payments'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => dropPayment(id),
    onSuccess: () => {
      toast.success(t('common.deleteSuccess'));
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: ['admin-payments'] });
    },
  });

  const sortMutation = useMutation({
    mutationFn: (ids: number[]) => sortPayments(ids),
    onSuccess: () => {
      toast.success(t('common.sortSaved'));
      dragSort.exitSortMode();
      void queryClient.invalidateQueries({ queryKey: ['admin-payments'] });
    },
  });

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('common.copied'));
    } catch {
      toast.error(t('common.copyFailed'));
    }
  };

  const payments = paymentsQuery.data ?? [];
  const filteredPayments = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return payments;
    return payments.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.payment.toLowerCase().includes(q) ||
        String(item.id).includes(q),
    );
  }, [payments, search]);

  const displayedPayments = dragSort.isSortMode ? dragSort.draftItems : filteredPayments;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('nav.paymentConfig')}</h1>
        <p className="text-sm text-muted-foreground">{t('payment.subtitle')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        {dragSort.isSortMode ? (
          <>
            <p className="text-sm text-muted-foreground">{t('common.sortHintPayment')}</p>
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
                onClick={() => sortMutation.mutate(dragSort.draftItems.map((p) => p.id))}
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
              {t('payment.add')}
            </Button>

            <div className="relative min-w-[200px] flex-1 max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('payment.searchPlaceholder')}
                className="h-8 pl-9 text-xs"
              />
            </div>

            <div className="ml-auto flex items-center gap-2">
              {payments.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => dragSort.enterSortMode(payments)}
                >
                  {t('common.editSort')}
                </Button>
              )}
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => void paymentsQuery.refetch()}
                disabled={paymentsQuery.isFetching}
                title={t('common.refresh')}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${paymentsQuery.isFetching ? 'animate-spin' : ''}`}
                />
              </Button>
            </div>
          </>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {paymentsQuery.isLoading ? (
            <div className="space-y-3 p-6">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : displayedPayments.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-14 text-center text-muted-foreground">
              <CreditCard className="h-8 w-8 opacity-40" />
              <p className="text-sm">{t('payment.empty')}</p>
              <Button variant="outline" size="sm" onClick={openCreate}>
                <Plus className="h-3.5 w-3.5" />
                {t('payment.add')}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    {dragSort.isSortMode && <th className="w-10 px-2 py-3" />}
                    <th className="px-4 py-3 font-medium">ID</th>
                    <th className="px-4 py-3 font-medium">{t('payment.enable')}</th>
                    <th className="px-4 py-3 font-medium">{t('payment.name')}</th>
                    <th className="px-4 py-3 font-medium">{t('payment.gateway')}</th>
                    <th className="px-4 py-3 font-medium">{t('payment.fee')}</th>
                    <th className="px-4 py-3 font-medium">{t('payment.notifyUrl')}</th>
                    {!dragSort.isSortMode && (
                      <th className="px-4 py-3 text-right font-medium">{t('common.actions')}</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {displayedPayments.map((item, idx) => {
                    const { className: dragRowClass, ...rowDragProps } = dragSort.getRowProps(idx);
                    return (
                      <tr
                        key={item.id}
                        {...rowDragProps}
                        className={`hover:bg-muted/20${dragRowClass ? ` ${dragRowClass}` : ''}`}
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
                        <td className="px-4 py-3">
                          <Switch
                            checked={Boolean(item.enable)}
                            disabled={dragSort.isSortMode}
                            onCheckedChange={() => toggleMutation.mutate(item.id)}
                          />
                        </td>
                        <td className="px-4 py-3 font-medium">{item.name}</td>
                        <td className="px-4 py-3">
                          <Badge variant="secondary">{item.payment}</Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {[
                            item.handling_fee_fixed
                              ? formatCurrency(item.handling_fee_fixed)
                              : null,
                            item.handling_fee_percent ? `${item.handling_fee_percent}%` : null,
                          ]
                            .filter(Boolean)
                            .join(' + ') || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex max-w-xs items-center gap-1.5">
                            <code className="truncate rounded bg-muted px-1.5 py-0.5 text-xs">
                              {item.notify_url}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0"
                              onClick={() => void handleCopy(item.notify_url)}
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                        {!dragSort.isSortMode && (
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-1">
                              <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>
                                <Pencil className="h-3.5 w-3.5" />
                                {t('common.edit')}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => setDeleting(item)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? t('payment.editTitle') : t('payment.addTitle')}
            </DialogTitle>
            <DialogDescription>{t('payment.dialogDesc')}</DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.mutate();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pay-name">{t('payment.name')}</Label>
                <Input
                  id="pay-name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('payment.namePlaceholder')}
                />
              </div>

              <div className="space-y-1.5">
                <Label>{t('payment.gateway')}</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('payment.selectGateway')} />
                  </SelectTrigger>
                  <SelectContent>
                    {(methodsQuery.data ?? []).map((method) => (
                      <SelectItem key={method} value={method}>
                        {method}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pay-icon">{t('payment.icon')}</Label>
                <Input
                  id="pay-icon"
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  placeholder="https://..."
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pay-notify">{t('payment.notifyDomain')}</Label>
                <Input
                  id="pay-notify"
                  value={notifyDomain}
                  onChange={(e) => setNotifyDomain(e.target.value)}
                  placeholder="https://pay.example.com"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pay-fee-fixed">{t('payment.feeFixed')}</Label>
                <Input
                  id="pay-fee-fixed"
                  type="number"
                  step="0.01"
                  min="0"
                  value={feeFixedYuan}
                  onChange={(e) => setFeeFixedYuan(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pay-fee-percent">{t('payment.feePercent')}</Label>
                <Input
                  id="pay-fee-percent"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={feePercent}
                  onChange={(e) => setFeePercent(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="mb-3 text-sm font-medium">{t('payment.gatewaySettings')}</div>
              {formQuery.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : (
                <DynamicConfigFields
                  schema={formQuery.data ?? {}}
                  values={gatewayConfig}
                  onChange={(key, val) =>
                    setGatewayConfig((prev) => ({ ...prev, [key]: val }))
                  }
                />
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={saveMutation.isPending || !paymentMethod}>
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
        title={t('payment.deleteTitle')}
        description={t('payment.deleteDesc', { name: deleting?.name ?? '' })}
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
      />
    </div>
  );
}
