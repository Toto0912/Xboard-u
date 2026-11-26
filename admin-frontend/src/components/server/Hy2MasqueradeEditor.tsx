import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import type { TargetKernel } from '@/api/serverNode';
import { CodeEditor } from '@/components/shared/CodeEditor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getHy2MasqueradeExample } from '@/lib/serverPresets';

interface Hy2MasqueradeEditorProps {
  kernel: TargetKernel;
  hy2Settings: Record<string, unknown>;
  hasBandwidth: boolean;
  onChange: (next: Record<string, unknown>) => void;
  onDraftInvalidChange: (invalid: boolean) => void;
}

export function Hy2MasqueradeEditor({
  kernel,
  hy2Settings,
  hasBandwidth,
  onChange,
  onDraftInvalidChange,
}: Hy2MasqueradeEditorProps) {
  const { t } = useTranslation();
  const masquerade = hy2Settings?.masquerade as Record<string, unknown> | undefined;

  const [exampleKind, setExampleKind] = useState<'proxy' | 'file' | 'string'>('proxy');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [draft, setDraft] = useState(() =>
    masquerade && Object.keys(masquerade).length > 0
      ? JSON.stringify(masquerade, null, 2)
      : '',
  );
  const [error, setError] = useState<string | null>(null);
  const lastInvalidRef = useRef(false);
  const invalidHandler = useRef(onDraftInvalidChange);
  invalidHandler.current = onDraftInvalidChange;
  useEffect(() => () => {
    if (lastInvalidRef.current) invalidHandler.current(false);
  }, []);

  const reportInvalid = (invalid: boolean) => {
    if (lastInvalidRef.current !== invalid) {
      lastInvalidRef.current = invalid;
      onDraftInvalidChange(invalid);
    }
  };

  useEffect(() => {
    const nextStr =
      masquerade && Object.keys(masquerade).length > 0
        ? JSON.stringify(masquerade, null, 2)
        : '';
    setDraft(nextStr);
    setError(null);
    reportInvalid(false);
  }, [kernel, masquerade]);

  const applyMasquerade = (val: Record<string, unknown> | undefined) => {
    const next: Record<string, unknown> = {
      ...(hy2Settings ?? {}),
      kernel,
      bandwidth_mode: 'auto',
    };
    if (val && Object.keys(val).length > 0) {
      next.masquerade = val;
    } else {
      delete next.masquerade;
    }
    onChange(next);
  };

  const handleChange = (text: string) => {
    setDraft(text);
    const trimmed = text.trim();
    if (!trimmed) {
      setError(null);
      reportInvalid(false);
      applyMasquerade(undefined);
      return;
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setError(t('serverNode.masqueradeObjectError'));
        reportInvalid(true);
        return;
      }
      setError(null);
      reportInvalid(false);
      applyMasquerade(parsed as Record<string, unknown>);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.jsonInvalid'));
      reportInvalid(true);
    }
  };

  const sample = getHy2MasqueradeExample(kernel, exampleKind);
  const docUrl =
    kernel === 'xray'
      ? 'https://xtls.github.io/config/transports/hysteria.html#masqobject'
      : 'https://sing-box.sagernet.org/configuration/inbound/hysteria2/#masqueradetype';

  const confirmExample = () => {
    setDraft(JSON.stringify(sample, null, 2));
    setError(null);
    reportInvalid(false);
    applyMasquerade(sample);
    setPreviewOpen(false);
  };

  const clearMasquerade = () => {
    setDraft('');
    setError(null);
    reportInvalid(false);
    applyMasquerade(undefined);
  };

  return (
    <section className="space-y-3 rounded-xl border bg-[var(--xb-panel)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-medium">{t('serverNode.hy2Masquerade')}</h4>
        <Badge variant="outline" className="font-mono text-[11px]">
          {kernel === 'xray' ? 'Xray' : 'Sing-box'}
        </Badge>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <p>{t('serverNode.hy2MasqueradeServerOnly')}</p>
        <p>{t('serverNode.hy2BandwidthPerspective')}</p>
        <p>
          {hasBandwidth
            ? t('serverNode.hy2BandwidthBrutal')
            : t('serverNode.hy2BandwidthBbr')}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={exampleKind}
          onValueChange={(v) => setExampleKind(v as 'proxy' | 'file' | 'string')}
        >
          <SelectTrigger className="h-9 w-[120px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="proxy">proxy</SelectItem>
            <SelectItem value="file">file</SelectItem>
            <SelectItem value="string">string</SelectItem>
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 text-xs"
          onClick={() => setPreviewOpen(true)}
        >
          {t('serverNode.fillOfficialExample')}
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 text-xs"
          onClick={clearMasquerade}
        >
          {t('serverNode.resetDefault')}
        </Button>

        <a
          href={docUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 items-center gap-1 text-xs text-[var(--xb-accent)] underline underline-offset-4"
        >
          {t('serverNode.officialDocs')}
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {previewOpen && (
        <div className="space-y-2.5 rounded-lg border border-[var(--xb-border-accent)] bg-[var(--xb-accent-soft)] p-3.5">
          <p className="text-xs text-foreground/90">{t('serverNode.hy2PreviewDesc')}</p>
          <pre className="max-h-48 overflow-auto rounded-md border bg-[var(--input-bg)] p-3 font-mono text-[11px]">
            {JSON.stringify(sample, null, 2)}
          </pre>
          <div className="flex gap-2">
            <Button type="button" size="sm" className="h-7 text-xs" onClick={confirmExample}>
              {t('serverNode.confirmFill')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setPreviewOpen(false)}
            >
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}

      <CodeEditor
        value={draft}
        onChange={handleChange}
        language="json"
        showJsonTools
        height="180px"
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </section>
  );
}
