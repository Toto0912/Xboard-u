import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LogOut,
  Menu,
  PanelLeft,
  Search,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { FLAT_NAV_ITEMS } from '@/config/navigation';
import { apiRequest } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import { PreferenceControls } from '@/components/layout/PreferenceControls';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function Header() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const token = useAuthStore((s) => s.token);
  const logout = useAuthStore((s) => s.logout);
  const { toggleSidebarCollapsed, setMobileSidebarOpen, setSearchOpen } = useUiStore();

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

        <PreferenceControls />

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
