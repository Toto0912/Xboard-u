import { apiRequest } from '@/lib/api';

export interface NoticeItem {
  id: number;
  title: string;
  content: string;
  img_url?: string | null;
  tags?: string[] | null;
  created_at: number;
  updated_at: number;
}

export async function fetchNotices(current = 1): Promise<{ data: NoticeItem[]; total: number }> {
  const res = await apiRequest<NoticeItem[]>('/user/notice/fetch', {
    params: { current },
  });
  return {
    data: res.data ?? [],
    total: res.total ?? 0,
  };
}
