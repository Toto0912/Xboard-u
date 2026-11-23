import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  Cloud,
  ExternalLink,
  Info,
  LayoutGrid,
  Lock,
  Plus,
  RefreshCw,
  Route as RouteIcon,
  Server,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  CdnSettings,
  CertConfig,
  ServerProtocolType,
} from '@/api/serverNode';
import { ProtocolFields } from '@/components/server/ProtocolFields';
import { CodeEditor } from '@/components/shared/CodeEditor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  getCustomOutboundExample,
  getCustomRouteExample,
  inferTargetKernel,
  PROTOCOL_MAP,
  syncCdnServerFromClient,
} from '@/lib/serverPresets';

interface AdvancedSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeName?: string;
  protocol: ServerProtocolType;
  clientHost: string;
  clientPort: string | number;
  clientServerPort: string | number;
  clientProtocolSettings: Record<string, unknown>;
  cdnSettings: CdnSettings;
  certConfig: CertConfig;
  customOutbounds: Array<Record<string, unknown>>;
  customRoutes: Array<Record<string, unknown>>;
  onApply: (next: {
    cdnSettings: CdnSettings;
    certConfig: CertConfig;
    customOutbounds: Array<Record<string, unknown>>;
    customRoutes: Array<Record<string, unknown>>;
    multiplex: Record<string, unknown> | undefined;
  }) => void;
}

function describeConnectionSummary(
  protocol: ServerProtocolType,
  settings: Record<string, unknown> | undefined,
): string {
  const s = settings ?? {};
  const alwaysTls = ['hysteria', 'tuic', 'anytls'].includes(protocol);
  const security = alwaysTls
    ? 'TLS'
    : protocol === 'shadowsocks'
      ? 'AEAD'
      : Number(s.tls ?? 0) === 2
        ? 'Reality'
        : Number(s.tls ?? 0) === 1
          ? 'TLS'
          : 'Plain';
  const transport = String(
    s.network ||
      s.transport ||
      (protocol === 'hysteria' || protocol === 'tuic' ? 'QUIC' : 'TCP'),
  );
  return `${security} / ${transport}`;
}

export function AdvancedSettingsDialog({
  open,
  onOpenChange,
  nodeName,
  protocol,
  clientHost,
  clientPort,
  clientServerPort,
  clientProtocolSettings,
  cdnSettings,
  certConfig,
  customOutbounds,
  customRoutes,
  onApply,
}: AdvancedSettingsDialogProps) {
  const { t } = useTranslation();
  const supportsMultiplex = PROTOCOL_MAP[protocol]?.supportsMultiplex ?? false;

  const [localCdn, setLocalCdn] = useState<CdnSettings>(cdnSettings);
  const [localCert, setLocalCert] = useState<CertConfig>(certConfig);
  const [outboundsText, setOutboundsText] = useState('[]');
  const [routesText, setRoutesText] = useState('[]');
  const [outboundsError, setOutboundsError] = useState<string | null>(null);
  const [routesError, setRoutesError] = useState<string | null>(null);
  const [outboundPreviewOpen, setOutboundPreviewOpen] = useState(false);
  const [routePreviewOpen, setRoutePreviewOpen] = useState(false);
  const [serverDraftInvalid, setServerDraftInvalid] = useState(false);
  const [localMultiplex, setLocalMultiplex] = useState<Record<string, unknown>>({});
  const [dnsEnvRows, setDnsEnvRows] = useState<Array<{ key: string; value: string }>>([]);

  useEffect(() => {
    if (!open) return;
    setLocalCdn(JSON.parse(JSON.stringify(cdnSettings ?? { enabled: false })) as CdnSettings);
    const cert = JSON.parse(JSON.stringify(certConfig ?? {})) as CertConfig;
    setLocalCert(cert);
    const envEntries = Object.entries(cert.dns_env ?? {}).map(([key, value]) => ({
      key,
      value: String(value ?? ''),
    }));
    setDnsEnvRows(envEntries);
    setOutboundsText(
      customOutbounds && customOutbounds.length > 0
        ? JSON.stringify(customOutbounds, null, 2)
        : '[]',
    );
    setRoutesText(
      customRoutes && customRoutes.length > 0 ? JSON.stringify(customRoutes, null, 2) : '[]',
    );
    setOutboundsError(null);
    setRoutesError(null);
    setOutboundPreviewOpen(false);
    setRoutePreviewOpen(false);
    setServerDraftInvalid(false);
    setLocalMultiplex(
      JSON.parse(
        JSON.stringify(
          (clientProtocolSettings?.multiplex as Record<string, unknown> | undefined) ?? {
            enabled: false,
            protocol: 'yamux',
            max_connections: null,
            padding: false,
            brutal: { enabled: false, up_mbps: null, down_mbps: null },
          },
        ),
      ) as Record<string, unknown>,
    );
  }, [open, cdnSettings, certConfig, customOutbounds, customRoutes, clientProtocolSettings]);

  const effectiveKernel = inferTargetKernel(
    protocol,
    localCdn.enabled ? localCdn.server?.protocol_settings : clientProtocolSettings,
  );

  const handleToggleCdn = (enabled: boolean) => {
    if (enabled && !localCdn.server) {
      setLocalCdn({
        enabled: true,
        type: protocol,
        server: syncCdnServerFromClient(
          protocol,
          clientProtocolSettings,
          undefined,
          clientHost,
          clientServerPort || clientPort || 443,
        ),
      });
    } else {
      setLocalCdn({
        ...localCdn,
        enabled,
        type: protocol,
      });
    }
  };

  const handleSyncFromClient = () => {
    setLocalCdn((prev) => ({
      enabled: prev.enabled,
      type: protocol,
      server: syncCdnServerFromClient(
        protocol,
        clientProtocolSettings,
        prev.server,
        clientHost,
        clientServerPort || clientPort || 443,
      ),
    }));
    toast.success(t('serverNode.cdnSynced'));
  };

  const handleSave = () => {
    if (serverDraftInvalid) {
      toast.error(t('serverNode.fixDraftErrorsFirst'));
      return;
    }

    let parsedOutbounds: Array<Record<string, unknown>> = [];
    try {
      const o = outboundsText.trim() ? JSON.parse(outboundsText) : [];
      if (!Array.isArray(o)) {
        setOutboundsError(t('serverNode.jsonArrayRequired'));
        return;
      }
      parsedOutbounds = o;
    } catch (err) {
      setOutboundsError(err instanceof Error ? err.message : t('common.jsonInvalid'));
      return;
    }

    let parsedRoutes: Array<Record<string, unknown>> = [];
    try {
      const r = routesText.trim() ? JSON.parse(routesText) : [];
      if (!Array.isArray(r)) {
        setRoutesError(t('serverNode.jsonArrayRequired'));
        return;
      }
      parsedRoutes = r;
    } catch (err) {
      setRoutesError(err instanceof Error ? err.message : t('common.jsonInvalid'));
      return;
    }

    const dnsEnvObj: Record<string, string> = {};
    for (const row of dnsEnvRows) {
      const k = row.key.trim();
      if (k) dnsEnvObj[k] = row.value;
    }

    const nextCert: CertConfig = {
      ...localCert,
      ...(localCert.cert_mode === 'dns' ? { dns_env: dnsEnvObj } : {}),
    };

    onApply({
      cdnSettings: localCdn,
      certConfig: nextCert,
      customOutbounds: parsedOutbounds,
      customRoutes: parsedRoutes,
      multiplex: supportsMultiplex ? localMultiplex : undefined,
    });
    onOpenChange(false);
  };

  const certMode = localCert.cert_mode || 'none';
  const brutal = (localMultiplex.brutal as Record<string, unknown> | undefined) ?? {};
  const isReality =
    Number(clientProtocolSettings?.tls ?? 0) === 2 ||
    Number(localCdn.server?.protocol_settings?.tls ?? 0) === 2;

  const outboundSample = getCustomOutboundExample(effectiveKernel);
  const routeSample = getCustomRouteExample(effectiveKernel, protocol);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(850px,calc(100dvh-48px))] w-[min(920px,calc(100vw-40px))] max-w-[920px] flex-col gap-0 overflow-hidden rounded-[15px] bg-[var(--xb-surface)] p-0">
        <Tabs defaultValue="cdn" className="flex min-h-0 flex-1 flex-col">
          {/* Fixed Header + Flush 5-Tab Underline Bar matching xb-advanced-head */}
          <div className="shrink-0 border-b bg-[var(--xb-heading)] px-7 pb-0 pt-6">
            <div className="text-[10px] font-medium uppercase tracking-[0.17em] text-muted-foreground">
              ADVANCED SETTINGS
            </div>
            <DialogTitle className="mt-2 flex items-center gap-2.5 text-xl font-semibold tracking-tight">
              <SlidersHorizontal className="h-5 w-5 text-muted-foreground" />
              {t('serverNode.advancedSettings')}
            </DialogTitle>
            <DialogDescription className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
              <span>{nodeName?.trim() || t('serverNode.nodeConfigLabel')}</span>
              <span>·</span>
              <span className="font-mono">{protocol.toUpperCase()}</span>
            </DialogDescription>

            <TabsList className="mt-5 flex h-auto w-full justify-start gap-2 overflow-x-auto rounded-none bg-transparent p-0">
              <TabsTrigger
                value="cert"
                className="flex-1 rounded-none border-b-2 border-transparent px-3 py-2.5 text-xs text-muted-foreground shadow-none data-[state=active]:border-[var(--xb-accent)] data-[state=active]:bg-transparent data-[state=active]:text-[var(--xb-accent)] data-[state=active]:shadow-none"
              >
                <Lock className="mr-1.5 h-3.5 w-3.5" />
                {t('serverNode.tabs.cert')}
              </TabsTrigger>
              <TabsTrigger
                value="outbounds"
                className="flex-1 rounded-none border-b-2 border-transparent px-3 py-2.5 text-xs text-muted-foreground shadow-none data-[state=active]:border-[var(--xb-accent)] data-[state=active]:bg-transparent data-[state=active]:text-[var(--xb-accent)] data-[state=active]:shadow-none"
              >
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                {t('serverNode.tabs.outbounds')}
              </TabsTrigger>
              <TabsTrigger
                value="routes"
                className="flex-1 rounded-none border-b-2 border-transparent px-3 py-2.5 text-xs text-muted-foreground shadow-none data-[state=active]:border-[var(--xb-accent)] data-[state=active]:bg-transparent data-[state=active]:text-[var(--xb-accent)] data-[state=active]:shadow-none"
              >
                <RouteIcon className="mr-1.5 h-3.5 w-3.5" />
                {t('serverNode.tabs.routes')}
              </TabsTrigger>
              {supportsMultiplex && (
                <TabsTrigger
                  value="multiplex"
                  className="flex-1 rounded-none border-b-2 border-transparent px-3 py-2.5 text-xs text-muted-foreground shadow-none data-[state=active]:border-[var(--xb-accent)] data-[state=active]:bg-transparent data-[state=active]:text-[var(--xb-accent)] data-[state=active]:shadow-none"
                >
                  <LayoutGrid className="mr-1.5 h-3.5 w-3.5" />
                  {t('serverNode.tabs.multiplex')}
                </TabsTrigger>
              )}
              <TabsTrigger
                value="cdn"
                className="flex-1 rounded-none border-b-2 border-transparent px-3 py-2.5 text-xs text-muted-foreground shadow-none data-[state=active]:border-[var(--xb-accent)] data-[state=active]:bg-transparent data-[state=active]:text-[var(--xb-accent)] data-[state=active]:shadow-none"
              >
                <Cloud className="mr-1.5 h-3.5 w-3.5" />
                {t('serverNode.tabs.cdn')}
                <span className="ml-1.5 rounded border border-[var(--xb-border-accent)] bg-[var(--xb-accent-soft)] px-1 py-0 text-[9px] text-[var(--xb-accent)]">
                  NEW
                </span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Scrollable Tab Body */}
          <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
            {/* CDN Split */}
            <TabsContent value="cdn" className="mt-0 space-y-5">
              {/* Hero Gradient Split Card */}
              <div className="rounded-[10px] border border-[var(--xb-border-accent)] bg-gradient-to-br from-[var(--xb-raised)] to-[var(--xb-panel)] p-5">
                <div className="flex items-center gap-3.5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border border-[var(--xb-border-accent)] bg-[var(--xb-accent-soft)] text-[var(--xb-accent)]">
                    <Cloud className="h-5 w-5" />
                  </span>
                  <div className="flex flex-1 flex-wrap items-center gap-2.5">
                    <h3 className="text-[15px] font-semibold">{t('serverNode.cdnEnable')}</h3>
                    <Badge
                      variant="outline"
                      className={
                        localCdn.enabled
                          ? 'border-emerald-500/35 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px]'
                          : 'text-[10px] text-muted-foreground'
                      }
                    >
                      {localCdn.enabled ? t('serverNode.cdnOn') : t('serverNode.cdnOff')}
                    </Badge>
                  </div>
                  <Switch
                    checked={Boolean(localCdn.enabled)}
                    onCheckedChange={handleToggleCdn}
                  />
                </div>
                <p className="mt-3 pl-[54px] text-xs text-muted-foreground">
                  {t('serverNode.cdnEnableHint')}
                </p>
              </div>

              {!localCdn.enabled ? (
                <div className="rounded-[10px] border border-dashed py-14 text-center">
                  <Server className="mx-auto mb-4 h-9 w-9 text-muted-foreground" />
                  <h4 className="text-sm font-medium">{t('serverNode.cdnUnifiedTitle')}</h4>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {t('serverNode.cdnUnifiedDesc')}
                  </p>
                </div>
              ) : (
                localCdn.server && (
                  <div className="space-y-5">
                    {/* 3-Column Connection Pipeline Summary Card */}
                    <div className="grid grid-cols-1 items-center gap-3 rounded-lg border bg-[var(--xb-panel)] p-4 sm:grid-cols-[1fr_20px_0.7fr_20px_1fr]">
                      <div>
                        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <i className="inline-block h-1.5 w-1.5 rounded-full bg-sky-500" />
                          {t('serverNode.outerClient')}
                        </span>
                        <strong className="mt-1 block break-all font-mono text-xs">
                          {clientHost || '—'}:{clientPort || '—'}
                        </strong>
                        <small className="text-[11px] text-muted-foreground">
                          {describeConnectionSummary(protocol, clientProtocolSettings)}
                        </small>
                      </div>

                      <ArrowRight className="mx-auto hidden h-4 w-4 text-muted-foreground sm:block" />

                      <div className="text-center">
                        <Cloud className="mx-auto mb-1 h-5 w-5 text-muted-foreground" />
                        <strong className="block text-xs font-medium">
                          {isReality ? t('serverNode.entryPoint') : 'CDN / Reverse Proxy'}
                        </strong>
                        <small className="text-[10px] text-muted-foreground">
                          {t('serverNode.separateConfig')}
                        </small>
                      </div>

                      <ArrowRight className="mx-auto hidden h-4 w-4 text-muted-foreground sm:block" />

                      <div>
                        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <i className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          {t('serverNode.innerServer')}
                        </span>
                        <strong className="mt-1 block break-all font-mono text-xs">
                          {localCdn.server.host || '—'}:{localCdn.server.server_port || '—'}
                        </strong>
                        <small className="text-[11px] text-muted-foreground">
                          {describeConnectionSummary(protocol, localCdn.server.protocol_settings)}
                        </small>
                      </div>
                    </div>

                    {isReality && (
                      <div className="rounded-md border border-amber-500/35 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-700 dark:text-amber-300">
                        {t('serverNode.realityCdnWarning')}
                      </div>
                    )}

                    {/* Origin Server Heading + Sync Button */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      <div>
                        <h4 className="flex items-center gap-2 text-[15px] font-medium">
                          <Server className="h-4 w-4 text-muted-foreground" />
                          {t('serverNode.originServerSection')}
                          <Badge
                            variant="outline"
                            className="border-[var(--xb-border-accent)] bg-[var(--xb-accent-soft)] text-[10px] text-[var(--xb-accent)]"
                          >
                            {protocol.toUpperCase()}
                          </Badge>
                        </h4>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t('serverNode.originServerHint')}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 border-[var(--xb-border-accent)] bg-[var(--xb-accent-soft)] text-xs text-[var(--xb-accent)]"
                        onClick={handleSyncFromClient}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        {t('serverNode.syncFromClient')}
                      </Button>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">
                          {t('serverNode.originHost')}
                        </Label>
                        <Input
                          className="h-10 font-mono text-xs"
                          value={localCdn.server.host}
                          onChange={(e) =>
                            setLocalCdn({
                              ...localCdn,
                              server: { ...localCdn.server!, host: e.target.value },
                            })
                          }
                          placeholder="origin.example.com"
                        />
                      </div>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">
                            {t('serverNode.originPort')}
                          </Label>
                          <Input
                            className="h-10 font-mono text-xs"
                            value={String(localCdn.server.port ?? '')}
                            onChange={(e) =>
                              setLocalCdn({
                                ...localCdn,
                                server: { ...localCdn.server!, port: e.target.value },
                              })
                            }
                            placeholder="443"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">
                            {t('serverNode.originServerPort')}
                          </Label>
                          <Input
                            className="h-10 font-mono text-xs"
                            value={String(localCdn.server.server_port ?? '')}
                            onChange={(e) =>
                              setLocalCdn({
                                ...localCdn,
                                server: { ...localCdn.server!, server_port: e.target.value },
                              })
                            }
                            placeholder="443"
                          />
                        </div>
                      </div>
                    </div>

                    <ProtocolFields
                      protocol={protocol}
                      settings={localCdn.server.protocol_settings ?? {}}
                      side="server"
                      onChange={(nextPs) =>
                        setLocalCdn({
                          ...localCdn,
                          server: { ...localCdn.server!, protocol_settings: nextPs },
                        })
                      }
                      onDraftInvalidChange={setServerDraftInvalid}
                    />

                    <p className="flex items-center gap-2 border-t pt-4 text-[11px] text-muted-foreground">
                      <Info className="h-3.5 w-3.5 shrink-0" />
                      {t('serverNode.cdnFootnote')}
                    </p>
                  </div>
                )
              )}
            </TabsContent>

            {/* Certificate */}
            <TabsContent value="cert" className="mt-0 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    {t('serverNode.certMode')}
                  </Label>
                  <Select
                    value={certMode}
                    onValueChange={(v) =>
                      setLocalCert({
                        ...localCert,
                        cert_mode: v as CertConfig['cert_mode'],
                      })
                    }
                  >
                    <SelectTrigger className="h-10 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('serverNode.securityNone')}</SelectItem>
                      <SelectItem value="http">HTTP-01 (ACME)</SelectItem>
                      <SelectItem value="dns">DNS-01 (ACME)</SelectItem>
                      <SelectItem value="self">Self-signed</SelectItem>
                      <SelectItem value="file">Manual / File</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {certMode !== 'none' && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      {t('serverNode.certDomain')}
                    </Label>
                    <Input
                      className="h-10 font-mono text-xs"
                      value={localCert.domain ?? ''}
                      onChange={(e) => setLocalCert({ ...localCert, domain: e.target.value })}
                      placeholder="node.example.com"
                    />
                  </div>
                )}
              </div>

              {(certMode === 'http' || certMode === 'dns') && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">ACME Email</Label>
                    <Input
                      className="h-10 font-mono text-xs"
                      value={localCert.email ?? ''}
                      onChange={(e) => setLocalCert({ ...localCert, email: e.target.value })}
                      placeholder="admin@example.com"
                    />
                  </div>
                  {certMode === 'http' ? (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">HTTP Port</Label>
                      <Input
                        type="number"
                        className="h-10 font-mono text-xs"
                        value={localCert.http_port ?? 80}
                        onChange={(e) =>
                          setLocalCert({
                            ...localCert,
                            http_port: Number(e.target.value) || 80,
                          })
                        }
                      />
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">DNS Provider</Label>
                      <Input
                        className="h-10 font-mono text-xs"
                        value={localCert.dns_provider ?? ''}
                        onChange={(e) =>
                          setLocalCert({ ...localCert, dns_provider: e.target.value })
                        }
                        placeholder="cloudflare"
                      />
                    </div>
                  )}
                </div>
              )}

              {certMode === 'dns' && (
                <div className="space-y-2 rounded-lg border bg-[var(--xb-panel)] p-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">DNS Environment Variables</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setDnsEnvRows([...dnsEnvRows, { key: '', value: '' }])}
                    >
                      <Plus className="h-3 w-3" />
                      {t('serverNode.addRow')}
                    </Button>
                  </div>
                  {dnsEnvRows.map((row, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        className="h-9 font-mono text-xs"
                        value={row.key}
                        onChange={(e) => {
                          const next = [...dnsEnvRows];
                          next[idx] = { ...row, key: e.target.value };
                          setDnsEnvRows(next);
                        }}
                        placeholder="CF_DNS_API_TOKEN"
                      />
                      <Input
                        className="h-9 font-mono text-xs"
                        value={row.value}
                        onChange={(e) => {
                          const next = [...dnsEnvRows];
                          next[idx] = { ...row, value: e.target.value };
                          setDnsEnvRows(next);
                        }}
                        placeholder="token-value"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setDnsEnvRows(dnsEnvRows.filter((_, i) => i !== idx))}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {certMode === 'file' && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Certificate PEM / Path</Label>
                    <Textarea
                      rows={5}
                      className="font-mono text-xs"
                      value={localCert.cert_content ?? ''}
                      onChange={(e) =>
                        setLocalCert({ ...localCert, cert_content: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Private Key PEM / Path</Label>
                    <Textarea
                      rows={5}
                      className="font-mono text-xs"
                      value={localCert.key_content ?? ''}
                      onChange={(e) =>
                        setLocalCert({ ...localCert, key_content: e.target.value })
                      }
                    />
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Custom Outbounds */}
            <TabsContent value="outbounds" className="mt-0 space-y-4">
              <div>
                <h4 className="text-base font-medium">Custom Outbounds (JSON)</h4>
                <p className="mt-1 text-xs text-muted-foreground">{t('serverNode.outboundsHint')}</p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--xb-border-accent)] bg-[var(--xb-raised)] px-4 py-3.5">
                <p className="text-xs text-foreground/90">
                  {t('serverNode.effectiveKernelBanner', {
                    kernel: effectiveKernel === 'singbox' ? 'Sing-box' : 'Xray',
                    source: localCdn.enabled
                      ? t('serverNode.cdnServerSource')
                      : t('serverNode.nodeEditorSource'),
                  })}
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setOutboundPreviewOpen((v) => !v)}
                >
                  {t('serverNode.generateExampleByKernel')}
                </Button>
              </div>

              {outboundPreviewOpen && (
                <div className="space-y-2.5 rounded-lg border border-[var(--xb-border-accent)] bg-[var(--xb-accent-soft)] p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-foreground/90">
                      {t('serverNode.customExamplePreviewDesc')}
                    </p>
                    <a
                      href={
                        effectiveKernel === 'singbox'
                          ? 'https://sing-box.sagernet.org/configuration/outbound/'
                          : 'https://xtls.github.io/config/outbound.html'
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-[var(--xb-accent)] underline underline-offset-4"
                    >
                      {t('serverNode.officialFieldDocs')}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <pre className="max-h-44 overflow-auto rounded-md border bg-[var(--input-bg)] p-3 font-mono text-[11px]">
                    {JSON.stringify(outboundSample, null, 2)}
                  </pre>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        setOutboundsText(JSON.stringify(outboundSample, null, 2));
                        setOutboundsError(null);
                        setOutboundPreviewOpen(false);
                      }}
                    >
                      {t('serverNode.confirmFill')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setOutboundPreviewOpen(false)}
                    >
                      {t('common.cancel')}
                    </Button>
                  </div>
                </div>
              )}

              <CodeEditor
                value={outboundsText}
                onChange={(val) => {
                  setOutboundsText(val);
                  setOutboundsError(null);
                }}
                language="json"
                showJsonTools
                height="280px"
              />
              {outboundsError && <p className="text-xs text-destructive">{outboundsError}</p>}
            </TabsContent>

            {/* Custom Routes */}
            <TabsContent value="routes" className="mt-0 space-y-4">
              <div>
                <h4 className="text-base font-medium">Custom Routes (JSON)</h4>
                <p className="mt-1 text-xs text-muted-foreground">{t('serverNode.routesHint')}</p>
              </div>

              <div className="flex items-center gap-2.5 rounded-md border bg-[var(--xb-panel)] px-3.5 py-2.5 text-xs">
                <span className="text-muted-foreground">{t('serverNode.inboundTagLabel')}</span>
                <code className="font-mono font-medium text-foreground">{protocol}-in</code>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--xb-border-accent)] bg-[var(--xb-raised)] px-4 py-3.5">
                <p className="text-xs text-foreground/90">
                  {t('serverNode.effectiveKernelBanner', {
                    kernel: effectiveKernel === 'singbox' ? 'Sing-box' : 'Xray',
                    source: localCdn.enabled
                      ? t('serverNode.cdnServerSource')
                      : t('serverNode.nodeEditorSource'),
                  })}
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setRoutePreviewOpen((v) => !v)}
                >
                  {t('serverNode.generateExampleByKernel')}
                </Button>
              </div>

              {routePreviewOpen && (
                <div className="space-y-2.5 rounded-lg border border-[var(--xb-border-accent)] bg-[var(--xb-accent-soft)] p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-foreground/90">
                      {t('serverNode.customExamplePreviewDesc')}
                    </p>
                    <a
                      href={
                        effectiveKernel === 'singbox'
                          ? 'https://sing-box.sagernet.org/configuration/route/rule/'
                          : 'https://xtls.github.io/config/routing.html#ruleobject'
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-[var(--xb-accent)] underline underline-offset-4"
                    >
                      {t('serverNode.officialFieldDocs')}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <pre className="max-h-44 overflow-auto rounded-md border bg-[var(--input-bg)] p-3 font-mono text-[11px]">
                    {JSON.stringify(routeSample, null, 2)}
                  </pre>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        setRoutesText(JSON.stringify(routeSample, null, 2));
                        setRoutesError(null);
                        setRoutePreviewOpen(false);
                      }}
                    >
                      {t('serverNode.confirmFill')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setRoutePreviewOpen(false)}
                    >
                      {t('common.cancel')}
                    </Button>
                  </div>
                </div>
              )}

              <CodeEditor
                value={routesText}
                onChange={(val) => {
                  setRoutesText(val);
                  setRoutesError(null);
                }}
                language="json"
                showJsonTools
                height="260px"
              />
              {routesError && <p className="text-xs text-destructive">{routesError}</p>}
            </TabsContent>

            {/* Multiplex */}
            {supportsMultiplex && (
              <TabsContent value="multiplex" className="mt-0 space-y-4">
                <div className="flex items-center justify-between rounded-lg border bg-[var(--xb-panel)] px-4 py-3.5">
                  <div>
                    <Label className="text-sm font-medium">
                      {t('serverNode.enableMultiplex')}
                    </Label>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t('serverNode.multiplexHint')}
                    </p>
                  </div>
                  <Switch
                    checked={Boolean(localMultiplex.enabled)}
                    onCheckedChange={(checked) =>
                      setLocalMultiplex({ ...localMultiplex, enabled: checked })
                    }
                  />
                </div>

                {Boolean(localMultiplex.enabled) && (
                  <div className="space-y-4 rounded-lg border bg-[var(--xb-panel)] p-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Protocol</Label>
                        <Select
                          value={String(localMultiplex.protocol || 'yamux')}
                          onValueChange={(v) =>
                            setLocalMultiplex({ ...localMultiplex, protocol: v })
                          }
                        >
                          <SelectTrigger className="h-10 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="yamux">yamux</SelectItem>
                            <SelectItem value="smux">smux</SelectItem>
                            <SelectItem value="h2mux">h2mux</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Max Connections</Label>
                        <Input
                          type="number"
                          className="h-10 font-mono text-xs"
                          value={
                            localMultiplex.max_connections !== null &&
                            localMultiplex.max_connections !== undefined
                              ? String(localMultiplex.max_connections)
                              : ''
                          }
                          onChange={(e) =>
                            setLocalMultiplex({
                              ...localMultiplex,
                              max_connections:
                                e.target.value === '' ? null : Number(e.target.value),
                            })
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-lg border bg-[var(--input-bg)] px-3.5 py-2 sm:mt-5">
                        <Label className="text-xs">Padding</Label>
                        <Switch
                          checked={Boolean(localMultiplex.padding)}
                          onCheckedChange={(c) =>
                            setLocalMultiplex({ ...localMultiplex, padding: c })
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-3 rounded-lg border bg-[var(--input-bg)] p-3.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium">Brutal</Label>
                        <Switch
                          checked={Boolean(brutal.enabled)}
                          onCheckedChange={(c) =>
                            setLocalMultiplex({
                              ...localMultiplex,
                              brutal: { ...brutal, enabled: c },
                            })
                          }
                        />
                      </div>
                      {Boolean(brutal.enabled) && (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Up (Mbps)</Label>
                            <Input
                              type="number"
                              className="h-9 font-mono text-xs"
                              value={
                                brutal.up_mbps !== null && brutal.up_mbps !== undefined
                                  ? String(brutal.up_mbps)
                                  : ''
                              }
                              onChange={(e) =>
                                setLocalMultiplex({
                                  ...localMultiplex,
                                  brutal: {
                                    ...brutal,
                                    up_mbps:
                                      e.target.value === '' ? null : Number(e.target.value),
                                  },
                                })
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Down (Mbps)</Label>
                            <Input
                              type="number"
                              className="h-9 font-mono text-xs"
                              value={
                                brutal.down_mbps !== null && brutal.down_mbps !== undefined
                                  ? String(brutal.down_mbps)
                                  : ''
                              }
                              onChange={(e) =>
                                setLocalMultiplex({
                                  ...localMultiplex,
                                  brutal: {
                                    ...brutal,
                                    down_mbps:
                                      e.target.value === '' ? null : Number(e.target.value),
                                  },
                                })
                              }
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </TabsContent>
            )}
          </div>

          {/* Sticky Footer matching xb-advanced-footer */}
          <div className="flex shrink-0 items-center justify-end gap-2.5 border-t bg-[var(--xb-heading)] px-7 py-4">
            <Button
              type="button"
              variant="ghost"
              className="h-9 text-xs"
              onClick={() => onOpenChange(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button type="button" className="h-9 px-5 text-xs" onClick={handleSave}>
              {t('common.save')}
            </Button>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
