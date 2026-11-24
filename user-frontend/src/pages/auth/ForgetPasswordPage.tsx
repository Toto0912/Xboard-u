import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { forgetPassword, sendEmailVerify } from '@/api/auth';
import { fetchGuestConfig } from '@/api/guest';
import { CaptchaWidget, type CaptchaHandle } from '@/components/shared/CaptchaWidget';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getUserSettings } from '@/lib/settings';
import { AuthShell } from '@/pages/auth/AuthShell';

export default function ForgetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { title } = getUserSettings();
  const captchaRef = useRef<CaptchaHandle>(null);

  const [email, setEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [cooldown, setCooldown] = useState(0);

  const guestQuery = useQuery({
    queryKey: ['guest-config'],
    queryFn: fetchGuestConfig,
  });

  useEffect(() => {
    document.title = `${t('auth.forgetTitle')} | ${title}`;
  }, [t, title]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((s) => (s > 1 ? s - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const sendCodeMutation = useMutation({
    mutationFn: async () => {
      const captchaPayload = (await captchaRef.current?.getPayload('forget')) ?? {};
      return sendEmailVerify({
        email: email.trim(),
        ...captchaPayload,
      });
    },
    onSuccess: () => {
      toast.success(t('auth.codeSent'));
      setCooldown(60);
    },
    onError: () => {
      captchaRef.current?.reset();
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const captchaPayload = (await captchaRef.current?.getPayload('forget_reset')) ?? {};
      return forgetPassword({
        email: email.trim(),
        email_code: emailCode.trim(),
        password,
        ...captchaPayload,
      });
    },
    onSuccess: () => {
      toast.success(t('auth.resetSuccess'));
      navigate('/login', { replace: true });
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
    resetMutation.mutate();
  };

  return (
    <AuthShell heading={t('auth.forgetTitle')} subheading={t('auth.forgetSubtitle')}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="fg-email">{t('auth.email')}</Label>
          <Input
            id="fg-email"
            type="email"
            required
            placeholder={t('auth.emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="fg-code">{t('auth.emailCode')}</Label>
          <div className="flex gap-2">
            <Input
              id="fg-code"
              required
              placeholder={t('auth.emailCodePlaceholder')}
              value={emailCode}
              onChange={(e) => setEmailCode(e.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              disabled={!email.trim() || cooldown > 0 || sendCodeMutation.isPending}
              onClick={() => sendCodeMutation.mutate()}
            >
              {sendCodeMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {cooldown > 0 ? t('auth.resendAfter', { seconds: cooldown }) : t('auth.sendCode')}
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="fg-password">{t('auth.newPassword')}</Label>
          <Input
            id="fg-password"
            type="password"
            required
            placeholder={t('auth.newPasswordPlaceholder')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="fg-confirm">{t('auth.confirmPassword')}</Label>
          <Input
            id="fg-confirm"
            type="password"
            required
            placeholder={t('auth.confirmPasswordPlaceholder')}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>

        <CaptchaWidget ref={captchaRef} config={guestQuery.data} />

        <Button type="submit" className="w-full" disabled={resetMutation.isPending}>
          {resetMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t('auth.resetBtn')}
        </Button>

        <div className="pt-2 text-center text-xs text-muted-foreground">
          <Link to="/login" className="font-medium text-foreground hover:underline">
            {t('auth.goLogin')}
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
