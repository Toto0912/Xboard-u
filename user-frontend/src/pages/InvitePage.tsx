import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, Copy, Loader2, Plus, Wallet } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { createInviteCode, fetchInviteDetails, fetchInviteInfo } from '@/api/invite';
import { submitWithdrawTicket } from '@/api/ticket';
import { fetchUserCommConfig, transferCommission } from '@/api/user';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { copyToClipboard, formatCurrency, formatTimestamp } from '@/lib/format';

export default function InvitePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [detailsPage, setDetailsPage] = useState(1);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferYuan, setTransferYuan] = useState('');
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawMethod, setWithdrawMethod] = useState('');
  const [withdrawAccount, setWithdrawAccount] = useState('');

  const inviteQuery = useQuery({
    queryKey: ['user-invite-info'],
    queryFn: fetchInviteInfo,
  });

  const detailsQuery = useQuery({
    queryKey: ['user-invite-details', detailsPage],
    queryFn: () => fetchInviteDetails(detailsPage, 10),
  });

  const commQuery = useQuery({
    queryKey: ['user-comm-config'],
    queryFn: fetchUserCommConfig,
  });

  const commConfig = commQuery.data;
  const symbol = commConfig?.currency_symbol || '¥';
  const stat = inviteQuery.data?.stat ?? [0, 0, 0, 0, 0];
  const codes = inviteQuery.data?.codes ?? [];
  const records = detailsQuery.data?.data ?? [];
  const totalRecords = detailsQuery.data?.total ?? 0;

  const generateMutation = useMutation({
    mutationFn: createInviteCode,
    onSuccess: () => {
      toast.success(t('invite.codeCreated'));
      void queryClient.invalidateQueries({ queryKey: ['user-invite-info'] });
    },
  });

  const transferMutation = useMutation({
    mutationFn: (fen: number) => transferCommission(fen),
    onSuccess: () => {
      toast.success(t('invite.transferSuccess'));
      setTransferOpen(false);
      setTransferYuan('');
      void queryClient.invalidateQueries({ queryKey: ['user-invite-info'] });
      void queryClient.invalidateQueries({ queryKey: ['user-info'] });
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: submitWithdrawTicket,
    onSuccess: () => {
      toast.success(t('invite.withdrawSuccess'));
      setWithdrawOpen(false);
      setWithdrawAccount('');
      void queryClient.invalidateQueries({ queryKey: ['user-stat'] });
    },
  });

  const handleCopyInvite = async (code: string) => {
    const url = `${window.location.origin}/#/register?code=${code}`;
    const ok = await copyToClipboard(url);
    if (ok) toast.success(t('common.copied'));
    else toast.error(t('common.copyFailed'));
  };

  const handleTransferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(transferYuan);
    if (!Number.isFinite(num) || num <= 0) return;
    transferMutation.mutate(Math.round(num * 100));
  };

  const handleWithdrawSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!withdrawMethod || !withdrawAccount.trim()) return;
    withdrawMutation.mutate({
      withdraw_method: withdrawMethod,
      withdraw_account: withdrawAccount.trim(),
    });
  };

  return (
    <div className="min-w-0 space-y-5">
      <h1 className="text-xl font-semibold tracking-tight">{t('invite.title')}</h1>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t('invite.currentCommission')}</CardDescription>
            <CardTitle className="font-mono text-2xl font-bold">
              {formatCurrency(stat[4], symbol)}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 pt-2">
            <Button
              type="button"
              size="sm"
              onClick={() => setTransferOpen(true)}
              disabled={stat[4] <= 0}
            >
              <ArrowRightLeft className="h-3.5 w-3.5" />
              {t('invite.transfer')}
            </Button>
            {!commConfig?.withdraw_close && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  if (!withdrawMethod && commConfig?.withdraw_methods?.length) {
                    setWithdrawMethod(commConfig.withdraw_methods[0]);
                  }
                  setWithdrawOpen(true);
                }}
                disabled={stat[4] <= 0}
              >
                <Wallet className="h-3.5 w-3.5" />
                {t('invite.withdraw')}
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardContent className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4 sm:p-6">
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-xs text-muted-foreground">{t('invite.registeredUsers')}</div>
              <div className="mt-1 font-mono text-lg font-semibold">{stat[0]}</div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-xs text-muted-foreground">{t('invite.commissionRate')}</div>
              <div className="mt-1 font-mono text-lg font-semibold">{stat[3]}%</div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-xs text-muted-foreground">{t('invite.pendingCommission')}</div>
              <div className="mt-1 font-mono text-lg font-semibold">
                {formatCurrency(stat[2], symbol)}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-xs text-muted-foreground">{t('invite.totalCommission')}</div>
              <div className="mt-1 font-mono text-lg font-semibold">
                {formatCurrency(stat[1], symbol)}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Invite Codes */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">{t('invite.codesTitle')}</CardTitle>
          <Button
            type="button"
            size="sm"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
          >
            {generateMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            {t('invite.generateCode')}
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {inviteQuery.isLoading ? (
            <div className="p-4">
              <Skeleton className="h-16 w-full" />
            </div>
          ) : codes.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">{t('common.noData')}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-y bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">{t('invite.codeCol')}</th>
                    <th className="px-4 py-2.5 font-medium">{t('invite.pvCol')}</th>
                    <th className="px-4 py-2.5 font-medium">{t('invite.createdAt')}</th>
                    <th className="px-4 py-2.5 text-right font-medium">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {codes.map((c) => (
                    <tr key={c.code} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-mono text-xs font-medium">{c.code}</td>
                      <td className="px-4 py-2.5 font-mono text-xs">{c.pv}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                        {formatTimestamp(c.created_at)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => handleCopyInvite(c.code)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                          {t('invite.copyLink')}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Commission Records */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('invite.recordsTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {records.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">{t('common.noData')}</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-y bg-muted/40 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">{t('invite.recordTime')}</th>
                      <th className="px-4 py-2.5 font-medium">{t('invite.orderAmount')}</th>
                      <th className="px-4 py-2.5 font-medium">{t('invite.recordAmount')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {records.map((r) => (
                      <tr key={r.id} className="hover:bg-muted/30">
                        <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                          {formatTimestamp(r.created_at)}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs">
                          {formatCurrency(r.order_amount, symbol)}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          +{formatCurrency(r.get_amount, symbol)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalRecords > 10 && (
                <div className="flex items-center justify-end gap-2 border-t px-4 py-2.5 text-xs">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2"
                    disabled={detailsPage <= 1}
                    onClick={() => setDetailsPage((p) => Math.max(1, p - 1))}
                  >
                    &lt;
                  </Button>
                  <span className="font-mono">
                    {detailsPage} / {Math.ceil(totalRecords / 10)}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2"
                    disabled={detailsPage >= Math.ceil(totalRecords / 10)}
                    onClick={() => setDetailsPage((p) => p + 1)}
                  >
                    &gt;
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('invite.transferTitle')}</DialogTitle>
            <DialogDescription>{t('invite.transferNotice')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleTransferSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t('invite.transferAmount')}</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder={t('invite.transferAmountPlaceholder')}
                value={transferYuan}
                onChange={(e) => setTransferYuan(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTransferOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={transferMutation.isPending}>
                {transferMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('common.confirm')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('invite.withdrawTitle')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleWithdrawSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t('invite.withdrawMethod')}</Label>
              <Select value={withdrawMethod} onValueChange={setWithdrawMethod}>
                <SelectTrigger>
                  <SelectValue placeholder={t('invite.withdrawMethodPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {(commConfig?.withdraw_methods ?? []).map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('invite.withdrawAccount')}</Label>
              <Input
                required
                placeholder={t('invite.withdrawAccountPlaceholder')}
                value={withdrawAccount}
                onChange={(e) => setWithdrawAccount(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setWithdrawOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={withdrawMutation.isPending}>
                {withdrawMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('common.confirm')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
