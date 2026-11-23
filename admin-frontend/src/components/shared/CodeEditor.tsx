import { lazy, Suspense, useEffect, useState } from 'react';
import { Check, Copy, Wand2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  formatTemplate,
  validateTemplate,
  type TemplateToolKind,
} from '@/lib/templateTools';
import { useUiStore } from '@/stores/ui';

const MonacoEditorCore = lazy(() => import('@/components/shared/MonacoEditorCore'));

export type CodeLanguage = 'json' | 'yaml' | 'html' | 'conf' | 'text';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: CodeLanguage;
  height?: string;
  readOnly?: boolean;
  showJsonTools?: boolean;
  templateTools?: TemplateToolKind;
}

function useResolvedDark(): boolean {
  const theme = useUiStore((s) => s.theme);
  const [systemDark, setSystemDark] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false,
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return theme === 'dark' || (theme === 'system' && systemDark);
}

export function CodeEditor({
  value,
  onChange,
  language = 'text',
  height = '380px',
  readOnly = false,
  showJsonTools = false,
  templateTools,
}: CodeEditorProps) {
  const { t } = useTranslation();
  const isDark = useResolvedDark();

  const effectiveTools: TemplateToolKind | undefined =
    templateTools ?? (showJsonTools && language === 'json' ? 'json' : undefined);

  const validateLabel =
    effectiveTools === 'json'
      ? t('common.validateJson')
      : effectiveTools === 'yaml'
        ? t('common.validateYaml')
        : t('common.validateConf');

  const validSuccessMessage =
    effectiveTools === 'json'
      ? t('common.jsonValid')
      : effectiveTools === 'yaml'
        ? t('common.yamlValid')
        : t('common.confValid');

  const handleValidate = () => {
    if (!effectiveTools) return;
    const res = validateTemplate(effectiveTools, value);
    if (res.ok) {
      toast.success(validSuccessMessage);
    } else {
      toast.error(res.message);
    }
  };

  const handleFormat = () => {
    if (!effectiveTools) return;
    try {
      const next = formatTemplate(effectiveTools, value);
      onChange(next);
      toast.success(t('common.formatted'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.jsonInvalid'));
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t('common.copied'));
    } catch {
      toast.error(t('common.copyFailed'));
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      {effectiveTools && (
        <div className="flex items-center justify-end gap-1.5 border-b bg-muted/40 px-3 py-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={handleValidate}
          >
            <Check className="h-3.5 w-3.5" />
            {validateLabel}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={handleFormat}
          >
            <Wand2 className="h-3.5 w-3.5" />
            {t('common.formatJson')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => void handleCopy()}
          >
            <Copy className="h-3.5 w-3.5" />
            {t('common.copy')}
          </Button>
        </div>
      )}
      <Suspense fallback={<Skeleton style={{ height }} className="w-full rounded-none" />}>
        <MonacoEditorCore
          value={value}
          onChange={onChange}
          language={language}
          height={height}
          readOnly={readOnly}
          isDark={isDark}
        />
      </Suspense>
    </div>
  );
}
