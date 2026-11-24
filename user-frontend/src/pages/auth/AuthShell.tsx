import { Check, Globe } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ThemeModeDropdown } from '@/components/layout/ThemeModeDropdown';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { changeLanguage, SUPPORTED_LANGUAGES } from '@/i18n';
import { getUserSettings } from '@/lib/settings';
import { cn } from '@/lib/utils';

export function AuthShell({
  heading,
  subheading,
  children,
}: {
  heading: string;
  subheading: string;
  children: ReactNode;
}) {
  const { i18n } = useTranslation();
  const { title, description, logo, background_url, version } = getUserSettings();

  return (
    <div
      className="relative flex min-h-screen w-full flex-col justify-between bg-background text-foreground"
      style={
        background_url
          ? {
              backgroundImage: `linear-gradient(to bottom, rgba(9, 15, 29, 0.55), rgba(9, 15, 29, 0.72)), url(${background_url})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }
          : undefined
      }
    >
      <div className="flex items-center justify-between px-4 py-4 sm:px-8">
        <div className="flex items-center gap-2.5">
          {logo ? (
            <img src={logo} alt={title} className="h-8 w-8 rounded-lg object-contain" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              {title.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <div className="text-sm font-semibold tracking-tight">{title}</div>
            {description && (
              <div className="hidden text-xs text-muted-foreground sm:block">{description}</div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <ThemeModeDropdown variant="outline" className="bg-card/80 backdrop-blur-xs" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 bg-card/80 px-2.5 text-xs backdrop-blur-xs"
              >
                <Globe className="h-3.5 w-3.5" />
                <span>
                  {SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language)?.label ?? '简体中文'}
                </span>
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
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-6">
        <div className="w-full max-w-md rounded-2xl border bg-card/95 p-6 shadow-lg backdrop-blur-md sm:p-8">
          <div className="mb-6 space-y-1.5 text-center">
            <h1 className="text-xl font-semibold tracking-tight">{heading}</h1>
            <p className="text-sm text-muted-foreground">{subheading}</p>
          </div>
          {children}
        </div>
      </div>

      <footer className="px-4 py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} {title}
        {version ? ` · ${version}` : ''}
      </footer>
    </div>
  );
}
