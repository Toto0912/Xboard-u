export interface UserPanelSettings {
  base_url: string;
  title: string;
  description: string;
  version: string;
  logo: string;
  assets_path: string;
  background_url: string;
  theme_color: string;
}

declare global {
  interface Window {
    routerBase?: string;
    settings?: {
      title?: string;
      description?: string;
      version?: string;
      logo?: string;
      assets_path?: string;
      background_url?: string;
      theme?: {
        color?: string;
      };
      i18n?: string[];
    };
  }
}

export function getUserSettings(): UserPanelSettings {
  const s = window.settings ?? {};
  const routerBase = window.routerBase || '/';
  return {
    base_url: routerBase.endsWith('/') ? routerBase : `${routerBase}/`,
    title: s.title || 'XBoard',
    description: s.description || '',
    version: s.version || '',
    logo: s.logo || '',
    assets_path: s.assets_path || '/theme/Xboard/assets',
    background_url: s.background_url || '',
    theme_color: s.theme?.color || 'default',
  };
}
