import { adminApiRequest } from '@/lib/api';

export interface NoticeRecord {
  id: number;
  title: string;
  content: string;
  show: boolean | number;
  img_url?: string | null;
  tags?: string[] | null;
  popup?: boolean | number | null;
  sort?: number | null;
  created_at: number;
  updated_at: number;
}

export async function fetchNotices(): Promise<NoticeRecord[]> {
  const res = await adminApiRequest<NoticeRecord[]>('/notice/fetch');
  return res.data || [];
}

export async function saveNotice(payload: {
  id?: number;
  title: string;
  content: string;
  img_url?: string | null;
  tags?: string[];
  show?: boolean;
}): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/notice/save', {
    method: 'POST',
    body: payload,
  });
  return Boolean(res.data);
}

export async function toggleNoticeShow(id: number): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/notice/show', {
    method: 'POST',
    body: { id },
  });
  return Boolean(res.data);
}

export async function dropNotice(id: number): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/notice/drop', {
    method: 'POST',
    body: { id },
  });
  return Boolean(res.data);
}

export async function sortNotices(ids: number[]): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/notice/sort', {
    method: 'POST',
    body: { ids },
  });
  return Boolean(res.data);
}
