import { adminApiRequest } from '@/lib/api';

export interface ConfigMappings {
  site: {
    logo: string | null;
    force_https: number;
    stop_register: number;
    app_name: string;
    app_description: string;
    app_url: string | null;
    subscribe_url: string | null;
    try_out_plan_id: number;
    try_out_hour: number;
    tos_url: string | null;
    currency: string;
    currency_symbol: string;
    ticket_must_wait_reply: boolean;
  };
  safe: {
    email_verify: boolean;
    safe_mode_enable: boolean;
    secure_path: string;
    email_whitelist_enable: boolean;
    email_whitelist_suffix: string[];
    email_gmail_limit_enable: boolean;
    captcha_enable: boolean;
    captcha_type: 'recaptcha' | 'turnstile' | 'recaptcha-v3';
    recaptcha_key: string;
    recaptcha_site_key: string;
    recaptcha_v3_secret_key: string;
    recaptcha_v3_site_key: string;
    recaptcha_v3_score_threshold: number;
    turnstile_secret_key: string;
    turnstile_site_key: string;
    register_limit_by_ip_enable: boolean;
    register_limit_count: number;
    register_limit_expire: number;
    password_limit_enable: boolean;
    password_limit_count: number;
    password_limit_expire: number;
  };
  subscribe: {
    plan_change_enable: boolean;
    reset_traffic_method: number;
    surplus_enable: boolean;
    new_order_event_id: number;
    renew_order_event_id: number;
    change_order_event_id: number;
    show_info_to_server_enable: boolean;
    show_protocol_to_server_enable: boolean;
    default_remind_expire: boolean;
    default_remind_traffic: boolean;
    subscribe_path: string;
  };
  subscribe_template: {
    subscribe_template_singbox: string;
    subscribe_template_clash: string;
    subscribe_template_clashmeta: string;
    subscribe_template_stash: string;
    subscribe_template_surge: string;
    subscribe_template_surfboard: string;
  };
  invite: {
    invite_force: boolean;
    invite_commission: number;
    invite_gen_limit: number;
    invite_never_expire: boolean;
    commission_first_time_enable: boolean;
    commission_auto_check_enable: boolean;
    commission_withdraw_limit: number;
    commission_withdraw_method: string[];
    withdraw_close_enable: boolean;
    commission_distribution_enable: boolean;
    commission_distribution_l1: number | null;
    commission_distribution_l2: number | null;
    commission_distribution_l3: number | null;
  };
  frontend: {
    frontend_theme: string;
    frontend_theme_sidebar: 'light' | 'dark';
    frontend_theme_header: 'light' | 'dark';
    frontend_theme_color: 'default' | 'darkblue' | 'black' | 'green';
    frontend_background_url: string | null;
  };
  server: {
    server_token: string | null;
    server_pull_interval: number;
    server_push_interval: number;
    device_limit_mode: number;
    server_ws_enable: boolean;
    server_ws_url: string;
  };
  email: {
    email_host: string | null;
    email_port: string | number | null;
    email_username: string | null;
    email_password: string | null;
    email_encryption: string | null;
    email_from_address: string | null;
    remind_mail_enable: boolean;
  };
  telegram: {
    telegram_bot_enable: boolean;
    telegram_bot_token: string | null;
    telegram_webhook_url: string | null;
    telegram_discuss_link: string | null;
  };
  app: {
    windows_version: string;
    windows_download_url: string;
    macos_version: string;
    macos_download_url: string;
    android_version: string;
    android_download_url: string;
  };
}

export interface PlanLite {
  id: number;
  name: string;
}

export interface MailTemplateSummary {
  name: string;
  label: string;
  customized: boolean;
  subject: string | null;
  updated_at: number | null;
}

export interface MailTemplateDetail {
  name: string;
  label: string;
  required_vars: string[];
  optional_vars: string[];
  customized: boolean;
  subject: string;
  content: string;
}

export async function fetchConfig(): Promise<ConfigMappings> {
  const res = await adminApiRequest<ConfigMappings>('/config/fetch');
  return res.data;
}

export async function saveConfig(payload: Record<string, unknown>): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/config/save', {
    method: 'POST',
    body: payload,
  });
  return res.data;
}

export async function testSendMail(): Promise<unknown> {
  const res = await adminApiRequest('/config/testSendMail', {
    method: 'POST',
  });
  return res.data;
}

export async function setTelegramWebhook(telegram_bot_token?: string): Promise<{
  success: boolean;
  webhook_url: string;
}> {
  const res = await adminApiRequest<{ success: boolean; webhook_url: string }>(
    '/config/setTelegramWebhook',
    {
      method: 'POST',
      body: telegram_bot_token ? { telegram_bot_token } : {},
    },
  );
  return res.data;
}

export async function fetchPlansLite(): Promise<PlanLite[]> {
  const res = await adminApiRequest<PlanLite[]>('/plan/fetch');
  return Array.isArray(res.data) ? res.data : [];
}

export async function listMailTemplates(): Promise<MailTemplateSummary[]> {
  const res = await adminApiRequest<MailTemplateSummary[]>('/mail/template/list');
  return res.data;
}

export async function getMailTemplate(name: string): Promise<MailTemplateDetail> {
  const res = await adminApiRequest<MailTemplateDetail>('/mail/template/get', {
    params: { name },
  });
  return res.data;
}

export async function saveMailTemplate(payload: {
  name: string;
  subject: string;
  content: string;
}): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/mail/template/save', {
    method: 'POST',
    body: payload,
  });
  return res.data;
}

export async function resetMailTemplate(name: string): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/mail/template/reset', {
    method: 'POST',
    body: { name },
  });
  return res.data;
}

export async function testMailTemplate(payload: {
  name: string;
  email?: string;
}): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/mail/template/test', {
    method: 'POST',
    body: payload,
  });
  return res.data;
}
