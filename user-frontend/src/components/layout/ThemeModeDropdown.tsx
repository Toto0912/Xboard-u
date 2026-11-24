import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useThemeStore, type ThemeMode } from '@/stores/useThemeStore';

interface ThemeModeDropdownProps {
  variant?: 'ghost' | 'outline';
  className?: string;
}

const THEME_OPTIONS: Array<{ value: ThemeMode; labelKey: string; icon: typeof Sun }> = [
  { value: 'light', labelKey: 'common.lightMode', icon: Sun },
  { value: 'dark', labelKey: 'common.darkMode', icon: Moon },
  { value: 'system', labelKey: 'common.systemMode', icon: Monitor },
];

/** Three-option theme mode switcher (Light / Dark / System) shared by UserLayout and AuthShell. */
export function ThemeModeDropdown({ variant = 'ghost', className }: ThemeModeDropdownProps) {
  const { t } = useTranslation();
  const { mode, setMode } = useThemeStore();

  const TriggerIcon = mode === 'dark' ? Moon : mode === 'light' ? Sun : Monitor;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size="icon"
          className={cn('h-8 w-8', className)}
          aria-label={t('common.themeLabel')}
          title={t('common.themeLabel')}
        >
          <TriggerIcon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {THEME_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = mode === opt.value;
          return (
            <DropdownMenuItem
              key={opt.value}
              onClick={() => setMode(opt.value)}
              className={cn('justify-between', active && 'bg-accent font-medium')}
            >
              <span className="flex items-center gap-2">
                <Icon className="h-3.5 w-3.5" />
                {t(opt.labelKey)}
              </span>
              {active && <Check className="h-3.5 w-3.5 text-primary" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
