import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { apiRequest } from '@/lib/api';
import { getPanelSettings } from '@/lib/settings';
import { useAuthStore } from '@/stores/auth';
import { PreferenceControls } from '@/components/layout/PreferenceControls';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface LoginResponseData {
  token: string;
  auth_data: string;
  is_admin?: boolean | number;
}

export default function SignInPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = useAuthStore((s) => s.token);
  const setToken = useAuthStore((s) => s.setToken);
  const { title, logo } = getPanelSettings();

  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const schema = z.object({
    email: z
      .string()
      .min(1, t('auth.signIn.validation.emailRequired'))
      .email(t('auth.signIn.validation.emailInvalid')),
    password: z
      .string()
      .min(1, t('auth.signIn.validation.passwordRequired'))
      .min(7, t('auth.signIn.validation.passwordLength')),
  });

  type FormValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const redirectTarget = searchParams.get('redirect') || '/';

  useEffect(() => {
    if (token) {
      void navigate(redirectTarget, { replace: true });
    }
  }, [token, navigate, redirectTarget]);

  useEffect(() => {
    const verify = searchParams.get('verify');
    if (!verify || token) return;

    void (async () => {
      setSubmitting(true);
      try {
        const res = await apiRequest<LoginResponseData>('/passport/auth/token2Login', {
          method: 'GET',
          params: { verify },
        });
        if (!res.data?.is_admin) {
          toast.error(t('auth.signIn.notAdmin'));
          return;
        }
        setToken(res.data.auth_data, true);
        toast.success(t('auth.signIn.success'));
        void navigate(redirectTarget, { replace: true });
      } finally {
        setSubmitting(false);
      }
    })();
  }, [searchParams, token, setToken, navigate, redirectTarget, t]);

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    try {
      const res = await apiRequest<LoginResponseData>('/passport/auth/login', {
        method: 'POST',
        body: values,
      });

      if (!res.data?.is_admin) {
        toast.error(t('auth.signIn.notAdmin'));
        return;
      }

      setToken(res.data.auth_data, rememberMe);
      toast.success(t('auth.signIn.success'));
      void navigate(redirectTarget, { replace: true });
    } catch {
      // Error toast is already handled by apiRequest
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-muted/30 px-4 pt-16 pb-12 sm:py-12">
      <div className="absolute right-4 top-4 flex items-center gap-2 sm:right-6 sm:top-6">
        <PreferenceControls buttonVariant="outline" />
      </div>

      <div className="mb-6 flex items-center gap-2.5">
        {logo ? (
          <img src={logo} alt={title} className="h-9 w-9 rounded-lg object-contain" />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground shadow-xs">
            {(title || 'X').slice(0, 1).toUpperCase()}
          </div>
        )}
        <span className="text-xl font-semibold tracking-tight">{title}</span>
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-xl">{t('auth.signIn.title')}</CardTitle>
          <CardDescription>{t('auth.signIn.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.signIn.email')}</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder={t('auth.signIn.emailPlaceholder')}
                {...register('email')}
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">{t('auth.signIn.password')}</Label>
                <button
                  type="button"
                  onClick={() => setForgotOpen(true)}
                  className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  {t('auth.signIn.forgotPassword')}
                </button>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder={t('auth.signIn.passwordPlaceholder')}
                  className="pr-9"
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="remember-me"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked === true)}
              />
              <Label htmlFor="remember-me" className="text-sm font-normal cursor-pointer">
                {t('auth.signIn.rememberMe')}
              </Label>
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? t('auth.signIn.submitting') : t('auth.signIn.submit')}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('auth.signIn.resetPassword.title')}</DialogTitle>
            <DialogDescription>{t('auth.signIn.resetPassword.description')}</DialogDescription>
          </DialogHeader>
          <pre className="overflow-x-auto rounded-md border bg-muted p-3 font-mono text-xs">
            {t('auth.signIn.resetPassword.command')}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
