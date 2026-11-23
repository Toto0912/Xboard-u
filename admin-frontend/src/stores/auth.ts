import { create } from 'zustand';
import { getStoredToken, removeStoredToken, setStoredToken } from '@/lib/storage';

interface AuthState {
  token: string | null;
  setToken: (token: string, remember?: boolean) => void;
  logout: () => void;
  syncFromStorage: () => void;
}

const SESSION_FALLBACK_TTL_SECONDS = 60 * 60 * 24;

export const useAuthStore = create<AuthState>((set) => ({
  token: getStoredToken(),
  setToken: (token, remember = true) => {
    setStoredToken(token, remember ? null : SESSION_FALLBACK_TTL_SECONDS);
    set({ token });
  },
  logout: () => {
    removeStoredToken();
    set({ token: null });
  },
  syncFromStorage: () => {
    set({ token: getStoredToken() });
  },
}));
