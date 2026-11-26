import { toast } from 'sonner';
import i18n from '@/i18n';
import { getPanelSettings } from '@/lib/settings';
import { getStoredToken } from '@/lib/storage';
import { useAuthStore } from '@/stores/auth';

const AUTH_ALLOWLIST = new Set([
  '/passport/auth/login',
  '/passport/auth/token2Login',
  '/passport/auth/register',
  '/passport/auth/forget',
  '/passport/comm/sendEmailVerify',
  '/guest/comm/config',
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
  error?: unknown;
  errors?: Record<string, string[]>;
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined | null>;
  silentError?: boolean;
}

function redirectToSignIn(): void {
  useAuthStore.getState().logout();
  const hash = window.location.hash.replace(/^#/, '') || '/';
  if (!hash.startsWith('/sign-in')) {
    const redirect = encodeURIComponent(hash);
    window.location.replace(`#/sign-in?redirect=${redirect}`);
  }
}

function buildUrl(path: string, params?: RequestOptions['params']): string {
  const { base_url } = getPanelSettings();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const base = `${base_url}api/v2${normalizedPath}`;

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

export async function apiRequest<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const { body, params, headers: customHeaders, silentError, ...rest } = options;
  const cleanPath = path.split('?')[0];
  const requiresAuth = !AUTH_ALLOWLIST.has(cleanPath);
  const token = getStoredToken();

  if (requiresAuth && !token) {
    redirectToSignIn();
    throw new ApiError(i18n.t('http.notLoggedIn'), 401);
  }

  const headers = new Headers(customHeaders);
  headers.set('Accept', 'application/json');
  headers.set('Content-Language', localStorage.getItem('i18nextLng') || 'zh-CN');

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
    headers,
    body: serializedBody,
  });

  let payload: ApiResponse<T> | null = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    payload = (await response.json()) as ApiResponse<T>;
  }

  if (!response.ok) {
    if (requiresAuth && token === getStoredToken()
      && (response.status === 401 || (response.status === 403 && payload?.message === 'Unauthorized'))) {
      redirectToSignIn();
    }

    const firstValidationError = payload?.errors
      ? Object.values(payload.errors).flat()[0]
      : undefined;

    const fallbackMessages: Record<number, string> = {
      401: i18n.t('http.loginExpired'),
      403: i18n.t('http.noPermission'),
      404: i18n.t('http.notFound'),
    };

    const message =
      firstValidationError ||
      payload?.message ||
      fallbackMessages[response.status] ||
      i18n.t('http.unknownError');

    if (!silentError) {
      toast.error(message);
    }

    throw new ApiError(message, response.status, undefined, payload?.errors);
  }

  if (!payload) {
    throw new ApiError(i18n.t('http.unknownError'), response.status);
  }

  if (payload.status === 'fail') {
    const message = payload.message || i18n.t('http.unknownError');
    if (!silentError) {
      toast.error(message);
    }
    throw new ApiError(message, response.status, undefined, payload.errors);
  }

  return payload;
}

export function adminApiRequest<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const { secure_path } = getPanelSettings();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return apiRequest<T>(`/${secure_path}${normalized}`, options);
}

export async function adminApiDownload(
  path: string,
  options: RequestOptions & { fallbackFilename?: string } = {},
): Promise<void> {
  const { body, params, headers: customHeaders, silentError, fallbackFilename, ...rest } = options;
  const { secure_path } = getPanelSettings();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const token = getStoredToken();

  if (!token) {
    redirectToSignIn();
    throw new ApiError(i18n.t('http.notLoggedIn'), 401);
  }

  const headers = new Headers(customHeaders);
  headers.set('Authorization', token);
  headers.set('Content-Language', localStorage.getItem('i18nextLng') || 'zh-CN');

  let serializedBody: BodyInit | undefined;
  if (body instanceof FormData) {
    serializedBody = body;
  } else if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
    serializedBody = JSON.stringify(body);
  }

  const response = await fetch(buildUrl(`/${secure_path}${normalized}`, params), {
    ...rest,
    headers,
    body: serializedBody,
  });

  if (!response.ok) {
    let message = i18n.t('http.unknownError');
    try {
      const errJson = (await response.json()) as { message?: string; errors?: Record<string, string[]> };
      const firstErr = errJson?.errors ? Object.values(errJson.errors).flat()[0] : undefined;
      message = firstErr || errJson?.message || message;
      if (token === getStoredToken() && (response.status === 401 || (response.status === 403 && errJson?.message === 'Unauthorized'))) {
        redirectToSignIn();
      }
    } catch {
      // ignore non-json error body
    }
    if (!silentError) {
      toast.error(message);
    }
    throw new ApiError(message, response.status);
  }

  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  const match = /filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i.exec(disposition);
  const filename = match?.[1] ? decodeURIComponent(match[1]) : fallbackFilename || 'download.csv';

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
