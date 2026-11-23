export interface PanelSettings {
  base_url: string;
  title: string;
  version: string;
  logo?: string;
  secure_path: string;
}

declare global {
  interface Window {
    settings?: Partial<PanelSettings>;
  }
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
    version: raw.version || 'dev',
    logo: raw.logo || undefined,
    secure_path: securePath.replace(/^\/+|\/+$/g, ''),
  };
}
