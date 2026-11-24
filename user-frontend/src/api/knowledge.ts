import { apiRequest } from '@/lib/api';

export interface KnowledgeItem {
  id: number;
  category: string;
  title: string;
  body?: string;
  updated_at: number;
}

export async function fetchKnowledgeList(params: {
  language?: string;
  keyword?: string;
}): Promise<Record<string, KnowledgeItem[]>> {
  const res = await apiRequest<Record<string, KnowledgeItem[]>>('/user/knowledge/fetch', {
    params,
  });
  return res.data ?? {};
}

export async function fetchKnowledgeDetail(id: number): Promise<KnowledgeItem> {
  const res = await apiRequest<KnowledgeItem>('/user/knowledge/fetch', {
    params: { id },
  });
  return res.data;
}
