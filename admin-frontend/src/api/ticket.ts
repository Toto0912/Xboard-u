import { adminApiRequest } from '@/lib/api';

export const TICKET_STATUS_OPEN = 0;
export const TICKET_STATUS_CLOSED = 1;

export const TICKET_REPLY_PENDING = 0;
export const TICKET_REPLY_REPLIED = 1;

export interface TicketUserInfo {
  id: number;
  email: string;
  balance?: number;
  commission_balance?: number;
  plan_id?: number | null;
  transfer_enable?: number;
  u?: number;
  d?: number;
  expired_at?: number | null;
  banned?: number | boolean;
}

export interface TicketMessageItem {
  id: number;
  ticket_id: number;
  user_id: number;
  message: string;
  is_from_user: boolean;
  is_from_admin: boolean;
  created_at: number;
  updated_at: number;
}

export interface TicketRecord {
  id: number;
  user_id: number;
  subject: string;
  level: number;
  status: number;
  reply_status: number;
  last_reply_user_id?: number | null;
  created_at: number;
  updated_at: number;
  user?: TicketUserInfo | null;
  messages?: TicketMessageItem[];
}

export async function fetchTickets(payload: {
  current: number;
  pageSize: number;
  filter?: Array<{ id: string; value: unknown }>;
  sort?: Array<{ id: string; desc: boolean }>;
  email?: string;
}): Promise<{ data: TicketRecord[]; total: number }> {
  const res = await adminApiRequest<TicketRecord[]>('/ticket/fetch', {
    method: 'POST',
    body: payload,
  });
  return {
    data: res.data || [],
    total: res.total ?? 0,
  };
}

export async function fetchTicketDetail(id: number): Promise<TicketRecord> {
  const res = await adminApiRequest<TicketRecord>(`/ticket/fetch?id=${id}`);
  return res.data;
}

export async function replyTicket(payload: { id: number; message: string }): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/ticket/reply', {
    method: 'POST',
    body: payload,
  });
  return Boolean(res.data);
}

export async function closeTicket(id: number): Promise<boolean> {
  const res = await adminApiRequest<boolean>('/ticket/close', {
    method: 'POST',
    body: { id },
  });
  return Boolean(res.data);
}
