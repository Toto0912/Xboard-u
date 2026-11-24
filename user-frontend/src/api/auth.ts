import { apiRequest } from '@/lib/api';

export interface AuthResponseData {
  token: string;
  auth_data: string;
  is_admin?: boolean | number;
}

export async function login(payload: {
  email: string;
  password: string;
}): Promise<AuthResponseData> {
  const res = await apiRequest<AuthResponseData>('/passport/auth/login', {
    method: 'POST',
    body: payload,
  });
  return res.data;
}

export async function register(
  payload: {
    email: string;
    password: string;
    email_code?: string;
    invite_code?: string;
  } & Record<string, string | undefined>,
): Promise<AuthResponseData> {
  const res = await apiRequest<AuthResponseData>('/passport/auth/register', {
    method: 'POST',
    body: payload,
  });
  return res.data;
}

export async function forgetPassword(
  payload: {
    email: string;
    email_code: string;
    password: string;
  } & Record<string, string | undefined>,
): Promise<boolean> {
  const res = await apiRequest<boolean>('/passport/auth/forget', {
    method: 'POST',
    body: payload,
  });
  return Boolean(res.data);
}

export async function sendEmailVerify(
  payload: { email: string } & Record<string, string | undefined>,
): Promise<boolean> {
  const res = await apiRequest<boolean>('/passport/comm/sendEmailVerify', {
    method: 'POST',
    body: payload,
  });
  return Boolean(res.data);
}

export async function token2Login(verify: string): Promise<AuthResponseData> {
  const res = await apiRequest<AuthResponseData>('/passport/auth/token2Login', {
    params: { verify },
    silentError: true,
  });
  return res.data;
}

export async function loginWithMailLink(payload: {
  email: string;
  redirect?: string;
}): Promise<boolean> {
  const res = await apiRequest<boolean>('/passport/auth/loginWithMailLink', {
    method: 'POST',
    body: payload,
  });
  return Boolean(res.data);
}

export async function trackInvitePv(inviteCode: string): Promise<void> {
  if (!inviteCode) return;
  await apiRequest('/passport/comm/pv', {
    method: 'POST',
    body: { invite_code: inviteCode },
    silentError: true,
  });
}
