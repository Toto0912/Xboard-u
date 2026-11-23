import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Bot,
  Copy,
  FileCode2,
  Gift,
  Globe,
  KeyRound,
  Loader2,
  Mail,
  Palette,
  RefreshCw,
  Save,
  Send,
  Server,
  Shield,
  Smartphone,
  Webhook,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchConfig,
  fetchPlansLite,
  saveConfig,
  setTelegramWebhook,
  testSendMail,
  type ConfigMappings,
} from '@/api/config';
import { getThemes } from '@/api/theme';
import { MailTemplateSection } from '@/components/config/MailTemplateSection';
import { SubscribeTemplateSection } from '@/components/config/SubscribeTemplateSection';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type ConfigSectionKey = keyof ConfigMappings;

const SECTIONS: Array<{ key: ConfigSectionKey; icon: typeof Globe }> = [
  { key: 'site', icon: Globe },
  { key: 'safe', icon: Shield },
  { key: 'subscribe', icon: KeyRound },
  { key: 'subscribe_template', icon: FileCode2 },
  { key: 'invite', icon: Gift },
  { key: 'frontend', icon: Palette },
  { key: 'server', icon: Server },
  { key: 'email', icon: Mail },
  { key: 'telegram', icon: Bot },
  { key: 'app', icon: Smartphone },
];

function SwitchRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
      <div className="space-y-0.5">
        <Label htmlFor={id} className="cursor-pointer">
          {label}
        </Label>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function SectionCard({
  title,
  description,
  saving,
  onSave,
  extraAction,
  children,
}: {
  title: string;
  description?: string;
  saving: boolean;
  onSave: () => void;
  extraAction?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 border-b px-6 py-4">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        <div className="flex items-center gap-2">
          {extraAction}
          <Button type="button" onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t('common.save')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 p-6">{children}</CardContent>
    </Card>
  );
}

function parseListInput(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function randomToken(length = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => chars[b % chars.length]).join('');
}

export default function SystemConfigPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState<ConfigSectionKey>('site');
  const [form, setForm] = useState<ConfigMappings | null>(null);
  const [whitelistText, setWhitelistText] = useState('');
  const [withdrawMethodsText, setWithdrawMethodsText] = useState('');

  const configQuery = useQuery({
    queryKey: ['admin-config'],
    queryFn: fetchConfig,
  });

  const plansQuery = useQuery({
    queryKey: ['admin-plans-lite'],
    queryFn: fetchPlansLite,
  });

  const themesQuery = useQuery({
    queryKey: ['admin-themes'],
    queryFn: getThemes,
  });

  useEffect(() => {
    if (!configQuery.data) return;
    setForm(configQuery.data);
    setWhitelistText((configQuery.data.safe.email_whitelist_suffix ?? []).join('\n'));
    setWithdrawMethodsText(
      (configQuery.data.invite.commission_withdraw_method ?? []).join('\n'),
    );
  }, [configQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => saveConfig(payload),
    onSuccess: () => {
      toast.success(t('common.saveSuccess'));
      void queryClient.invalidateQueries({ queryKey: ['admin-config'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-themes'] });
    },
  });

  const testMailMutation = useMutation({
    mutationFn: testSendMail,
    onSuccess: () => {
      toast.success(t('config.mailTestSent'));
    },
  });

  const webhookMutation = useMutation({
    mutationFn: () => setTelegramWebhook(form?.telegram.telegram_bot_token || undefined),
    onSuccess: (res) => {
      toast.success(`${t('config.webhookSuccess')}: ${res.webhook_url}`);
    },
  });

  const updateSection = <K extends ConfigSectionKey>(
    section: K,
    patch: Partial<ConfigMappings[K]>,
  ) => {
    setForm((prev) =>
      prev ? { ...prev, [section]: { ...prev[section], ...patch } } : prev,
    );
  };

  const handleSaveSite = () => {
    if (!form) return;
    const s = form.site;
    saveMutation.mutate({
      ...s,
      logo: s.logo?.trim() || null,
      app_url: s.app_url?.trim() || null,
      subscribe_url: s.subscribe_url?.trim() || null,
      tos_url: s.tos_url?.trim() || null,
      try_out_plan_id: Number(s.try_out_plan_id || 0),
      try_out_hour: Number(s.try_out_hour || 0),
      force_https: s.force_https ? 1 : 0,
      stop_register: s.stop_register ? 1 : 0,
    });
  };

  const handleSaveSafe = () => {
    if (!form) return;
    const sf = form.safe;
    saveMutation.mutate({
      ...sf,
      email_whitelist_suffix: parseListInput(whitelistText),
      recaptcha_enable: sf.captcha_enable,
      recaptcha_v3_score_threshold: Number(sf.recaptcha_v3_score_threshold ?? 0.5),
      register_limit_count: Number(sf.register_limit_count ?? 3),
      register_limit_expire: Number(sf.register_limit_expire ?? 60),
      password_limit_count: Number(sf.password_limit_count ?? 5),
      password_limit_expire: Number(sf.password_limit_expire ?? 60),
    });
  };

  const handleSaveInvite = () => {
    if (!form) return;
    const inv = form.invite;
    saveMutation.mutate({
      ...inv,
      invite_commission: inv.invite_commission === null ? null : Number(inv.invite_commission),
      invite_gen_limit: inv.invite_gen_limit === null ? null : Number(inv.invite_gen_limit),
      commission_withdraw_limit:
        inv.commission_withdraw_limit === null ? null : Number(inv.commission_withdraw_limit),
      commission_withdraw_method: parseListInput(withdrawMethodsText),
      commission_distribution_l1:
        inv.commission_distribution_l1 === null || String(inv.commission_distribution_l1) === ''
          ? null
          : Number(inv.commission_distribution_l1),
      commission_distribution_l2:
        inv.commission_distribution_l2 === null || String(inv.commission_distribution_l2) === ''
          ? null
          : Number(inv.commission_distribution_l2),
      commission_distribution_l3:
        inv.commission_distribution_l3 === null || String(inv.commission_distribution_l3) === ''
          ? null
          : Number(inv.commission_distribution_l3),
    });
  };

  const handleSaveFrontend = () => {
    if (!form) return;
    const fe = form.frontend;
    saveMutation.mutate({
      ...fe,
      frontend_background_url: fe.frontend_background_url?.trim() || null,
    });
  };

  const handleSaveServer = () => {
    if (!form) return;
    const sv = form.server;
    saveMutation.mutate({
      ...sv,
      server_token: sv.server_token?.trim() || null,
      server_pull_interval: Number(sv.server_pull_interval || 60),
      server_push_interval: Number(sv.server_push_interval || 60),
      device_limit_mode: Number(sv.device_limit_mode || 0),
      server_ws_url: sv.server_ws_url?.trim() || null,
    });
  };

  const handleSaveTelegram = () => {
    if (!form) return;
    const tg = form.telegram;
    saveMutation.mutate({
      ...tg,
      telegram_webhook_url: tg.telegram_webhook_url?.trim() || null,
      telegram_discuss_link: tg.telegram_discuss_link?.trim() || null,
    });
  };

  if (configQuery.isLoading || !form) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('nav.systemConfig')}</h1>
        <p className="text-sm text-muted-foreground">{t('config.subtitle')}</p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <nav className="flex shrink-0 gap-1 overflow-x-auto pb-1 lg:w-56 lg:flex-col lg:pb-0">
          {SECTIONS.map((sec) => {
            const Icon = sec.icon;
            const active = activeSection === sec.key;
            return (
              <button
                key={sec.key}
                type="button"
                onClick={() => setActiveSection(sec.key)}
                className={cn(
                  'flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors cursor-pointer',
                  active
                    ? 'bg-primary text-primary-foreground font-medium shadow-xs'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{t(`config.tabs.${sec.key}`)}</span>
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 flex-1 space-y-6">
          {activeSection === 'site' && (
            <SectionCard
              title={t('config.tabs.site')}
              saving={saveMutation.isPending}
              onSave={handleSaveSite}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{t('config.site.appName')}</Label>
                  <Input
                    value={form.site.app_name ?? ''}
                    onChange={(e) => updateSection('site', { app_name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('config.site.appDesc')}</Label>
                  <Input
                    value={form.site.app_description ?? ''}
                    onChange={(e) => updateSection('site', { app_description: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('config.site.appUrl')}</Label>
                  <Input
                    placeholder="https://example.com"
                    value={form.site.app_url ?? ''}
                    onChange={(e) => updateSection('site', { app_url: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('config.site.subscribeUrl')}</Label>
                  <Input
                    placeholder="https://sub.example.com"
                    value={form.site.subscribe_url ?? ''}
                    onChange={(e) => updateSection('site', { subscribe_url: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('config.site.logo')}</Label>
                  <Input
                    placeholder="https://..."
                    value={form.site.logo ?? ''}
                    onChange={(e) => updateSection('site', { logo: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('config.site.tosUrl')}</Label>
                  <Input
                    placeholder="https://..."
                    value={form.site.tos_url ?? ''}
                    onChange={(e) => updateSection('site', { tos_url: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('config.site.currency')}</Label>
                  <Input
                    value={form.site.currency ?? ''}
                    onChange={(e) => updateSection('site', { currency: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('config.site.currencySymbol')}</Label>
                  <Input
                    value={form.site.currency_symbol ?? ''}
                    onChange={(e) => updateSection('site', { currency_symbol: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('config.site.trialPlan')}</Label>
                  <Select
                    value={String(form.site.try_out_plan_id ?? 0)}
                    onValueChange={(v) => updateSection('site', { try_out_plan_id: Number(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">{t('common.disabled')}</SelectItem>
                      {(plansQuery.data ?? []).map((plan) => (
                        <SelectItem key={plan.id} value={String(plan.id)}>
                          {plan.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t('config.site.trialHour')}</Label>
                  <Input
                    type="number"
                    min="0"
                    value={form.site.try_out_hour ?? 0}
                    onChange={(e) =>
                      updateSection('site', { try_out_hour: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <SwitchRow
                  id="site-https"
                  label={t('config.site.forceHttps')}
                  checked={Boolean(form.site.force_https)}
                  onCheckedChange={(v) => updateSection('site', { force_https: v ? 1 : 0 })}
                />
                <SwitchRow
                  id="site-stop-reg"
                  label={t('config.site.stopRegister')}
                  checked={Boolean(form.site.stop_register)}
                  onCheckedChange={(v) => updateSection('site', { stop_register: v ? 1 : 0 })}
                />
                <SwitchRow
                  id="site-ticket-wait"
                  label={t('config.site.ticketMustWait')}
                  checked={Boolean(form.site.ticket_must_wait_reply)}
                  onCheckedChange={(v) =>
                    updateSection('site', { ticket_must_wait_reply: v })
                  }
                />
              </div>
            </SectionCard>
          )}

          {activeSection === 'safe' && (
            <SectionCard
              title={t('config.tabs.safe')}
              saving={saveMutation.isPending}
              onSave={handleSaveSafe}
            >
              <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{t('config.safe.securePathHint')}</span>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{t('config.safe.securePath')}</Label>
                  <Input
                    value={form.safe.secure_path ?? ''}
                    onChange={(e) => updateSection('safe', { secure_path: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('config.safe.captchaType')}</Label>
                  <Select
                    value={form.safe.captcha_type ?? 'recaptcha'}
                    onValueChange={(v) =>
                      updateSection('safe', {
                        captcha_type: v as ConfigMappings['safe']['captcha_type'],
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recaptcha">reCAPTCHA v2</SelectItem>
                      <SelectItem value="recaptcha-v3">reCAPTCHA v3</SelectItem>
                      <SelectItem value="turnstile">Cloudflare Turnstile</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <SwitchRow
                  id="safe-email-verify"
                  label={t('config.safe.emailVerify')}
                  checked={Boolean(form.safe.email_verify)}
                  onCheckedChange={(v) => updateSection('safe', { email_verify: v })}
                />
                <SwitchRow
                  id="safe-gmail-limit"
                  label={t('config.safe.gmailLimit')}
                  checked={Boolean(form.safe.email_gmail_limit_enable)}
                  onCheckedChange={(v) => updateSection('safe', { email_gmail_limit_enable: v })}
                />
                <SwitchRow
                  id="safe-mode"
                  label={t('config.safe.safeMode')}
                  checked={Boolean(form.safe.safe_mode_enable)}
                  onCheckedChange={(v) => updateSection('safe', { safe_mode_enable: v })}
                />
                <SwitchRow
                  id="safe-whitelist"
                  label={t('config.safe.emailWhitelist')}
                  checked={Boolean(form.safe.email_whitelist_enable)}
                  onCheckedChange={(v) => updateSection('safe', { email_whitelist_enable: v })}
                />
              </div>

              {form.safe.email_whitelist_enable && (
                <div className="space-y-1.5">
                  <Label>{t('config.safe.emailWhitelistSuffix')}</Label>
                  <Textarea
                    rows={3}
                    placeholder="gmail.com&#10;qq.com"
                    value={whitelistText}
                    onChange={(e) => setWhitelistText(e.target.value)}
                  />
                </div>
              )}

              <SwitchRow
                id="safe-captcha"
                label={t('config.safe.captchaEnable')}
                checked={Boolean(form.safe.captcha_enable)}
                onCheckedChange={(v) => updateSection('safe', { captcha_enable: v })}
              />

              {form.safe.captcha_enable && form.safe.captcha_type === 'recaptcha' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>reCAPTCHA Key</Label>
                    <Input
                      value={form.safe.recaptcha_key ?? ''}
                      onChange={(e) => updateSection('safe', { recaptcha_key: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>reCAPTCHA Site Key</Label>
                    <Input
                      value={form.safe.recaptcha_site_key ?? ''}
                      onChange={(e) =>
                        updateSection('safe', { recaptcha_site_key: e.target.value })
                      }
                    />
                  </div>
                </div>
              )}

              {form.safe.captcha_enable && form.safe.captcha_type === 'recaptcha-v3' && (
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>v3 Secret Key</Label>
                    <Input
                      value={form.safe.recaptcha_v3_secret_key ?? ''}
                      onChange={(e) =>
                        updateSection('safe', { recaptcha_v3_secret_key: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>v3 Site Key</Label>
                    <Input
                      value={form.safe.recaptcha_v3_site_key ?? ''}
                      onChange={(e) =>
                        updateSection('safe', { recaptcha_v3_site_key: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>v3 Score Threshold</Label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      max="1"
                      value={form.safe.recaptcha_v3_score_threshold ?? 0.5}
                      onChange={(e) =>
                        updateSection('safe', {
                          recaptcha_v3_score_threshold: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>
              )}

              {form.safe.captcha_enable && form.safe.captcha_type === 'turnstile' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Turnstile Secret Key</Label>
                    <Input
                      value={form.safe.turnstile_secret_key ?? ''}
                      onChange={(e) =>
                        updateSection('safe', { turnstile_secret_key: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Turnstile Site Key</Label>
                    <Input
                      value={form.safe.turnstile_site_key ?? ''}
                      onChange={(e) =>
                        updateSection('safe', { turnstile_site_key: e.target.value })
                      }
                    />
                  </div>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-3 rounded-lg border p-3">
                  <SwitchRow
                    id="safe-reg-limit"
                    label={t('config.safe.registerIpLimit')}
                    checked={Boolean(form.safe.register_limit_by_ip_enable)}
                    onCheckedChange={(v) =>
                      updateSection('safe', { register_limit_by_ip_enable: v })
                    }
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">{t('config.safe.limitCount')}</Label>
                      <Input
                        type="number"
                        value={form.safe.register_limit_count ?? 3}
                        onChange={(e) =>
                          updateSection('safe', {
                            register_limit_count: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t('config.safe.limitExpireMin')}</Label>
                      <Input
                        type="number"
                        value={form.safe.register_limit_expire ?? 60}
                        onChange={(e) =>
                          updateSection('safe', {
                            register_limit_expire: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border p-3">
                  <SwitchRow
                    id="safe-pwd-limit"
                    label={t('config.safe.passwordLimit')}
                    checked={Boolean(form.safe.password_limit_enable)}
                    onCheckedChange={(v) => updateSection('safe', { password_limit_enable: v })}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">{t('config.safe.limitCount')}</Label>
                      <Input
                        type="number"
                        value={form.safe.password_limit_count ?? 5}
                        onChange={(e) =>
                          updateSection('safe', {
                            password_limit_count: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t('config.safe.limitExpireMin')}</Label>
                      <Input
                        type="number"
                        value={form.safe.password_limit_expire ?? 60}
                        onChange={(e) =>
                          updateSection('safe', {
                            password_limit_expire: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            </SectionCard>
          )}

          {activeSection === 'subscribe' && (
            <SectionCard
              title={t('config.tabs.subscribe')}
              saving={saveMutation.isPending}
              onSave={() => saveMutation.mutate(form.subscribe)}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{t('config.subscribe.subscribePath')}</Label>
                  <Input
                    value={form.subscribe.subscribe_path ?? 's'}
                    onChange={(e) =>
                      updateSection('subscribe', { subscribe_path: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('config.subscribe.resetMethod')}</Label>
                  <Select
                    value={String(form.subscribe.reset_traffic_method ?? 0)}
                    onValueChange={(v) =>
                      updateSection('subscribe', { reset_traffic_method: Number(v) })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">{t('config.subscribe.reset0')}</SelectItem>
                      <SelectItem value="1">{t('config.subscribe.reset1')}</SelectItem>
                      <SelectItem value="2">{t('config.subscribe.reset2')}</SelectItem>
                      <SelectItem value="3">{t('config.subscribe.reset3')}</SelectItem>
                      <SelectItem value="4">{t('config.subscribe.reset4')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(
                  [
                    ['new_order_event_id', t('config.subscribe.newOrderEvent')],
                    ['renew_order_event_id', t('config.subscribe.renewOrderEvent')],
                    ['change_order_event_id', t('config.subscribe.changeOrderEvent')],
                  ] as const
                ).map(([field, label]) => (
                  <div key={field} className="space-y-1.5">
                    <Label>{label}</Label>
                    <Select
                      value={String(form.subscribe[field] ?? 0)}
                      onValueChange={(v) =>
                        updateSection('subscribe', { [field]: Number(v) })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">{t('config.subscribe.eventNone')}</SelectItem>
                        <SelectItem value="1">{t('config.subscribe.eventResetTraffic')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <SwitchRow
                  id="sub-plan-change"
                  label={t('config.subscribe.planChange')}
                  checked={Boolean(form.subscribe.plan_change_enable)}
                  onCheckedChange={(v) =>
                    updateSection('subscribe', { plan_change_enable: v })
                  }
                />
                <SwitchRow
                  id="sub-surplus"
                  label={t('config.subscribe.surplus')}
                  checked={Boolean(form.subscribe.surplus_enable)}
                  onCheckedChange={(v) => updateSection('subscribe', { surplus_enable: v })}
                />
                <SwitchRow
                  id="sub-show-info"
                  label={t('config.subscribe.showInfo')}
                  checked={Boolean(form.subscribe.show_info_to_server_enable)}
                  onCheckedChange={(v) =>
                    updateSection('subscribe', { show_info_to_server_enable: v })
                  }
                />
                <SwitchRow
                  id="sub-show-proto"
                  label={t('config.subscribe.showProtocol')}
                  checked={Boolean(form.subscribe.show_protocol_to_server_enable)}
                  onCheckedChange={(v) =>
                    updateSection('subscribe', { show_protocol_to_server_enable: v })
                  }
                />
                <SwitchRow
                  id="sub-remind-expire"
                  label={t('config.subscribe.defaultRemindExpire')}
                  checked={Boolean(form.subscribe.default_remind_expire)}
                  onCheckedChange={(v) =>
                    updateSection('subscribe', { default_remind_expire: v })
                  }
                />
                <SwitchRow
                  id="sub-remind-traffic"
                  label={t('config.subscribe.defaultRemindTraffic')}
                  checked={Boolean(form.subscribe.default_remind_traffic)}
                  onCheckedChange={(v) =>
                    updateSection('subscribe', { default_remind_traffic: v })
                  }
                />
              </div>
            </SectionCard>
          )}

          {activeSection === 'subscribe_template' && (
            <SubscribeTemplateSection initial={form.subscribe_template} />
          )}

          {activeSection === 'invite' && (
            <SectionCard
              title={t('config.tabs.invite')}
              saving={saveMutation.isPending}
              onSave={handleSaveInvite}
            >
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>{t('config.invite.commissionRate')}</Label>
                  <Input
                    type="number"
                    value={form.invite.invite_commission ?? 10}
                    onChange={(e) =>
                      updateSection('invite', { invite_commission: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('config.invite.genLimit')}</Label>
                  <Input
                    type="number"
                    value={form.invite.invite_gen_limit ?? 5}
                    onChange={(e) =>
                      updateSection('invite', { invite_gen_limit: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('config.invite.withdrawLimit')}</Label>
                  <Input
                    type="number"
                    value={form.invite.commission_withdraw_limit ?? 100}
                    onChange={(e) =>
                      updateSection('invite', {
                        commission_withdraw_limit: Number(e.target.value),
                      })
                    }
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>{t('config.invite.withdrawMethods')}</Label>
                <Textarea
                  rows={3}
                  value={withdrawMethodsText}
                  onChange={(e) => setWithdrawMethodsText(e.target.value)}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <SwitchRow
                  id="inv-force"
                  label={t('config.invite.forceInvite')}
                  checked={Boolean(form.invite.invite_force)}
                  onCheckedChange={(v) => updateSection('invite', { invite_force: v })}
                />
                <SwitchRow
                  id="inv-never-expire"
                  label={t('config.invite.neverExpire')}
                  checked={Boolean(form.invite.invite_never_expire)}
                  onCheckedChange={(v) => updateSection('invite', { invite_never_expire: v })}
                />
                <SwitchRow
                  id="inv-first-time"
                  label={t('config.invite.firstTimeOnly')}
                  checked={Boolean(form.invite.commission_first_time_enable)}
                  onCheckedChange={(v) =>
                    updateSection('invite', { commission_first_time_enable: v })
                  }
                />
                <SwitchRow
                  id="inv-auto-check"
                  label={t('config.invite.autoCheck')}
                  checked={Boolean(form.invite.commission_auto_check_enable)}
                  onCheckedChange={(v) =>
                    updateSection('invite', { commission_auto_check_enable: v })
                  }
                />
                <SwitchRow
                  id="inv-withdraw-close"
                  label={t('config.invite.withdrawClose')}
                  checked={Boolean(form.invite.withdraw_close_enable)}
                  onCheckedChange={(v) => updateSection('invite', { withdraw_close_enable: v })}
                />
                <SwitchRow
                  id="inv-dist"
                  label={t('config.invite.distribution')}
                  checked={Boolean(form.invite.commission_distribution_enable)}
                  onCheckedChange={(v) =>
                    updateSection('invite', { commission_distribution_enable: v })
                  }
                />
              </div>

              {form.invite.commission_distribution_enable && (
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>L1 (%)</Label>
                    <Input
                      type="number"
                      value={form.invite.commission_distribution_l1 ?? ''}
                      onChange={(e) =>
                        updateSection('invite', {
                          commission_distribution_l1:
                            e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>L2 (%)</Label>
                    <Input
                      type="number"
                      value={form.invite.commission_distribution_l2 ?? ''}
                      onChange={(e) =>
                        updateSection('invite', {
                          commission_distribution_l2:
                            e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>L3 (%)</Label>
                    <Input
                      type="number"
                      value={form.invite.commission_distribution_l3 ?? ''}
                      onChange={(e) =>
                        updateSection('invite', {
                          commission_distribution_l3:
                            e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>
              )}
            </SectionCard>
          )}

          {activeSection === 'frontend' && (
            <SectionCard
              title={t('config.tabs.frontend')}
              saving={saveMutation.isPending}
              onSave={handleSaveFrontend}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{t('config.frontend.theme')}</Label>
                  <Select
                    value={form.frontend.frontend_theme ?? 'Xboard'}
                    onValueChange={(v) => updateSection('frontend', { frontend_theme: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(themesQuery.data?.themes ?? { Xboard: {} }).map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t('config.frontend.color')}</Label>
                  <Select
                    value={form.frontend.frontend_theme_color ?? 'default'}
                    onValueChange={(v) =>
                      updateSection('frontend', {
                        frontend_theme_color: v as ConfigMappings['frontend']['frontend_theme_color'],
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">default</SelectItem>
                      <SelectItem value="darkblue">darkblue</SelectItem>
                      <SelectItem value="black">black</SelectItem>
                      <SelectItem value="green">green</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t('config.frontend.sidebar')}</Label>
                  <Select
                    value={form.frontend.frontend_theme_sidebar ?? 'light'}
                    onValueChange={(v) =>
                      updateSection('frontend', {
                        frontend_theme_sidebar: v as 'light' | 'dark',
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">light</SelectItem>
                      <SelectItem value="dark">dark</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t('config.frontend.header')}</Label>
                  <Select
                    value={form.frontend.frontend_theme_header ?? 'dark'}
                    onValueChange={(v) =>
                      updateSection('frontend', {
                        frontend_theme_header: v as 'light' | 'dark',
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">light</SelectItem>
                      <SelectItem value="dark">dark</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t('config.frontend.backgroundUrl')}</Label>
                <Input
                  placeholder="https://..."
                  value={form.frontend.frontend_background_url ?? ''}
                  onChange={(e) =>
                    updateSection('frontend', { frontend_background_url: e.target.value })
                  }
                />
              </div>
            </SectionCard>
          )}

          {activeSection === 'server' && (
            <SectionCard
              title={t('config.tabs.server')}
              saving={saveMutation.isPending}
              onSave={handleSaveServer}
            >
              <div className="space-y-1.5">
                <Label>{t('config.server.token')}</Label>
                <div className="flex gap-2">
                  <Input
                    className="font-mono"
                    value={form.server.server_token ?? ''}
                    onChange={(e) => updateSection('server', { server_token: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => updateSection('server', { server_token: randomToken(32) })}
                  >
                    <RefreshCw className="h-4 w-4" />
                    {t('config.server.generate')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      if (!form.server.server_token) return;
                      void navigator.clipboard.writeText(form.server.server_token);
                      toast.success(t('common.copied'));
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>{t('config.server.pullInterval')}</Label>
                  <Input
                    type="number"
                    value={form.server.server_pull_interval ?? 60}
                    onChange={(e) =>
                      updateSection('server', { server_pull_interval: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('config.server.pushInterval')}</Label>
                  <Input
                    type="number"
                    value={form.server.server_push_interval ?? 60}
                    onChange={(e) =>
                      updateSection('server', { server_push_interval: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('config.server.deviceLimitMode')}</Label>
                  <Select
                    value={String(form.server.device_limit_mode ?? 0)}
                    onValueChange={(v) =>
                      updateSection('server', { device_limit_mode: Number(v) })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">{t('config.server.modeStrict')}</SelectItem>
                      <SelectItem value="1">{t('config.server.modeLoose')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <SwitchRow
                id="srv-ws-enable"
                label={t('config.server.wsEnable')}
                checked={Boolean(form.server.server_ws_enable)}
                onCheckedChange={(v) => updateSection('server', { server_ws_enable: v })}
              />

              <div className="space-y-1.5">
                <Label>{t('config.server.wsUrl')}</Label>
                <Input
                  placeholder="https://..."
                  value={form.server.server_ws_url ?? ''}
                  onChange={(e) => updateSection('server', { server_ws_url: e.target.value })}
                />
              </div>
            </SectionCard>
          )}

          {activeSection === 'email' && (
            <>
              <SectionCard
                title={t('config.tabs.email')}
                saving={saveMutation.isPending}
                onSave={() => saveMutation.mutate(form.email)}
                extraAction={
                  <Button
                    type="button"
                    variant="outline"
                    disabled={testMailMutation.isPending}
                    onClick={() => testMailMutation.mutate()}
                  >
                    {testMailMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    {t('config.testSend')}
                  </Button>
                }
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>{t('config.email.host')}</Label>
                    <Input
                      value={form.email.email_host ?? ''}
                      onChange={(e) => updateSection('email', { email_host: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('config.email.port')}</Label>
                    <Input
                      value={form.email.email_port ?? ''}
                      onChange={(e) => updateSection('email', { email_port: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('config.email.encryption')}</Label>
                    <Select
                      value={form.email.email_encryption || 'none'}
                      onValueChange={(v) =>
                        updateSection('email', { email_encryption: v === 'none' ? '' : v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="ssl">SSL</SelectItem>
                        <SelectItem value="tls">TLS</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('config.email.fromAddress')}</Label>
                    <Input
                      value={form.email.email_from_address ?? ''}
                      onChange={(e) =>
                        updateSection('email', { email_from_address: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('config.email.username')}</Label>
                    <Input
                      value={form.email.email_username ?? ''}
                      onChange={(e) =>
                        updateSection('email', { email_username: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('config.email.password')}</Label>
                    <Input
                      type="password"
                      value={form.email.email_password ?? ''}
                      onChange={(e) =>
                        updateSection('email', { email_password: e.target.value })
                      }
                    />
                  </div>
                </div>
                <SwitchRow
                  id="email-remind"
                  label={t('config.email.remindMail')}
                  checked={Boolean(form.email.remind_mail_enable)}
                  onCheckedChange={(v) => updateSection('email', { remind_mail_enable: v })}
                />
              </SectionCard>

              <MailTemplateSection />
            </>
          )}

          {activeSection === 'telegram' && (
            <SectionCard
              title={t('config.tabs.telegram')}
              saving={saveMutation.isPending}
              onSave={handleSaveTelegram}
              extraAction={
                <Button
                  type="button"
                  variant="outline"
                  disabled={webhookMutation.isPending}
                  onClick={() => webhookMutation.mutate()}
                >
                  {webhookMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Webhook className="h-4 w-4" />
                  )}
                  {t('config.telegram.setWebhook')}
                </Button>
              }
            >
              <SwitchRow
                id="tg-enable"
                label={t('config.telegram.enable')}
                checked={Boolean(form.telegram.telegram_bot_enable)}
                onCheckedChange={(v) =>
                  updateSection('telegram', { telegram_bot_enable: v })
                }
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{t('config.telegram.botToken')}</Label>
                  <Input
                    value={form.telegram.telegram_bot_token ?? ''}
                    onChange={(e) =>
                      updateSection('telegram', { telegram_bot_token: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('config.telegram.webhookUrl')}</Label>
                  <Input
                    placeholder="https://..."
                    value={form.telegram.telegram_webhook_url ?? ''}
                    onChange={(e) =>
                      updateSection('telegram', { telegram_webhook_url: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t('config.telegram.discussLink')}</Label>
                <Input
                  placeholder="https://t.me/..."
                  value={form.telegram.telegram_discuss_link ?? ''}
                  onChange={(e) =>
                    updateSection('telegram', { telegram_discuss_link: e.target.value })
                  }
                />
              </div>
            </SectionCard>
          )}

          {activeSection === 'app' && (
            <SectionCard
              title={t('config.tabs.app')}
              saving={saveMutation.isPending}
              onSave={() => saveMutation.mutate(form.app)}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Windows {t('config.app.version')}</Label>
                  <Input
                    value={form.app.windows_version ?? ''}
                    onChange={(e) => updateSection('app', { windows_version: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Windows {t('config.app.downloadUrl')}</Label>
                  <Input
                    value={form.app.windows_download_url ?? ''}
                    onChange={(e) =>
                      updateSection('app', { windows_download_url: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>macOS {t('config.app.version')}</Label>
                  <Input
                    value={form.app.macos_version ?? ''}
                    onChange={(e) => updateSection('app', { macos_version: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>macOS {t('config.app.downloadUrl')}</Label>
                  <Input
                    value={form.app.macos_download_url ?? ''}
                    onChange={(e) =>
                      updateSection('app', { macos_download_url: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Android {t('config.app.version')}</Label>
                  <Input
                    value={form.app.android_version ?? ''}
                    onChange={(e) => updateSection('app', { android_version: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Android {t('config.app.downloadUrl')}</Label>
                  <Input
                    value={form.app.android_download_url ?? ''}
                    onChange={(e) =>
                      updateSection('app', { android_download_url: e.target.value })
                    }
                  />
                </div>
              </div>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}
