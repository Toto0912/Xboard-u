import { adminApiRequest } from '@/lib/api';

export interface ThemeConfigField {
  label: string;
  placeholder?: string;
  field_name: string;
  field_type: 'select' | 'input' | 'textarea' | string;
  select_options?: Record<string, string>;
  default_value?: string;
}

export interface ThemeInfo {
  name: string;
  description?: string;
  version?: string;
  images?: string;
  configs?: ThemeConfigField[];
  can_delete: boolean;
  is_system: boolean;
}

export interface ThemesPayload {
  themes: Record<string, ThemeInfo>;
  active: string;
}

export async function getThemes(): Promise<ThemesPayload> {
  const res = await adminApiRequest<ThemesPayload>('/theme/getThemes');
  return res.data;
}

export async function getThemeConfig(name: string): Promise<Record<string, unknown>> {
  const res = await adminApiRequest<Record<string, unknown>>('/theme/getThemeConfig', {
    method: 'POST',
    body: { name },
  });
  return res.data || {};
}

export async function saveThemeConfig(
  name: string,
  config: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await adminApiRequest<Record<string, unknown>>('/theme/saveThemeConfig', {
    method: 'POST',
    body: { name, config },
  });
  return res.data || {};
}

export async function activateTheme(name: string): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/config/save', {
    method: 'POST',
    body: { frontend_theme: name },
  });
  return res.data;
}

export async function uploadTheme(file: File): Promise<boolean> {
  const form = new FormData();
  form.append('file', file);
  const res = await adminApiRequest<boolean>('/theme/upload', {
    method: 'POST',
    body: form,
  });
  return res.data;
}

export async function deleteTheme(name: string): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/theme/delete', {
    method: 'POST',
    body: { name },
  });
  return res.data;
}
