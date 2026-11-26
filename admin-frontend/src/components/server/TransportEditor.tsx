import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ExternalLink, LayoutGrid } from 'lucide-react';
import type { TargetKernel } from '@/api/serverNode';
import { CodeEditor } from '@/components/shared/CodeEditor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  canonicalizeNetwork,
  getTransportExample,
  KERNEL_NETWORKS,
} from '@/lib/serverPresets';

interface TransportEditorProps {
  kernel: TargetKernel;
  network: string;
  networkSettings: Record<string, unknown>;
  side: 'shared' | 'client' | 'server';
  onChangeKernel: (next: TargetKernel) => void;
  onChangeNetwork: (next: string) => void;
  onChangeSettings: (next: Record<string, unknown>) => void;
  onDraftInvalidChange: (invalid: boolean) => void;
}

const NETWORK_NAMES: Record<string, string> = {
  tcp: 'TCP / RAW',
  ws: 'WebSocket',
  grpc: 'gRPC',
  httpupgrade: 'HTTPUpgrade',
  xhttp: 'XHTTP',
  http: 'HTTP',
  quic: 'V2Ray QUIC',
};

function getTransportDocUrl(kernel: TargetKernel, network: string): string {
  if (kernel === 'xray') {
    switch (network) {
      case 'xhttp':
        return 'https://xtls.github.io/config/transports/splithttp.html';
      case 'ws':
        return 'https://xtls.github.io/config/transports/websocket.html';
      case 'grpc':
        return 'https://xtls.github.io/config/transports/grpc.html';
      case 'httpupgrade':
        return 'https://xtls.github.io/config/transports/httpupgrade.html';
      default:
        return 'https://xtls.github.io/config/transports/raw.html';
    }
  }
  return 'https://sing-box.sagernet.org/configuration/shared/v2ray-transport/';
}

export function TransportEditor({
  kernel,
  network,
  networkSettings,
  side,
  onChangeKernel,
  onChangeNetwork,
  onChangeSettings,
  onDraftInvalidChange,
}: TransportEditorProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'form' | 'json'>('form');
  const [showMore, setShowMore] = useState(false);
  const [preview, setPreview] = useState<{
    kind: 'default' | 'official' | 'xhttp-split';
    object: Record<string, unknown>;
  } | null>(null);
  const [jsonDraft, setJsonDraft] = useState(() =>
    JSON.stringify(networkSettings ?? {}, null, 2),
  );
  const [jsonError, setJsonError] = useState<string | null>(null);
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

  const canonicalNet = canonicalizeNetwork(network || 'tcp', kernel);
  const allowedNetworks = KERNEL_NETWORKS[kernel];
  const isLegacyIncompatible = !allowedNetworks.includes(canonicalNet);

  useEffect(() => {
    if (mode === 'form' && !showMore) {
      setJsonDraft(JSON.stringify(networkSettings ?? {}, null, 2));
      setJsonError(null);
      reportInvalid(false);
    }
  }, [networkSettings, mode, showMore]);

  const handleJsonChange = (text: string) => {
    setJsonDraft(text);
    const trimmed = text.trim();
    if (!trimmed) {
      setJsonError(null);
      reportInvalid(false);
      onChangeSettings({});
      return;
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setJsonError(t('serverNode.transportJsonObjectError'));
        reportInvalid(true);
        return;
      }
      setJsonError(null);
      reportInvalid(false);
      onChangeSettings(parsed as Record<string, unknown>);
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : t('common.jsonInvalid'));
      reportInvalid(true);
    }
  };

  const openPreview = (kind: 'default' | 'official' | 'xhttp-split') => {
    const object =
      kind === 'default' ? {} : getTransportExample(kernel, canonicalNet, kind);
    setPreview({ kind, object });
  };

  const confirmPreview = () => {
    if (!preview) return;
    setJsonDraft(JSON.stringify(preview.object, null, 2));
    setJsonError(null);
    reportInvalid(false);
    onChangeSettings(preview.object);
    setPreview(null);
  };

  const updateField = (key: string, value: unknown) => {
    const next = { ...(networkSettings ?? {}) };
    if (value === undefined || value === '') {
      delete next[key];
    } else {
      next[key] = value;
    }
    onChangeSettings(next);
  };

  const wsHeaders = (networkSettings?.headers as Record<string, string> | undefined) ?? {};
  const wsHost =
    kernel === 'singbox'
      ? wsHeaders.Host ?? (networkSettings?.host as string | undefined) ?? ''
      : (networkSettings?.host as string | undefined) ?? '';

  const grpcService =
    kernel === 'xray'
      ? String(networkSettings?.serviceName ?? networkSettings?.service_name ?? '')
      : String(networkSettings?.service_name ?? networkSettings?.serviceName ?? '');

  const httpHostStr = Array.isArray(networkSettings?.host)
    ? (networkSettings.host as string[]).join(', ')
    : String(networkSettings?.host ?? '');

  return (
    <section className="overflow-hidden rounded-[9px] border bg-[var(--xb-panel)]">
      {/* Header Bar matching xb-transport-heading */}
      <div className="flex items-center justify-between gap-3 border-b bg-[var(--xb-raised)] px-5 py-3.5">
        <h3 className="flex items-center gap-2 text-[13px] font-medium text-foreground/90">
          <LayoutGrid className="h-4 w-4 text-muted-foreground" />
          {t('serverNode.transportTitle')}
        </h3>
        <span className="text-[11px] tracking-wide text-muted-foreground">
          {side === 'server' ? t('serverNode.serverConfigSide') : t('serverNode.connectionSide')}
        </span>
      </div>

      <div className="space-y-4 p-5">
        {/* 2-Column Target Kernel + Transport Method */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t('serverNode.targetKernel')}</Label>
            <Select
              value={kernel}
              onValueChange={(v) => onChangeKernel(v as TargetKernel)}
            >
              <SelectTrigger className="h-10 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="xray">Xray</SelectItem>
                <SelectItem value="singbox">Sing-box</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {side === 'server'
                ? t('serverNode.kernelServerHint')
                : t('serverNode.kernelSharedHint')}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t('serverNode.network')}</Label>
            <Select value={canonicalNet} onValueChange={onChangeNetwork}>
              <SelectTrigger className="h-10 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allowedNetworks.map((net) => (
                  <SelectItem key={net} value={net}>
                    {NETWORK_NAMES[net] || net.toUpperCase()}
                  </SelectItem>
                ))}
                {isLegacyIncompatible && (
                  <SelectItem value={canonicalNet}>
                    {NETWORK_NAMES[canonicalNet] || canonicalNet.toUpperCase()} (Legacy)
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLegacyIncompatible && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t('serverNode.legacyNetworkWarning', { network: canonicalNet, kernel })}</span>
          </div>
        )}

        {canonicalNet === 'tcp' && (
          <div className="border-l-2 border-border bg-[var(--xb-raised)] px-3 py-2 text-[11px] text-muted-foreground">
            {t('serverNode.tcpHint')}
          </div>
        )}

        {/* Recessed Segmented Pill Switch */}
        <div className="inline-flex rounded-md border bg-[var(--input-bg)] p-0.5">
          <button
            type="button"
            className={`h-7 rounded-sm px-3 text-xs font-medium transition-colors cursor-pointer ${
              mode === 'form'
                ? 'bg-[var(--xb-accent-soft)] text-[var(--xb-accent)]'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setMode('form')}
          >
            {t('serverNode.formMode')}
          </button>
          <button
            type="button"
            className={`h-7 rounded-sm px-3 text-xs font-medium transition-colors cursor-pointer ${
              mode === 'json'
                ? 'bg-[var(--xb-accent-soft)] text-[var(--xb-accent)]'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => {
              setJsonDraft(JSON.stringify(networkSettings ?? {}, null, 2));
              setMode('json');
            }}
          >
            {t('serverNode.jsonMode')}
          </button>
        </div>

        {mode === 'form' && (
          <div className="space-y-4">
            {canonicalNet === 'ws' && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">path</Label>
                  <Input
                    className="h-10 font-mono text-xs"
                    value={String(networkSettings?.path ?? '')}
                    onChange={(e) => updateField('path', e.target.value)}
                    placeholder="/ws"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Host</Label>
                  <Input
                    className="h-10 font-mono text-xs"
                    value={wsHost}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (kernel === 'singbox') {
                        const next = { ...(networkSettings ?? {}) };
                        delete next.host;
                        const headers = { ...wsHeaders };
                        if (val) headers.Host = val;
                        else delete headers.Host;
                        if (Object.keys(headers).length > 0) next.headers = headers;
                        else delete next.headers;
                        onChangeSettings(next);
                      } else {
                        updateField('host', val);
                      }
                    }}
                    placeholder="cdn.example.com"
                  />
                </div>
              </div>
            )}

            {canonicalNet === 'grpc' && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    {kernel === 'xray' ? 'serviceName' : 'service_name'}
                  </Label>
                  <Input
                    className="h-10 font-mono text-xs"
                    value={grpcService}
                    onChange={(e) => {
                      const next = { ...(networkSettings ?? {}) };
                      delete next.serviceName;
                      delete next.service_name;
                      if (e.target.value) {
                        next[kernel === 'xray' ? 'serviceName' : 'service_name'] =
                          e.target.value;
                      }
                      onChangeSettings(next);
                    }}
                    placeholder="grpc-service"
                  />
                </div>
              </div>
            )}

            {canonicalNet === 'httpupgrade' && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">path</Label>
                  <Input
                    className="h-10 font-mono text-xs"
                    value={String(networkSettings?.path ?? '')}
                    onChange={(e) => updateField('path', e.target.value)}
                    placeholder="/upgrade"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">host</Label>
                  <Input
                    className="h-10 font-mono text-xs"
                    value={String(networkSettings?.host ?? '')}
                    onChange={(e) => updateField('host', e.target.value)}
                    placeholder="cdn.example.com"
                  />
                </div>
              </div>
            )}

            {canonicalNet === 'xhttp' && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">mode</Label>
                  <Select
                    value={String(networkSettings?.mode || 'auto')}
                    onValueChange={(v) => updateField('mode', v)}
                  >
                    <SelectTrigger className="h-10 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">auto</SelectItem>
                      <SelectItem value="packet-up">packet-up</SelectItem>
                      <SelectItem value="stream-up">stream-up</SelectItem>
                      <SelectItem value="stream-one">stream-one</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">path</Label>
                  <Input
                    className="h-10 font-mono text-xs"
                    value={String(networkSettings?.path ?? '')}
                    onChange={(e) => updateField('path', e.target.value)}
                    placeholder="/xhttp"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">host</Label>
                  <Input
                    className="h-10 font-mono text-xs"
                    value={String(networkSettings?.host ?? '')}
                    onChange={(e) => updateField('host', e.target.value)}
                    placeholder="cdn.example.com"
                  />
                </div>
              </div>
            )}

            {canonicalNet === 'http' && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">path</Label>
                  <Input
                    className="h-10 font-mono text-xs"
                    value={String(networkSettings?.path ?? '')}
                    onChange={(e) => updateField('path', e.target.value)}
                    placeholder="/h2"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    host ({t('serverNode.commaSeparated')})
                  </Label>
                  <Input
                    className="h-10 font-mono text-xs"
                    value={httpHostStr}
                    onChange={(e) => {
                      const arr = e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean);
                      updateField('host', arr.length > 0 ? arr : undefined);
                    }}
                    placeholder="cdn.example.com"
                  />
                </div>
              </div>
            )}

            {side !== 'client' &&
              ['tcp', 'ws', 'httpupgrade', 'xhttp'].includes(canonicalNet) && (
                <div className="flex items-center justify-between rounded-md border bg-[var(--input-bg)] px-3.5 py-2.5">
                  <Label className="text-xs">{t('serverNode.acceptProxyProtocol')}</Label>
                  <Switch
                    checked={Boolean(networkSettings?.acceptProxyProtocol)}
                    onCheckedChange={(checked) =>
                      updateField('acceptProxyProtocol', checked ? true : undefined)
                    }
                  />
                </div>
              )}

            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 bg-[var(--xb-accent-soft)] text-xs"
                onClick={() => {
                  if (!showMore) {
                    setJsonDraft(JSON.stringify(networkSettings ?? {}, null, 2));
                  }
                  setShowMore((v) => !v);
                }}
              >
                {showMore ? t('serverNode.collapseMoreParams') : t('serverNode.expandMoreParams')}
              </Button>
            </div>
          </div>
        )}

        {(mode === 'json' || showMore) && (
          <div className="space-y-3 rounded-lg border bg-[var(--input-bg)] p-3.5">
            <CodeEditor
              value={jsonDraft}
              onChange={handleJsonChange}
              language="json"
              showJsonTools
              height="200px"
            />
            {jsonError && <p className="text-xs text-destructive">{jsonError}</p>}
            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 bg-[var(--xb-accent-soft)] text-xs"
                onClick={() => openPreview('default')}
              >
                {t('serverNode.resetDefault')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 bg-[var(--xb-accent-soft)] text-xs"
                disabled={isLegacyIncompatible}
                onClick={() => openPreview('official')}
              >
                {t('serverNode.fillOfficialExample')}
              </Button>
              {kernel === 'xray' && canonicalNet === 'xhttp' && side !== 'server' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 bg-[var(--xb-accent-soft)] text-xs"
                  onClick={() => openPreview('xhttp-split')}
                >
                  {t('serverNode.xhttpSplitExample')}
                </Button>
              )}
            </div>

            {preview && (
              <div className="space-y-2.5 rounded-lg border border-[var(--xb-border-accent)] bg-[var(--xb-accent-soft)] p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-foreground/90">
                    {preview.kind === 'default'
                      ? t('serverNode.previewClearDesc')
                      : t('serverNode.previewReplaceDesc')}
                  </p>
                  <a
                    href={getTransportDocUrl(kernel, canonicalNet)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-[var(--xb-accent)] underline underline-offset-4"
                  >
                    {t('serverNode.officialDocs')}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <pre className="max-h-40 overflow-auto rounded-md border bg-[var(--input-bg)] p-3 font-mono text-[11px] text-foreground">
                  {JSON.stringify(preview.object, null, 2)}
                </pre>
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" className="h-7 text-xs" onClick={confirmPreview}>
                    {t('serverNode.confirmFill')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setPreview(null)}
                  >
                    {t('common.cancel')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
