import { useMutation, useQuery } from '@tanstack/react-query';
import { Eye, EyeOff, Loader2, Mail } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { login, loginWithMailLink, token2Login } from '@/api/auth';
import { fetchGuestConfig } from '@/api/guest';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getUserSettings } from '@/lib/settings';
import { setStoredToken } from '@/lib/storage';
import { AuthShell } from '@/pages/auth/AuthShell';

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { title } = getUserSettings();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [verifyingToken, setVerifyingToken] = useState(false);

  const guestQuery = useQuery({
    queryKey: ['guest-config'],
    queryFn: fetchGuestConfig,
  });

  useEffect(() => {
    document.title = `${t('auth.loginBtn')} | ${title}`;
  }, [t, title]);

  const target = searchParams.get('redirect') || '';
  const redirectTarget = /^\/?[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\/?(?:[?#][^\s\\]*)?$/.test(target)
    ? '/' + target.replace(/^\//, '')
    : '/dashboard';
  const exchange = useRef<{ token: string; result: ReturnType<typeof token2Login> } | null>(null);
  const verifyToken = searchParams.get('verify');

  useEffect(() => {
    if (!verifyToken) return;
    let cancelled = false;
    setVerifyingToken(true);
    if (exchange.current?.token !== verifyToken) {
      exchange.current = { token: verifyToken, result: token2Login(verifyToken) };
    }
    void exchange.current.result
      .then((res) => {
        if (cancelled) return;
        setStoredToken(res.auth_data);
        toast.success(t('auth.loginSuccess'));
        navigate(redirectTarget, { replace: true });
      })
      .catch(() => {
        if (!cancelled) setVerifyingToken(false);
      });
    return () => {
      cancelled = true;
    };
  }, [verifyToken, redirectTarget, navigate, t]);

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: (data) => {
      setStoredToken(data.auth_data);
      toast.success(t('auth.loginSuccess'));
      navigate(redirectTarget, { replace: true });
    },
  });

  const mailLinkMutation = useMutation({
    mutationFn: loginWithMailLink,
    onSuccess: () => {
      toast.success(t('auth.mailLinkSent'));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ email: email.trim(), password });
  };

  if (verifyingToken) {
    return (
      <AuthShell heading={t('auth.loginTitle')} subheading={t('auth.verifyingToken')}>
        <div className="flex flex-col items-center justify-center gap-3 py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">{t('auth.verifyingToken')}</p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      heading={t('auth.loginTitle')}
      subheading={guestQuery.data?.app_description || t('auth.loginSubtitle')}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="login-email">{t('auth.email')}</Label>
          <Input
            id="login-email"
            type="email"
            required
            autoComplete="email"
            placeholder={t('auth.emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="login-password">{t('auth.password')}</Label>
            <Link
              to="/forgetpassword"
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              {t('auth.goForget')}
            </Link>
          </div>
          <div className="relative">
            <Input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              placeholder={t('auth.passwordPlaceholder')}
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

        <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
          {loginMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t('auth.loginBtn')}
        </Button>

        <Button
          type="button"
          variant="outline"
          className="w-full text-xs"
          disabled={!email.trim() || mailLinkMutation.isPending}
          onClick={() =>
            mailLinkMutation.mutate({
              email: email.trim(),
              redirect: redirectTarget.replace(/^\//, '') || 'dashboard',
            })
          }
        >
          {mailLinkMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Mail className="h-3.5 w-3.5" />
          )}
          {t('auth.mailLinkLogin')}
        </Button>

        <div className="pt-2 text-center text-xs text-muted-foreground">
          {t('auth.noAccount')}{' '}
          <Link to="/register" className="font-medium text-foreground hover:underline">
            {t('auth.goRegister')}
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
