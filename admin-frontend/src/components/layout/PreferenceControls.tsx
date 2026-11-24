import { useTranslation } from 'react-i18next';
import { Check, Languages, Monitor, Moon, Sun } from 'lucide-react';
import { changeAppLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/i18n';
import { useUiStore, type ThemeMode } from '@/stores/ui';
import { Button, type ButtonProps } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** Shared language and theme preference dropdown triggers for header and auth pages. */
export function PreferenceControls({
  buttonVariant = 'ghost',
}: {
  buttonVariant?: ButtonProps['variant'];
}) {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useUiStore();

  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  const themeOptions: Array<{ value: ThemeMode; labelKey: string; icon: typeof Sun }> = [
    { value: 'light', labelKey: 'theme.light', icon: Sun },
    { value: 'dark', labelKey: 'theme.dark', icon: Moon },
    { value: 'system', labelKey: 'theme.system', icon: Monitor },
  ];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={buttonVariant}
            size="icon"
            aria-label={t('language.label')}
            title={t('language.label')}
          >
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
          <Button
            variant={buttonVariant}
            size="icon"
            aria-label={t('theme.label')}
            title={t('theme.label')}
          >
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
    </>
  );
}
