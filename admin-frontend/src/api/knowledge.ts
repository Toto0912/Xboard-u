import { adminApiRequest } from '@/lib/api';

export const KNOWLEDGE_LANGUAGES = [
  { value: 'en-US', label: 'English' },
  { value: 'ja-JP', label: '日本語' },
  { value: 'ko-KR', label: '한국어' },
  { value: 'vi-VN', label: 'Tiếng Việt' },
  { value: 'zh-CN', label: '简体中文' },
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'ru-RU', label: 'Русский' },
  { value: 'fa-IR', label: 'فارسی' },
] as const;

export interface KnowledgeSummaryItem {
  id: number;
  title: string;
  category: string;
  show: boolean | number;
  updated_at: number;
}

export interface KnowledgeDetailItem extends KnowledgeSummaryItem {
  language: string;
  body: string;
  sort?: number | null;
  created_at?: number;
}

export async function fetchKnowledgeList(): Promise<KnowledgeSummaryItem[]> {
  const res = await adminApiRequest<KnowledgeSummaryItem[]>('/knowledge/fetch');
  return res.data || [];
}

export async function fetchKnowledgeDetail(id: number): Promise<KnowledgeDetailItem> {
  const res = await adminApiRequest<KnowledgeDetailItem>(`/knowledge/fetch?id=${id}`);
  return res.data;
}

export async function saveKnowledge(payload: {
  id?: number;
  title: string;
  category: string;
  language: string;
  body: string;
  show: boolean;
}): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/knowledge/save', {
    method: 'POST',
    body: payload,
  });
  return Boolean(res.data);
}

export async function toggleKnowledgeShow(id: number): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/knowledge/show', {
    method: 'POST',
    body: { id },
  });
  return Boolean(res.data);
}

export async function dropKnowledge(id: number): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/knowledge/drop', {
    method: 'POST',
    body: { id },
  });
  return Boolean(res.data);
}

export async function sortKnowledge(ids: number[]): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/knowledge/sort', {
    method: 'POST',
    body: { ids },
  });
  return Boolean(res.data);
}
