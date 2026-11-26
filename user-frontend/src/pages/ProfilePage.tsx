import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ExternalLink,
  Gift,
  KeyRound,
  Loader2,
  RotateCcw,
  Send,
  Shield,
  Wallet,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  checkGiftCard,
  fetchGiftCardHistory,
  redeemGiftCard,
  type GiftCardCheckResponse,
} from '@/api/giftCard';
import {
  changePassword,
  fetchActiveSessions,
  fetchTelegramBotInfo,
  fetchUserCommConfig,
  fetchUserInfo,
  fetchUserSubscribe,
  removeActiveSession,
  resetSecurity,
  updateUserNotify,
} from '@/api/user';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { formatCurrency, formatTimestamp } from '@/lib/format';
import { removeStoredToken } from '@/lib/storage';

export default function ProfilePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [giftCode, setGiftCode] = useState('');
  const [giftPreview, setGiftPreview] = useState<GiftCardCheckResponse | null>(null);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const userQuery = useQuery({
    queryKey: ['user-info'],
    queryFn: fetchUserInfo,
  });

  const commQuery = useQuery({
    queryKey: ['user-comm-config'],
    queryFn: fetchUserCommConfig,
  });

  const subQuery = useQuery({
    queryKey: ['user-subscribe'],
    queryFn: fetchUserSubscribe,
  });

  const sessionsQuery = useQuery({
    queryKey: ['user-sessions'],
    queryFn: fetchActiveSessions,
  });

  const giftHistoryQuery = useQuery({
    queryKey: ['user-gift-card-history'],
    queryFn: () => fetchGiftCardHistory(1, 10),
  });

  const tgBotQuery = useQuery({
    queryKey: ['user-tg-bot'],
    queryFn: fetchTelegramBotInfo,
    enabled: Boolean(commQuery.data?.is_telegram),
  });

  const user = userQuery.data;
  const comm = commQuery.data;
  const symbol = comm?.currency_symbol || '¥';

  const notifyMutation = useMutation({
    mutationFn: updateUserNotify,
    onSuccess: () => {
      toast.success(t('common.saveSuccess'));
      void queryClient.invalidateQueries({ queryKey: ['user-info'] });
    },
  });

  const passwordMutation = useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      toast.success(t('common.saveSuccess'));
      removeStoredToken();
      queryClient.clear();
      navigate('/login', { replace: true });
    },
  });

  const resetMutation = useMutation({
    mutationFn: resetSecurity,
    onSuccess: () => {
      toast.success(t('profile.resetSubSuccess'));
      setResetConfirmOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['user-subscribe'] });
    },
  });

  const checkGiftMutation = useMutation({
    mutationFn: () => checkGiftCard(giftCode.trim()),
    onSuccess: (data) => setGiftPreview(data),
    onError: () => setGiftPreview(null),
  });

  const redeemGiftMutation = useMutation({
    mutationFn: () => redeemGiftCard(giftCode.trim()),
    onSuccess: (res) => {
      toast.success(res.message || t('common.operationSuccess'));
      setGiftCode('');
      setGiftPreview(null);
      void queryClient.invalidateQueries({ queryKey: ['user-info'] });
      void queryClient.invalidateQueries({ queryKey: ['user-subscribe'] });
      void queryClient.invalidateQueries({ queryKey: ['user-gift-card-history'] });
    },
  });

  const revokeSessionMutation = useMutation({
    mutationFn: (id: string | number) => removeActiveSession(id),
    onSuccess: () => {
      toast.success(t('common.operationSuccess'));
      void queryClient.invalidateQueries({ queryKey: ['user-sessions'] });
    },
  });

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error(t('auth.passwordTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t('auth.passwordMismatch'));
      return;
    }
    passwordMutation.mutate({
      old_password: oldPassword,
      new_password: newPassword,
    });
  };

  return (
    <div className="min-w-0 space-y-5">
      <h1 className="text-xl font-semibold tracking-tight">{t('profile.title')}</h1>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Wallet */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-4 w-4 text-muted-foreground" />
              {t('profile.walletTitle')}
            </CardTitle>
            <CardDescription>{t('profile.walletDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-3xl font-bold">
              {formatCurrency(user?.balance, symbol)}
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('profile.notifyTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="remind-expire">{t('profile.remindExpire')}</Label>
              <Switch
                id="remind-expire"
                checked={Boolean(user?.remind_expire)}
                disabled={notifyMutation.isPending}
                onCheckedChange={(checked) =>
                  notifyMutation.mutate({ remind_expire: checked ? 1 : 0 })
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="remind-traffic">{t('profile.remindTraffic')}</Label>
              <Switch
                id="remind-traffic"
                checked={Boolean(user?.remind_traffic)}
                disabled={notifyMutation.isPending}
                onCheckedChange={(checked) =>
                  notifyMutation.mutate({ remind_traffic: checked ? 1 : 0 })
                }
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Gift Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Gift className="h-4 w-4 text-muted-foreground" />
              {t('profile.giftCardTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder={t('profile.giftCardPlaceholder')}
                value={giftCode}
                onChange={(e) => {
                  setGiftCode(e.target.value);
                  if (giftPreview) setGiftPreview(null);
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={!giftCode.trim() || checkGiftMutation.isPending}
                onClick={() => checkGiftMutation.mutate()}
              >
                {checkGiftMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {t('profile.giftCardCheck')}
              </Button>
              <Button
                type="button"
                disabled={!giftCode.trim() || redeemGiftMutation.isPending}
                onClick={() => redeemGiftMutation.mutate()}
              >
                {redeemGiftMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {t('profile.giftCardRedeem')}
              </Button>
            </div>

            {giftPreview && (
              <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {giftPreview.code_info.template_name || giftPreview.code_info.code}
                  </span>
                  <Badge variant={giftPreview.can_redeem ? 'success' : 'destructive'}>
                    {giftPreview.can_redeem
                      ? t('profile.giftCardEligible')
                      : t('profile.giftCardIneligible')}
                  </Badge>
                </div>
                {giftPreview.reason && (
                  <div className="text-muted-foreground">{giftPreview.reason}</div>
                )}
              </div>
            )}

            {(giftHistoryQuery.data?.data ?? []).length > 0 && (
              <div className="space-y-1.5 pt-2">
                <div className="text-xs font-medium text-muted-foreground">
                  {t('profile.giftCardHistory')}
                </div>
                <div className="max-h-40 space-y-1.5 overflow-y-auto">
                  {giftHistoryQuery.data!.data.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2 text-xs"
                    >
                      <span className="truncate font-medium">{item.template_name}</span>
                      <span className="font-mono text-muted-foreground">
                        {formatTimestamp(item.created_at)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Change Password */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              {t('profile.changePasswordTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordSubmit} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="old-pwd">{t('profile.oldPassword')}</Label>
                <Input
                  id="old-pwd"
                  type="password"
                  required
                  placeholder={t('profile.oldPasswordPlaceholder')}
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="new-pwd">{t('profile.newPassword')}</Label>
                <Input
                  id="new-pwd"
                  type="password"
                  required
                  placeholder={t('profile.newPasswordPlaceholder')}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="confirm-pwd">{t('profile.confirmNewPassword')}</Label>
                <Input
                  id="confirm-pwd"
                  type="password"
                  required
                  placeholder={t('auth.confirmPasswordPlaceholder')}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              <Button type="submit" size="sm" disabled={passwordMutation.isPending}>
                {passwordMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {t('common.save')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Telegram Binding */}
      {Boolean(comm?.is_telegram) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Send className="h-4 w-4 text-muted-foreground" />
              {t('profile.telegramTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {user?.telegram_id ? (
              <Badge variant="success">
                {t('profile.telegramBound', { id: user.telegram_id })}
              </Badge>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">{t('profile.telegramUnbound')}</p>
                {subQuery.data?.subscribe_url && (
                  <div className="rounded-lg border bg-muted/30 px-3 py-2 font-mono text-xs break-all">
                    {t('profile.telegramBindCmd', { subUrl: subQuery.data.subscribe_url })}
                  </div>
                )}
                {tgBotQuery.data?.username && (
                  <Button type="button" size="sm" variant="outline" asChild>
                    <a
                      href={`https://t.me/${tgBotQuery.data.username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {t('profile.telegramBindBtn')} (@{tgBotQuery.data.username})
                    </a>
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Active Sessions */}
      {(sessionsQuery.data ?? []).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4 text-muted-foreground" />
              {t('profile.sessionsTitle')}
            </CardTitle>
            <CardDescription>{t('profile.sessionsDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-[min(20rem,50vh)] space-y-2 overflow-y-auto">
              {sessionsQuery.data!.map((sess) => (
                <div
                  key={sess.id}
                  className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3.5 py-2.5 text-xs"
                >
                  <div className="min-w-0">
                    <div className="truncate font-mono font-medium">{sess.name || `#${sess.id}`}</div>
                    <div className="text-muted-foreground">
                      {sess.last_used_at || sess.created_at || '—'}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                    disabled={revokeSessionMutation.isPending}
                    onClick={() => revokeSessionMutation.mutate(sess.id)}
                  >
                    {t('profile.revokeSession')}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reset Subscription */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <RotateCcw className="h-4 w-4 text-muted-foreground" />
            {t('profile.resetSubTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3.5 py-3 text-xs leading-relaxed text-amber-800 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t('profile.resetSubWarning')}</span>
          </div>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => setResetConfirmOpen(true)}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t('profile.resetSubBtn')}
          </Button>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={resetConfirmOpen}
        onOpenChange={setResetConfirmOpen}
        title={t('profile.resetSubTitle')}
        description={t('profile.resetSubConfirm')}
        variant="destructive"
        loading={resetMutation.isPending}
        onConfirm={() => resetMutation.mutate()}
      />
    </div>
  );
}
