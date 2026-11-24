import { toast } from 'sonner';
import i18n from '@/i18n';
import { getUserSettings } from '@/lib/settings';
import { getStoredToken, removeStoredToken } from '@/lib/storage';

const AUTH_ALLOWLIST = new Set([
  '/passport/auth/login',
  '/passport/auth/register',
  '/passport/auth/forget',
  '/passport/auth/token2Login',
  '/passport/auth/loginWithMailLink',
  '/passport/comm/sendEmailVerify',
  '/passport/comm/pv',
  '/guest/comm/config',
  '/guest/plan/fetch',
]);

export class ApiError extends Error {
  status: number;
  code?: number;
  errors?: Record<string, string[]>;

  constructor(
    message: string,
    status: number,
    code?: number,
    errors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

export interface ApiResponse<T = unknown> {
  status?: string;
  message?: string;
  data: T;
  total?: number;
  pagination?: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
  error?: unknown;
  errors?: Record<string, string[]>;
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined | null>;
  silentError?: boolean;
}

function redirectToLogin(): void {
  removeStoredToken();
  const hash = window.location.hash.replace(/^#/, '') || '/';
  if (
    !hash.startsWith('/login') &&
    !hash.startsWith('/register') &&
    !hash.startsWith('/forget')
  ) {
    const redirect = encodeURIComponent(hash);
    window.location.hash = `#/login?redirect=${redirect}`;
  }
}

function buildUrl(path: string, params?: RequestOptions['params']): string {
  const { base_url } = getUserSettings();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const base = `${base_url}api/v1${normalizedPath}`;

  if (!params) return base;
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      search.set(k, String(v));
    }
  }
  const qs = search.toString();
  return qs ? `${base}?${qs}` : base;
}

function extractErrorMessage(payload: Record<string, unknown> | null, fallback: string): string {
  if (!payload) return fallback;
  if (payload.errors && typeof payload.errors === 'object') {
    const first = Object.values(payload.errors as Record<string, string[]>)
      .flat()
      .find(Boolean);
    if (first) return first;
  }
  if (typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message;
  }
  return fallback;
}

export async function rawApiRequest<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, params, headers: customHeaders, silentError, ...rest } = options;
  const cleanPath = path.split('?')[0];
  const requiresAuth = !AUTH_ALLOWLIST.has(cleanPath);
  const token = getStoredToken();

  if (requiresAuth && !token) {
    redirectToLogin();
    throw new ApiError(i18n.t('http.notLoggedIn'), 401);
  }

  const headers = new Headers(customHeaders);
  headers.set('Accept', 'application/json');
  headers.set('Content-Language', localStorage.getItem('xboard_user_lang') || 'zh-CN');

  if (requiresAuth && token) {
    headers.set('Authorization', token);
  }

  let serializedBody: BodyInit | undefined;
  if (body instanceof FormData) {
    serializedBody = body;
  } else if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
    serializedBody = JSON.stringify(body);
  }

  const response = await fetch(buildUrl(path, params), {
    ...rest,
    cache: 'no-cache',
    headers,
    body: serializedBody,
  });

  let payload: Record<string, unknown> | null = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    payload = (await response.json()) as Record<string, unknown>;
  }

  if (!response.ok) {
    if (requiresAuth && (response.status === 401 || response.status === 403)) {
      redirectToLogin();
    }
    const msg = extractErrorMessage(
      payload,
      response.status === 401 || response.status === 403
        ? i18n.t('http.sessionExpired')
        : `${i18n.t('http.requestFailed')} (${response.status})`,
    );
    if (!silentError) {
      toast.error(msg);
    }
    throw new ApiError(
      msg,
      response.status,
      typeof payload?.code === 'number' ? payload.code : undefined,
      payload?.errors as Record<string, string[]> | undefined,
    );
  }

  if (payload && payload.status === 'fail') {
    const msg = extractErrorMessage(payload, i18n.t('http.operationFailed'));
    if (!silentError) {
      toast.error(msg);
    }
    throw new ApiError(msg, response.status);
  }

  return payload as T;
}

export async function apiRequest<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  return rawApiRequest<ApiResponse<T>>(path, options);
}
