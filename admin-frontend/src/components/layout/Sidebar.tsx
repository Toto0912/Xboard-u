import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useLocation } from 'react-router-dom';
import * as Collapsible from '@radix-ui/react-collapsible';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { ADMIN_NAVIGATION, isNavGroup, type NavGroupItem } from '@/config/navigation';
import { getPanelSettings } from '@/lib/settings';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const PROJECT_GITHUB_URL = 'https://github.com/Toto0912/Xboard-u';

function SidebarGroup({
  group,
  collapsed,
  onNavigate,
}: {
  group: NavGroupItem;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const hasActiveChild = group.children.some((c) => c.href === location.pathname);
  const [open, setOpen] = useState(true);
  const GroupIcon = group.icon;

  if (collapsed) {
    return (
      <div className="space-y-1 py-1">
        {group.children.map((child) => {
          const Icon = child.icon;
          const active = location.pathname === child.href;
          return (
            <Tooltip key={child.id} delayDuration={150}>
              <TooltipTrigger asChild>
                <NavLink
                  to={child.href}
                  onClick={onNavigate}
                  className={cn(
                    'mx-auto flex h-9 w-9 items-center justify-center rounded-md transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" />
                </NavLink>
              </TooltipTrigger>
              <TooltipContent side="right">{t(child.titleKey)}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    );
  }

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className="space-y-0.5">
      <Collapsible.Trigger
        className={cn(
          'flex w-full items-center justify-between rounded-md px-2.5 py-2 text-xs font-medium tracking-wide transition-colors cursor-pointer',
          hasActiveChild
            ? 'text-foreground'
            : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        )}
      >
        <span className="flex items-center gap-2.5">
          <GroupIcon className="h-4 w-4 shrink-0" />
          <span>{t(group.titleKey)}</span>
        </span>
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </Collapsible.Trigger>
      <Collapsible.Content className="space-y-0.5 pl-3">
        {group.children.map((child) => {
          const Icon = child.icon;
          return (
            <NavLink
              key={child.id}
              to={child.href}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground font-medium shadow-xs'
                    : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{t(child.titleKey)}</span>
            </NavLink>
          );
        })}
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

function SidebarContent({
  collapsed,
  onNavigate,
  showCloseButton,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
  showCloseButton?: boolean;
}) {
  const { t } = useTranslation();
  const { title, version, logo } = getPanelSettings();
  const displayVersion = version
    ? version.startsWith('v')
      ? version
      : `v${version}`
    : 'v2.4.2';
  const setMobileOpen = useUiStore((s) => s.setMobileSidebarOpen);

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div
        className={cn(
          'flex h-14 items-center border-b border-sidebar-border px-3',
          collapsed ? 'justify-center' : 'justify-between',
        )}
      >
        <NavLink to="/" onClick={onNavigate} className="flex items-center gap-2.5 overflow-hidden">
          {logo ? (
            <img src={logo} alt={title} className="h-7 w-7 rounded-md object-contain shrink-0" />
          ) : (
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
              {(title || 'X').slice(0, 1).toUpperCase()}
            </div>
          )}
          {!collapsed && <span className="truncate text-sm font-semibold tracking-tight">{title}</span>}
        </NavLink>
        {showCloseButton && (
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-md p-1 text-muted-foreground hover:bg-sidebar-accent cursor-pointer lg:hidden"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-1.5 overflow-y-auto px-2.5 py-3">
        {ADMIN_NAVIGATION.map((item) => {
          if (isNavGroup(item)) {
            return (
              <SidebarGroup
                key={item.id}
                group={item}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
            );
          }

          const Icon = item.icon;
          if (collapsed) {
            return (
              <Tooltip key={item.id} delayDuration={150}>
                <TooltipTrigger asChild>
                  <NavLink
                    to={item.href}
                    end
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'mx-auto flex h-9 w-9 items-center justify-center rounded-md transition-colors',
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                      )
                    }
                  >
                    <Icon className="h-4 w-4" />
                  </NavLink>
                </TooltipTrigger>
                <TooltipContent side="right">{t(item.titleKey)}</TooltipContent>
              </Tooltip>
            );
          }

          return (
            <NavLink
              key={item.id}
              to={item.href}
              end
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{t(item.titleKey)}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border px-3 py-2.5 text-xs text-muted-foreground">
        {collapsed ? (
          <Tooltip delayDuration={150}>
            <TooltipTrigger asChild>
              <a
                href={PROJECT_GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="block truncate text-center font-mono text-[10px] transition-colors hover:text-sidebar-foreground hover:underline"
              >
                {displayVersion}
              </a>
            </TooltipTrigger>
            <TooltipContent side="right">Xboard-u {displayVersion}</TooltipContent>
          </Tooltip>
        ) : (
          <div className="flex items-center justify-center gap-1.5">
            <a
              href={PROJECT_GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate font-medium transition-colors hover:text-sidebar-foreground hover:underline"
            >
              Xboard-u
            </a>
            <span className="shrink-0 font-mono text-[11px]">{displayVersion}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const mobileOpen = useUiStore((s) => s.mobileSidebarOpen);
  const setMobileOpen = useUiStore((s) => s.setMobileSidebarOpen);

  return (
    <>
      <aside
        className={cn(
          'hidden shrink-0 border-r border-sidebar-border transition-all duration-200 lg:block',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        <SidebarContent collapsed={collapsed} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-10 w-64 border-r border-sidebar-border bg-sidebar shadow-xl">
            <SidebarContent
              collapsed={false}
              showCloseButton
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      )}
    </>
  );
}
