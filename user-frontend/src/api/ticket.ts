import { apiRequest } from '@/lib/api';

export interface TicketMessageItem {
  id: number;
  ticket_id: number;
  is_me: boolean;
  message: string;
  created_at: number;
  updated_at: number;
}

export interface TicketItem {
  id: number;
  level: number;
  reply_status: number;
  status: number;
  subject: string;
  message?: TicketMessageItem[] | null;
  created_at: number;
  updated_at: number;
}

export async function fetchTickets(): Promise<TicketItem[]> {
  const res = await apiRequest<TicketItem[]>('/user/ticket/fetch');
  return res.data ?? [];
}

export async function fetchTicketDetail(id: number | string): Promise<TicketItem> {
  const res = await apiRequest<TicketItem>('/user/ticket/fetch', {
    params: { id },
  });
  return res.data;
}

export async function createTicket(payload: {
  subject: string;
  level: number;
  message: string;
}): Promise<boolean> {
  const res = await apiRequest<boolean>('/user/ticket/save', {
    method: 'POST',
    body: payload,
  });
  return Boolean(res.data);
}

export async function replyTicket(payload: { id: number; message: string }): Promise<boolean> {
  const res = await apiRequest<boolean>('/user/ticket/reply', {
    method: 'POST',
    body: payload,
  });
  return Boolean(res.data);
}

export async function closeTicket(id: number): Promise<boolean> {
  const res = await apiRequest<boolean>('/user/ticket/close', {
    method: 'POST',
    body: { id },
  });
  return Boolean(res.data);
}

export async function submitWithdrawTicket(payload: {
  withdraw_method: string;
  withdraw_account: string;
}): Promise<boolean> {
  const res = await apiRequest<boolean>('/user/ticket/withdraw', {
    method: 'POST',
    body: payload,
  });
  return Boolean(res.data);
}
