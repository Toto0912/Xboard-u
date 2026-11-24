import { create } from 'zustand';
import { getUserSettings } from '@/lib/settings';

export type ThemeMode = 'light' | 'dark' | 'system';

const THEME_STORAGE_KEY = 'xboard_user_theme';

function getSystemDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

function resolveDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  return getSystemDark();
}

export function applyTheme(mode: ThemeMode): void {
  const isDark = resolveDark(mode);
  const root = document.documentElement;
  root.classList.toggle('dark', isDark);

  const { theme_color } = getUserSettings();
  if (theme_color && theme_color !== 'default') {
    root.setAttribute('data-accent', theme_color);
  } else {
    root.removeAttribute('data-accent');
  }
}

function getInitialTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
  } catch {
    // ignore
  }
  return 'light';
}

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggleLightDark: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: getInitialTheme(),
  setMode: (mode) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      // ignore
    }
    applyTheme(mode);
    set({ mode });
  },
  toggleLightDark: () => {
    const isDark = resolveDark(get().mode);
    get().setMode(isDark ? 'light' : 'dark');
  },
}));
