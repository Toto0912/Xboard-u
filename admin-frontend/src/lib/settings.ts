import { create } from 'zustand';

export interface PanelSettings {
  base_url: string;
  title: string;
  version: string;
  currency: string;
  currency_symbol: string;
  logo?: string;
  secure_path: string;
}

declare global {
  interface Window {
    settings?: Partial<PanelSettings>;
  }
}

const defaultCurrencySymbol = '¥';
export const useCurrencySymbol = create(() => window.settings?.currency_symbol || defaultCurrencySymbol);

export function setCurrencySymbol(symbol: string) {
  useCurrencySymbol.setState(symbol.trim() || defaultCurrencySymbol);
}

export function getPanelSettings(): PanelSettings {
  const raw = window.settings ?? {};
  const baseUrl = raw.base_url || '/';
  const securePath =
    raw.secure_path ||
    import.meta.env.VITE_ADMIN_SECURE_PATH ||
    'admin';

  return {
    base_url: baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`,
    title: raw.title || 'Xboard',
    currency: raw.currency || 'CNY',
    currency_symbol: useCurrencySymbol.getState(),
    version: raw.version || 'v2.4.2',
    logo: raw.logo || undefined,
    secure_path: securePath.replace(/^\/+|\/+$/g, ''),
  };
}
