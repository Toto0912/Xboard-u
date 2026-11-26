import { useMutation, useQuery } from '@tanstack/react-query';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { register, sendEmailVerify, trackInvitePv } from '@/api/auth';
import { fetchGuestConfig } from '@/api/guest';
import { CaptchaWidget, type CaptchaHandle } from '@/components/shared/CaptchaWidget';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getUserSettings } from '@/lib/settings';
import { setStoredToken } from '@/lib/storage';
import { AuthShell } from '@/pages/auth/AuthShell';

export default function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { title } = getUserSettings();
  const captchaRef = useRef<CaptchaHandle>(null);

  const [emailPrefix, setEmailPrefix] = useState('');
  const [emailSuffix, setEmailSuffix] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteCode, setInviteCode] = useState(() => searchParams.get('code') || '');
  const [agreeTos, setAgreeTos] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const guestQuery = useQuery({
    queryKey: ['guest-config'],
    queryFn: fetchGuestConfig,
  });
  const config = guestQuery.data;

  const whitelist = Array.isArray(config?.email_whitelist_suffix)
    ? config.email_whitelist_suffix
    : null;

  useEffect(() => {
    document.title = `${t('auth.registerBtn')} | ${title}`;
  }, [t, title]);

  useEffect(() => {
    if (whitelist && whitelist.length > 0 && !emailSuffix) {
      setEmailSuffix(whitelist[0]);
    }
  }, [whitelist, emailSuffix]);

  useEffect(() => {
    const code = searchParams.get('code');
    if (code) {
      void trackInvitePv(code);
    }
  }, [searchParams]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((s) => (s > 1 ? s - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const fullEmail = whitelist
    ? `${emailPrefix.trim()}@${emailSuffix}`
    : emailPrefix.trim();

  const sendCodeMutation = useMutation({
    mutationFn: async () => {
      const captchaPayload = (await captchaRef.current?.getPayload('send_email')) ?? {};
      return sendEmailVerify({
        email: fullEmail,
        ...captchaPayload,
      });
    },
    onSuccess: () => {
      toast.success(t('auth.codeSent'));
      setCooldown(60);
      captchaRef.current?.reset();
    },
    onError: () => {
      captchaRef.current?.reset();
    },
  });

  const registerMutation = useMutation({
    mutationFn: async () => {
      const captchaPayload = (await captchaRef.current?.getPayload('register')) ?? {};
      return register({
        email: fullEmail,
        password,
        email_code: config?.is_email_verify ? emailCode.trim() : undefined,
        invite_code: inviteCode.trim() || undefined,
        ...captchaPayload,
      });
    },
    onSuccess: (data) => {
      setStoredToken(data.auth_data);
      toast.success(t('auth.registerSuccess'));
      navigate('/dashboard', { replace: true });
    },
    onError: () => {
      captchaRef.current?.reset();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error(t('auth.passwordTooShort'));
      return;
    }
    if (password !== confirmPassword) {
      toast.error(t('auth.passwordMismatch'));
      return;
    }
    if (config?.tos_url && !agreeTos) {
      toast.error(t('auth.mustAgreeTos'));
      return;
    }
    registerMutation.mutate();
  };

  return (
    <AuthShell heading={t('auth.registerTitle')} subheading={t('auth.registerSubtitle')}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="reg-email">{t('auth.email')}</Label>
          {whitelist ? (
            <div className="flex items-center gap-1.5">
              <Input
                id="reg-email"
                type="text"
                required
                placeholder={t('auth.emailPlaceholder')}
                value={emailPrefix}
                onChange={(e) => setEmailPrefix(e.target.value)}
                className="flex-1"
              />
              <span className="text-sm text-muted-foreground">@</span>
              <Select value={emailSuffix} onValueChange={setEmailSuffix}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {whitelist.map((suffix) => (
                    <SelectItem key={suffix} value={suffix}>
                      {suffix}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <Input
              id="reg-email"
              type="email"
              required
              autoComplete="email"
              placeholder={t('auth.emailPlaceholder')}
              value={emailPrefix}
              onChange={(e) => setEmailPrefix(e.target.value)}
            />
          )}
        </div>

        {Boolean(config?.is_email_verify) && (
          <div className="space-y-1.5">
            <Label htmlFor="reg-code">{t('auth.emailCode')}</Label>
            <div className="flex gap-2">
              <Input
                id="reg-code"
                required
                placeholder={t('auth.emailCodePlaceholder')}
                value={emailCode}
                onChange={(e) => setEmailCode(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                disabled={!emailPrefix.trim() || cooldown > 0 || sendCodeMutation.isPending}
                onClick={() => sendCodeMutation.mutate()}
              >
                {sendCodeMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {cooldown > 0 ? t('auth.resendAfter', { seconds: cooldown }) : t('auth.sendCode')}
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="reg-password">{t('auth.password')}</Label>
          <div className="relative">
            <Input
              id="reg-password"
              type={showPassword ? 'text' : 'password'}
              required
              placeholder={t('auth.newPasswordPlaceholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-9"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reg-confirm">{t('auth.confirmPassword')}</Label>
          <Input
            id="reg-confirm"
            type={showPassword ? 'text' : 'password'}
            required
            placeholder={t('auth.confirmPasswordPlaceholder')}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reg-invite">
            {config?.is_invite_force ? t('auth.inviteCode') : t('auth.inviteCodeOptional')}
          </Label>
          <Input
            id="reg-invite"
            required={Boolean(config?.is_invite_force)}
            placeholder={
              config?.is_invite_force ? t('auth.inviteCodeRequired') : t('auth.inviteCodeOptional')
            }
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
          />
        </div>

        <CaptchaWidget ref={captchaRef} config={config} />

        {config?.tos_url && (
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={agreeTos}
              onChange={(e) => setAgreeTos(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-input"
            />
            <span>
              {t('auth.agreeTos')}{' '}
              <a
                href={config.tos_url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground underline"
              >
                {t('auth.tosLink')}
              </a>
            </span>
          </label>
        )}

        <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
          {registerMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t('auth.registerBtn')}
        </Button>

        <div className="pt-2 text-center text-xs text-muted-foreground">
          {t('auth.hasAccount')}{' '}
          <Link to="/login" className="font-medium text-foreground hover:underline">
            {t('auth.goLogin')}
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
