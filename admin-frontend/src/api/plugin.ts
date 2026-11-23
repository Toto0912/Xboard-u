import type { DynamicFieldSchema } from '@/components/shared/DynamicConfigFields';
import { adminApiRequest } from '@/lib/api';

export interface PluginTypeInfo {
  value: string;
  label: string;
  description: string;
  icon: string;
}

export interface PluginItem {
  code: string;
  name: string;
  version: string;
  description: string;
  author: string;
  type: string;
  is_installed: boolean;
  is_enabled: boolean;
  is_protected: boolean;
  can_be_deleted: boolean;
  config: Record<string, DynamicFieldSchema> | unknown[];
  readme: string;
  need_upgrade: boolean;
}

export async function getPluginTypes(): Promise<PluginTypeInfo[]> {
  const res = await adminApiRequest<PluginTypeInfo[]>('/plugin/types');
  return res.data || [];
}

export async function getPlugins(type?: string): Promise<PluginItem[]> {
  const res = await adminApiRequest<PluginItem[]>('/plugin/getPlugins', {
    params: type && type !== 'all' ? { type } : undefined,
  });
  return res.data || [];
}

export async function installPlugin(code: string): Promise<void> {
  await adminApiRequest('/plugin/install', { method: 'POST', body: { code } });
}

export async function uninstallPlugin(code: string): Promise<void> {
  await adminApiRequest('/plugin/uninstall', { method: 'POST', body: { code } });
}

export async function enablePlugin(code: string): Promise<void> {
  await adminApiRequest('/plugin/enable', { method: 'POST', body: { code } });
}

export async function disablePlugin(code: string): Promise<void> {
  await adminApiRequest('/plugin/disable', { method: 'POST', body: { code } });
}

export async function upgradePlugin(code: string): Promise<void> {
  await adminApiRequest('/plugin/upgrade', { method: 'POST', body: { code } });
}

export async function deletePlugin(code: string): Promise<void> {
  await adminApiRequest('/plugin/delete', { method: 'POST', body: { code } });
}

export async function getPluginConfig(
  code: string,
): Promise<Record<string, DynamicFieldSchema>> {
  const res = await adminApiRequest<Record<string, DynamicFieldSchema>>('/plugin/config', {
    params: { code },
  });
  return res.data || {};
}

export async function updatePluginConfig(
  code: string,
  config: Record<string, unknown>,
): Promise<void> {
  await adminApiRequest('/plugin/config', {
    method: 'POST',
    body: { code, config },
  });
}

export async function uploadPlugin(file: File): Promise<void> {
  const form = new FormData();
  form.append('file', file);
  await adminApiRequest('/plugin/upload', {
    method: 'POST',
    body: form,
  });
}
