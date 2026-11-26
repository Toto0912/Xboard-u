import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GuestConfig } from '@/api/guest';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
    grecaptcha?: {
      ready: (cb: () => void) => void;
      render: (el: HTMLElement, opts: Record<string, unknown>) => number;
      reset: (id?: number) => void;
      execute: (siteKey: string, opts: { action: string }) => Promise<string>;
    };
  }
}

export interface CaptchaHandle {
  getPayload: (action?: string) => Promise<Record<string, string>>;
  reset: () => void;
}

const scripts = new Map<string, Promise<void>>();

function loadScriptOnce(src: string, id: string): Promise<void> {
  const pending = scripts.get(src);
  if (pending) return pending;
  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      scripts.delete(src);
      reject(new Error('Captcha failed to load'));
    };
    document.head.appendChild(script);
  });
  scripts.set(src, promise);
  return promise;
}

export const CaptchaWidget = forwardRef<CaptchaHandle, { config?: GuestConfig }>(
  ({ config }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | number | null>(null);
    const [token, setToken] = useState('');

    const { t } = useTranslation();
    const [loadFailed, setLoadFailed] = useState(false);
    const [retry, setRetry] = useState(0);
    const enabled = Boolean(config?.is_captcha);
    const type = config?.captcha_type || 'recaptcha';

    useEffect(() => {
      if (!enabled) return;
      let cancelled = false;

      async function setup() {
        setLoadFailed(false);
        setToken('');
        if (type === 'turnstile' && config?.turnstile_site_key) {
          await loadScriptOnce(
            'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
            'xboard-turnstile-js',
          );
          if (cancelled || !containerRef.current || !window.turnstile) return;
          containerRef.current.innerHTML = '';
          widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey: config.turnstile_site_key,
            callback: (t: string) => setToken(t),
            'expired-callback': () => setToken(''),
          });
        } else if (type === 'recaptcha-v3' && config?.recaptcha_v3_site_key) {
          await loadScriptOnce(
            `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(config.recaptcha_v3_site_key)}`,
            'xboard-recaptcha-v3-js',
          );
        } else if (type === 'recaptcha' && config?.recaptcha_site_key) {
          await loadScriptOnce(
            'https://www.google.com/recaptcha/api.js?render=explicit',
            'xboard-recaptcha-v2-js',
          );
          if (cancelled || !containerRef.current || !window.grecaptcha) return;
          window.grecaptcha.ready(() => {
            if (cancelled || !containerRef.current || !window.grecaptcha) return;
            containerRef.current.innerHTML = '';
            widgetIdRef.current = window.grecaptcha.render(containerRef.current, {
              sitekey: config.recaptcha_site_key,
              callback: (t: string) => setToken(t),
              'expired-callback': () => setToken(''),
            });
          });
        }
      }

      void setup().catch(() => {
        if (!cancelled) setLoadFailed(true);
      });

      return () => {
        cancelled = true;
        if (type === 'turnstile' && widgetIdRef.current !== null && window.turnstile) {
          try {
            window.turnstile.remove(String(widgetIdRef.current));
          } catch {
            // ignore
          }
        }
        widgetIdRef.current = null;
      };
    }, [
      enabled,
      retry,
      type,
      config?.turnstile_site_key,
      config?.recaptcha_site_key,
      config?.recaptcha_v3_site_key,
    ]);

    useImperativeHandle(ref, () => ({
      getPayload: async (action = 'submit'): Promise<Record<string, string>> => {
        if (!enabled) return {};
        if (type === 'turnstile') {
          return token ? { turnstile_token: token } : {};
        }
        if (type === 'recaptcha-v3' && config?.recaptcha_v3_site_key && window.grecaptcha) {
          const v3Token = await new Promise<string>((resolve) => {
            window.grecaptcha?.ready(async () => {
              try {
                const t = await window.grecaptcha!.execute(config.recaptcha_v3_site_key!, {
                  action,
                });
                resolve(t);
              } catch {
                resolve('');
              }
            });
          });
          return v3Token ? { recaptcha_v3_token: v3Token } : {};
        }
        return token ? { recaptcha_data: token } : {};
      },
      reset: () => {
        setToken('');
        if (type === 'turnstile' && widgetIdRef.current !== null && window.turnstile) {
          window.turnstile.reset(String(widgetIdRef.current));
        } else if (type === 'recaptcha' && widgetIdRef.current !== null && window.grecaptcha) {
          window.grecaptcha.reset(Number(widgetIdRef.current));
        }
      },
    }));

    if (enabled && loadFailed) return <button type="button" className="text-sm underline" onClick={() => { setLoadFailed(false); setRetry((n) => n + 1); }}>{t('common.retry', { defaultValue: 'Retry' })}</button>;
    if (!enabled || type === 'recaptcha-v3') return null;

    return <div ref={containerRef} className="flex min-h-[65px] items-center justify-center" />;
  },
);
CaptchaWidget.displayName = 'CaptchaWidget';
