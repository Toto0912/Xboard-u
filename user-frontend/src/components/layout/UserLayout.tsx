import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  BookOpen,
  Check,
  ChevronDown,
  CreditCard,
  Globe,
  LayoutDashboard,
  LogOut,
  Maximize2,
  Menu,
  MessageSquare,
  Minimize2,
  Moon,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  ShoppingBag,
  Sun,
  User,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { fetchUserInfo } from '@/api/user';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { changeLanguage, SUPPORTED_LANGUAGES } from '@/i18n';
import { getUserSettings } from '@/lib/settings';
import { removeStoredToken } from '@/lib/storage';
import { cn } from '@/lib/utils';
import { useThemeStore } from '@/stores/useThemeStore';
import { useUiStore } from '@/stores/useUiStore';

interface NavGroup {
  labelKey?: string;
  items: Array<{
    to: string;
    labelKey: string;
    icon: typeof LayoutDashboard;
  }>;
}

const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { to: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
      { to: '/knowledge', labelKey: 'nav.knowledge', icon: BookOpen },
    ],
  },
  {
    labelKey: 'nav.groupFinance',
    items: [
      { to: '/order', labelKey: 'nav.order', icon: CreditCard },
      { to: '/invite', labelKey: 'nav.invite', icon: Users },
    ],
  },
  {
    labelKey: 'nav.groupSubscribe',
    items: [
      { to: '/plan', labelKey: 'nav.plan', icon: ShoppingBag },
      { to: '/node', labelKey: 'nav.node', icon: Network },
    ],
  },
  {
    labelKey: 'nav.groupUser',
    items: [
      { to: '/profile', labelKey: 'nav.profile', icon: User },
      { to: '/ticket', labelKey: 'nav.ticket', icon: MessageSquare },
      { to: '/traffic', labelKey: 'nav.traffic', icon: Activity },
    ],
  },
];

function getPageTitleKey(pathname: string): string {
  if (pathname.startsWith('/knowledge')) return 'nav.knowledge';
  if (pathname.startsWith('/order')) return 'nav.order';
  if (pathname.startsWith('/invite')) return 'nav.invite';
  if (pathname.startsWith('/plan')) return 'nav.plan';
  if (pathname.startsWith('/node')) return 'nav.node';
  if (pathname.startsWith('/profile')) return 'nav.profile';
  if (pathname.startsWith('/ticket')) return 'nav.ticket';
  if (pathname.startsWith('/traffic')) return 'nav.traffic';
  return 'nav.dashboard';
}

export function UserLayout() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { title, logo } = getUserSettings();
  const { mode, toggleLightDark } = useThemeStore();
  const { sidebarCollapsed, mobileMenuOpen, toggleSidebar, setMobileMenuOpen } = useUiStore();
  const [isFullscreen, setIsFullscreen] = useState(false);

  const userQuery = useQuery({
    queryKey: ['user-info'],
    queryFn: fetchUserInfo,
  });

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname, setMobileMenuOpen]);

  useEffect(() => {
    const titleKey = getPageTitleKey(location.pathname);
    document.title = `${t(titleKey)} | ${title}`;
  }, [location.pathname, t, title]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      void document.exitFullscreen?.().catch(() => {});
    }
  };

  const handleLogout = () => {
    removeStoredToken();
    queryClient.clear();
    navigate('/login', { replace: true });
  };

  const isDark =
    mode === 'dark' ||
    (mode === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);

  const renderNav = (collapsed = false) => (
    <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
      {NAV_GROUPS.map((group, idx) => (
        <div key={idx} className="space-y-1">
          {group.labelKey && !collapsed && (
            <div className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {t(group.labelKey)}
            </div>
          )}
          {group.items.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    collapsed && 'justify-center px-2',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'text-[var(--sidebar-foreground)]/80 hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)]',
                  )
                }
                title={collapsed ? t(item.labelKey) : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{t(item.labelKey)}</span>}
              </NavLink>
            );
          })}
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'hidden shrink-0 flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar)] text-[var(--sidebar-foreground)] transition-all duration-200 lg:flex',
          sidebarCollapsed ? 'w-16' : 'w-60',
        )}
      >
        <div
          className={cn(
            'flex h-14 items-center border-b border-[var(--sidebar-border)] px-4',
            sidebarCollapsed ? 'justify-center px-2' : 'gap-2.5',
          )}
        >
          <Link to="/dashboard" className="flex min-w-0 items-center gap-2.5">
            {logo ? (
              <img src={logo} alt={title} className="h-7 w-7 shrink-0 rounded-md object-contain" />
            ) : (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
                {title.slice(0, 1).toUpperCase()}
              </div>
            )}
            {!sidebarCollapsed && (
              <span className="truncate text-base font-semibold tracking-tight">{title}</span>
            )}
          </Link>
        </div>
        {renderNav(sidebarCollapsed)}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-[1px]"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-10 flex h-full w-64 flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar)] text-[var(--sidebar-foreground)] shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-[var(--sidebar-border)] px-4">
              <Link to="/dashboard" className="flex min-w-0 items-center gap-2.5">
                {logo ? (
                  <img
                    src={logo}
                    alt={title}
                    className="h-7 w-7 shrink-0 rounded-md object-contain"
                  />
                ) : (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
                    {title.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <span className="truncate text-base font-semibold tracking-tight">{title}</span>
              </Link>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setMobileMenuOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {renderNav(false)}
          </aside>
        </div>
      )}

      {/* Main Column */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-card/80 px-3 backdrop-blur-sm sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 lg:hidden"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="hidden h-8 w-8 lg:inline-flex"
              onClick={toggleSidebar}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </Button>
            <span className="truncate text-sm font-medium text-foreground">
              {t(getPageTitleKey(location.pathname))}
            </span>
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={toggleLightDark}
              title={isDark ? t('common.lightMode') : t('common.darkMode')}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8">
                  <Globe className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {SUPPORTED_LANGUAGES.map((lang) => {
                  const active = i18n.language === lang.code;
                  return (
                    <DropdownMenuItem
                      key={lang.code}
                      onClick={() => changeLanguage(lang.code)}
                      className={cn('justify-between', active && 'bg-accent font-medium')}
                    >
                      <span>{lang.label}</span>
                      {active && <Check className="h-3.5 w-3.5 text-primary" />}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="hidden h-8 w-8 sm:inline-flex"
              onClick={handleToggleFullscreen}
              title={t('common.fullscreen')}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="ml-1 h-8 max-w-[160px] gap-1.5 px-2.5 text-xs sm:max-w-[220px]"
                >
                  <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{userQuery.data?.email || '...'}</span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => navigate('/profile')}>
                  <User className="h-4 w-4" />
                  {t('nav.profile')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                  <LogOut className="h-4 w-4" />
                  {t('nav.logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto bg-muted/20 p-4 md:p-6">
          <div className="mx-auto min-w-0 max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
