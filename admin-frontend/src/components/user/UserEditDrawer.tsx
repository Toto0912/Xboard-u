import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { PlanRecord } from '@/api/plan';
import { updateUser, type UserRecord } from '@/api/user';
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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

interface UserEditDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserRecord | null;
  plans: PlanRecord[];
}

function toDatetimeLocal(ts: number | null | undefined): string {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function bytesToGbInput(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '0';
  return String(Number((bytes / 1073741824).toFixed(2)));
}

export function UserEditDrawer({
  open,
  onOpenChange,
  user,
  plans,
}: UserEditDrawerProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState('');
  const [inviteUserEmail, setInviteUserEmail] = useState('');
  const [password, setPassword] = useState('');
  const [balance, setBalance] = useState('');
  const [commissionBalance, setCommissionBalance] = useState('');
  const [uGb, setUGb] = useState('0');
  const [dGb, setDGb] = useState('0');
  const [transferGb, setTransferGb] = useState('0');
  const [expiredAt, setExpiredAt] = useState('');
  const [planId, setPlanId] = useState('none');
  const [banned, setBanned] = useState('0');
  const [commissionType, setCommissionType] = useState('0');
  const [commissionRate, setCommissionRate] = useState('');
  const [discount, setDiscount] = useState('');
  const [speedLimit, setSpeedLimit] = useState('');
  const [deviceLimit, setDeviceLimit] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isStaff, setIsStaff] = useState(false);
  const [remarks, setRemarks] = useState('');

  useEffect(() => {
    if (!open || !user) return;
    setEmail(user.email ?? '');
    setInviteUserEmail(user.invite_user?.email ?? '');
    setPassword('');
    setBalance(String(user.balance ?? 0));
    setCommissionBalance(String(user.commission_balance ?? 0));
    setUGb(bytesToGbInput(user.u));
    setDGb(bytesToGbInput(user.d));
    setTransferGb(bytesToGbInput(user.transfer_enable));
    setExpiredAt(toDatetimeLocal(user.expired_at));
    setPlanId(user.plan_id ? String(user.plan_id) : 'none');
    setBanned(user.banned ? '1' : '0');
    setCommissionType(String(user.commission_type ?? 0));
    setCommissionRate(user.commission_rate != null ? String(user.commission_rate) : '');
    setDiscount(user.discount != null ? String(user.discount) : '');
    setSpeedLimit(user.speed_limit != null ? String(user.speed_limit) : '');
    setDeviceLimit(user.device_limit != null ? String(user.device_limit) : '');
    setIsAdmin(Boolean(user.is_admin));
    setIsStaff(Boolean(user.is_staff));
    setRemarks(user.remarks ?? '');
  }, [open, user]);

  const updateMutation = useMutation({
    mutationFn: updateUser,
    onSuccess: () => {
      toast.success(t('common.saveSuccess'));
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      onOpenChange(false);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!email.trim()) {
      toast.error(t('userManage.emailRequired'));
      return;
    }

    const payload: Record<string, unknown> = {
      id: user.id,
      email: email.trim(),
      invite_user_email: inviteUserEmail.trim() || null,
      balance: Number(balance) || 0,
      commission_balance: Number(commissionBalance) || 0,
      u: Math.max(0, Math.round((Number(uGb) || 0) * 1073741824)),
      d: Math.max(0, Math.round((Number(dGb) || 0) * 1073741824)),
      transfer_enable: Math.max(0, Math.round((Number(transferGb) || 0) * 1073741824)),
      expired_at: expiredAt.trim()
        ? Math.floor(Date.parse(expiredAt) / 1000)
        : null,
      plan_id: planId === 'none' ? null : Number(planId),
      banned: banned === '1',
      commission_type: Number(commissionType) || 0,
      commission_rate:
        commissionRate.trim() !== '' ? Number(commissionRate) : null,
      discount: discount.trim() !== '' ? Number(discount) : null,
      speed_limit: speedLimit.trim() !== '' ? Number(speedLimit) : null,
      device_limit: deviceLimit.trim() !== '' ? Number(deviceLimit) : null,
      is_admin: isAdmin,
      is_staff: isStaff,
      remarks: remarks.trim() || null,
    };

    if (password.trim()) {
      payload.password = password.trim();
    }

    updateMutation.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="left-auto right-0 top-0 flex h-dvh w-full max-w-[460px] translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-l bg-[var(--xb-surface)] p-0 sm:rounded-none">
        <DialogHeader className="shrink-0 border-b bg-[var(--xb-heading)] px-6 py-4">
          <DialogTitle className="text-base">
            {t('nav.userManage')} #{user?.id}
          </DialogTitle>
          <DialogDescription className="text-xs">{user?.email}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('userManage.email')}</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t('userManage.inviteUserEmail')}</Label>
              <Input
                value={inviteUserEmail}
                onChange={(e) => setInviteUserEmail(e.target.value)}
                placeholder={t('userManage.inviteUserPlaceholder')}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t('userManage.password')}</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('userManage.passwordEditPlaceholder')}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('userManage.balance')}</Label>
                <div className="relative flex items-center">
                  <Input
                    type="number"
                    step="0.01"
                    className="pr-7 font-mono text-xs"
                    value={balance}
                    onChange={(e) => setBalance(e.target.value)}
                  />
                  <span className="pointer-events-none absolute right-2.5 text-xs text-muted-foreground">
                    ¥
                  </span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('userManage.commissionBalance')}</Label>
                <div className="relative flex items-center">
                  <Input
                    type="number"
                    step="0.01"
                    className="pr-7 font-mono text-xs"
                    value={commissionBalance}
                    onChange={(e) => setCommissionBalance(e.target.value)}
                  />
                  <span className="pointer-events-none absolute right-2.5 text-xs text-muted-foreground">
                    ¥
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('userManage.usedUpload')}</Label>
                <div className="relative flex items-center">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    className="pr-9 font-mono text-xs"
                    value={uGb}
                    onChange={(e) => setUGb(e.target.value)}
                  />
                  <span className="pointer-events-none absolute right-2.5 text-xs text-muted-foreground">
                    GB
                  </span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('userManage.usedDownload')}</Label>
                <div className="relative flex items-center">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    className="pr-9 font-mono text-xs"
                    value={dGb}
                    onChange={(e) => setDGb(e.target.value)}
                  />
                  <span className="pointer-events-none absolute right-2.5 text-xs text-muted-foreground">
                    GB
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t('userManage.totalTrafficGb')}</Label>
              <div className="relative flex items-center">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  className="pr-9 font-mono text-xs"
                  value={transferGb}
                  onChange={(e) => setTransferGb(e.target.value)}
                />
                <span className="pointer-events-none absolute right-2.5 text-xs text-muted-foreground">
                  GB
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t('userManage.expiredAt')}</Label>
              <Input
                type="datetime-local"
                className="font-mono text-xs"
                value={expiredAt}
                onChange={(e) => setExpiredAt(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">{t('userManage.expiredAtHint')}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('order.plan')}</Label>
                <Select value={planId} onValueChange={setPlanId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('userManage.noPlan')}</SelectItem>
                    {plans.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('userManage.accountStatus')}</Label>
                <Select value={banned} onValueChange={setBanned}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">{t('userManage.statusNormal')}</SelectItem>
                    <SelectItem value="1">{t('userManage.statusBanned')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t('userManage.commissionType')}</Label>
              <Select value={commissionType} onValueChange={setCommissionType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">{t('plan.resetMethods.system')}</SelectItem>
                  <SelectItem value="1">{t('userManage.commissionLoop')}</SelectItem>
                  <SelectItem value="2">{t('userManage.commissionFirst')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('userManage.commissionRate')}</Label>
                <div className="relative flex items-center">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    className="pr-7 font-mono text-xs"
                    value={commissionRate}
                    onChange={(e) => setCommissionRate(e.target.value)}
                    placeholder={t('userManage.followSystem')}
                  />
                  <span className="pointer-events-none absolute right-2.5 text-xs text-muted-foreground">
                    %
                  </span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('userManage.discount')}</Label>
                <div className="relative flex items-center">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    className="pr-7 font-mono text-xs"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    placeholder="0"
                  />
                  <span className="pointer-events-none absolute right-2.5 text-xs text-muted-foreground">
                    %
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('plan.speedLimit')}</Label>
                <div className="relative flex items-center">
                  <Input
                    type="number"
                    min={0}
                    className="pr-12 font-mono text-xs"
                    value={speedLimit}
                    onChange={(e) => setSpeedLimit(e.target.value)}
                    placeholder={t('plan.unlimited')}
                  />
                  <span className="pointer-events-none absolute right-2.5 text-xs text-muted-foreground">
                    Mbps
                  </span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('plan.deviceLimit')}</Label>
                <Input
                  type="number"
                  min={0}
                  className="font-mono text-xs"
                  value={deviceLimit}
                  onChange={(e) => setDeviceLimit(e.target.value)}
                  placeholder={t('plan.unlimited')}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between rounded-lg border bg-[var(--xb-panel)] px-3 py-2">
                <Label className="text-xs">{t('userManage.isAdmin')}</Label>
                <Switch checked={isAdmin} onCheckedChange={setIsAdmin} />
              </div>
              <div className="flex items-center justify-between rounded-lg border bg-[var(--xb-panel)] px-3 py-2">
                <Label className="text-xs">{t('userManage.isStaff')}</Label>
                <Switch checked={isStaff} onCheckedChange={setIsStaff} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t('userManage.remarks')}</Label>
              <Textarea
                rows={3}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
            </div>
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t bg-[var(--xb-heading)] px-6 py-3.5">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={updateMutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('common.submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
