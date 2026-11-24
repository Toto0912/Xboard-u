import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Check,
  Languages,
  LogOut,
  Menu,
  Monitor,
  Moon,
  PanelLeft,
  Search,
  Sun,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { FLAT_NAV_ITEMS } from '@/config/navigation';
import { changeAppLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/i18n';
import { apiRequest } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useUiStore, type ThemeMode } from '@/stores/ui';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function Header() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const token = useAuthStore((s) => s.token);
  const logout = useAuthStore((s) => s.logout);
  const { theme, setTheme, toggleSidebarCollapsed, setMobileSidebarOpen, setSearchOpen } =
    useUiStore();

  const accountQuery = useQuery({
    queryKey: ['admin-account-info', token],
    queryFn: async () => {
      const res = await apiRequest<{ email?: string }>('/user/info', { silentError: true });
      return res.data;
    },
    enabled: Boolean(token),
    staleTime: 5 * 60 * 1000,
  });

  const currentItem = FLAT_NAV_ITEMS.find((item) => item.href === location.pathname);

  const handleLogout = () => {
    logout();
    queryClient.clear();
    toast.success(t('common.signedOut'));
    void navigate('/sign-in', { replace: true });
  };

  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  const themeOptions: Array<{ value: ThemeMode; labelKey: string; icon: typeof Sun }> = [
    { value: 'light', labelKey: 'theme.light', icon: Sun },
    { value: 'dark', labelKey: 'theme.dark', icon: Moon },
    { value: 'system', labelKey: 'theme.system', icon: Monitor },
  ];

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="flex items-center gap-2.5 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => setMobileSidebarOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="hidden lg:inline-flex"
          onClick={toggleSidebarCollapsed}
          aria-label="Toggle sidebar"
        >
          <PanelLeft className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-1.5 text-sm truncate">
          {currentItem?.groupTitleKey && (
            <>
              <span className="hidden text-muted-foreground sm:inline">
                {t(currentItem.groupTitleKey)}
              </span>
              <span className="hidden text-muted-foreground sm:inline">/</span>
            </>
          )}
          <span className="font-medium truncate">
            {currentItem ? t(currentItem.titleKey) : t('common.appName')}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-2 px-2.5 text-xs text-muted-foreground"
          onClick={() => setSearchOpen(true)}
        >
          <Search className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t('search.shortcutLabel')}</span>
          <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] sm:inline">
            {t('search.shortcutKey')}
          </kbd>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t('language.label')}>
              <Languages className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {SUPPORTED_LANGUAGES.map((lang: SupportedLanguage) => (
              <DropdownMenuItem
                key={lang}
                onClick={() => void changeAppLanguage(lang)}
                className="justify-between"
              >
                <span>{t(`language.${lang}`)}</span>
                {i18n.language === lang && <Check className="h-3.5 w-3.5" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t('theme.label')}>
              <ThemeIcon className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {themeOptions.map((opt) => {
              const Icon = opt.icon;
              return (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => setTheme(opt.value)}
                  className="justify-between"
                >
                  <span className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5" />
                    {t(opt.labelKey)}
                  </span>
                  {theme === opt.value && <Check className="h-3.5 w-3.5" />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Account">
              <User className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <div
              className="max-w-[240px] truncate px-2.5 py-1.5 text-xs font-medium text-foreground"
              title={accountQuery.data?.email || undefined}
            >
              {accountQuery.data?.email || '—'}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
              <LogOut className="h-3.5 w-3.5" />
              <span>{t('common.signOut')}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
