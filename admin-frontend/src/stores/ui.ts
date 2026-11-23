import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'system';

const THEME_KEY = 'xboard_admin_theme';
const SIDEBAR_KEY = 'xboard_admin_sidebar_collapsed';

function readTheme(): ThemeMode {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark' || saved === 'system') {
    return saved;
  }
  return 'system';
}

export function applyThemeToDocument(theme: ThemeMode): void {
  const root = document.documentElement;
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = theme === 'dark' || (theme === 'system' && prefersDark);
  root.classList.toggle('dark', isDark);
}

interface UiState {
  theme: ThemeMode;
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  searchOpen: boolean;
  setTheme: (theme: ThemeMode) => void;
  toggleSidebarCollapsed: () => void;
  setMobileSidebarOpen: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  theme: readTheme(),
  sidebarCollapsed: localStorage.getItem(SIDEBAR_KEY) === 'true',
  mobileSidebarOpen: false,
  searchOpen: false,
  setTheme: (theme) => {
    localStorage.setItem(THEME_KEY, theme);
    applyThemeToDocument(theme);
    set({ theme });
  },
  toggleSidebarCollapsed: () =>
    set((state) => {
      const next = !state.sidebarCollapsed;
      localStorage.setItem(SIDEBAR_KEY, String(next));
      return { sidebarCollapsed: next };
    }),
  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
  setSearchOpen: (open) => set({ searchOpen: open }),
}));
