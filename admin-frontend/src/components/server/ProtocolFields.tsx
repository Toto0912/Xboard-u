import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Dices, KeyRound, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import {
  generateEchKey,
  type ServerProtocolType,
  type TargetKernel,
} from '@/api/serverNode';
import { Hy2MasqueradeEditor } from '@/components/server/Hy2MasqueradeEditor';
import { TransportEditor } from '@/components/server/TransportEditor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Textarea } from '@/components/ui/textarea';
import {
  ANYTLS_DEFAULT_PADDING,
  canonicalizeNetwork,
  generateRandomShortId,
  inferTargetKernel,
  PROTOCOL_MAP,
  SHADOWSOCKS_CIPHERS,
  SHADOWSOCKS_PLUGINS,
  supportsXrayFallback,
  TUIC_ALPN_OPTIONS,
  UTLS_FINGERPRINTS,
} from '@/lib/serverPresets';

interface ProtocolFieldsProps {
  protocol: ServerProtocolType;
  settings: Record<string, unknown>;
  side: 'shared' | 'client' | 'server';
  serverFallbackValue?: string;
  onChange: (next: Record<string, unknown>) => void;
  onDraftInvalidChange?: (invalid: boolean) => void;
}

export function ProtocolFields({
  protocol,
  settings,
  side,
  serverFallbackValue,
  onChange,
  onDraftInvalidChange,
}: ProtocolFieldsProps) {
  const { t } = useTranslation();
  const [echPublicName, setEchPublicName] = useState('ech.example.com');
  const [generatingEch, setGeneratingEch] = useState(false);

  const kernel: TargetKernel = inferTargetKernel(protocol, settings);
  const hasTransport = PROTOCOL_MAP[protocol]?.supportsTransport ?? false;
  const tlsObjectKey =
    protocol === 'hysteria' || protocol === 'tuic' || protocol === 'anytls'
      ? 'tls'
      : 'tls_settings';

  const patch = (partial: Record<string, unknown>) => {
    onChange({ ...settings, ...partial });
  };

  const patchNested = (key: string, partial: Record<string, unknown>) => {
    const current = (settings[key] as Record<string, unknown> | undefined) ?? {};
    onChange({
      ...settings,
      [key]: { ...current, ...partial },
    });
  };

  const handleKernelChange = (nextKernel: TargetKernel) => {
    const next: Record<string, unknown> = { ...settings, target_kernel: nextKernel };
    if (protocol === 'hysteria' && next.hy2_settings && typeof next.hy2_settings === 'object') {
      next.hy2_settings = {
        ...(next.hy2_settings as Record<string, unknown>),
        kernel: nextKernel,
      };
    }
    if (typeof next.network === 'string') {
      next.network = canonicalizeNetwork(next.network, nextKernel);
    }
    onChange(next);
  };

  const handleGenerateEch = async () => {
    setGeneratingEch(true);
    try {
      const res = await generateEchKey(echPublicName.trim() || 'ech.example.com');
      const tlsObj = (settings[tlsObjectKey] as Record<string, unknown> | undefined) ?? {};
      const ech = (tlsObj.ech as Record<string, unknown> | undefined) ?? {};
      patchNested(tlsObjectKey, {
        ech: {
          ...ech,
          enabled: true,
          key: res.key,
          config: res.config,
          query_server_name: echPublicName.trim() || 'ech.example.com',
        },
      });
      toast.success(t('serverNode.echGenerated'));
    } finally {
      setGeneratingEch(false);
    }
  };

  const renderEchSection = () => {
    const tlsObj = (settings[tlsObjectKey] as Record<string, unknown> | undefined) ?? {};
    const ech = (tlsObj.ech as Record<string, unknown> | undefined) ?? {};
    const echEnabled = Boolean(ech.enabled);
    return (
      <div className="space-y-2.5 rounded-lg border bg-[var(--input-bg)] p-3.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium">ECH (Encrypted Client Hello)</Label>
          <Switch
            checked={echEnabled}
            onCheckedChange={(checked) =>
              patchNested(tlsObjectKey, { ech: { ...ech, enabled: checked } })
            }
          />
        </div>
        {echEnabled && (
          <div className="space-y-2.5 pt-1">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[180px] flex-1 space-y-1">
                <Label className="text-xs text-muted-foreground">
                  {t('serverNode.echQueryServerName')}
                </Label>
                <Input
                  className="h-9 font-mono text-xs"
                  value={String(ech.query_server_name ?? echPublicName)}
                  onChange={(e) => {
                    setEchPublicName(e.target.value);
                    patchNested(tlsObjectKey, {
                      ech: { ...ech, query_server_name: e.target.value },
                    });
                  }}
                  placeholder="ech.example.com"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 text-xs"
                onClick={() => void handleGenerateEch()}
                disabled={generatingEch}
              >
                {generatingEch ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <KeyRound className="h-3.5 w-3.5" />
                )}
                {t('serverNode.generateEchKey')}
              </Button>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">ECH Config</Label>
              <Textarea
                rows={2}
                className="font-mono text-[11px]"
                value={String(ech.config ?? '')}
                onChange={(e) =>
                  patchNested(tlsObjectKey, { ech: { ...ech, config: e.target.value } })
                }
              />
            </div>
            {side !== 'client' && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">ECH Private Key</Label>
                <Textarea
                  rows={2}
                  className="font-mono text-[11px]"
                  value={String(ech.key ?? '')}
                  onChange={(e) =>
                    patchNested(tlsObjectKey, { ech: { ...ech, key: e.target.value } })
                  }
                />
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderTlsSettings = (showAllowInsecureGuard = true) => {
    const tlsObj = (settings[tlsObjectKey] as Record<string, unknown> | undefined) ?? {};
    const network = String(settings.network ?? '');
    const xrayDisallowInsecure =
      showAllowInsecureGuard && (kernel === 'xray' || network === 'xhttp');
    const legacyAllowInsecure = Boolean(tlsObj.allow_insecure);

    return (
      <div className="space-y-3 rounded-lg border bg-[var(--xb-panel)] p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">SNI (server_name)</Label>
            <Input
              className="h-10 font-mono text-xs"
              value={String(tlsObj.server_name ?? '')}
              onChange={(e) => patchNested(tlsObjectKey, { server_name: e.target.value })}
              placeholder="example.com"
            />
          </div>
          {!xrayDisallowInsecure && (
            <div className="flex items-center justify-between rounded-lg border bg-[var(--input-bg)] px-3.5 py-2 sm:mt-5">
              <Label className="text-xs">{t('serverNode.allowInsecure')}</Label>
              <Switch
                checked={legacyAllowInsecure}
                onCheckedChange={(checked) =>
                  patchNested(tlsObjectKey, { allow_insecure: checked })
                }
              />
            </div>
          )}
        </div>
        {xrayDisallowInsecure && legacyAllowInsecure && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-300">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{t('serverNode.xrayAllowInsecureWarning')}</span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 shrink-0 text-xs"
              onClick={() => patchNested(tlsObjectKey, { allow_insecure: false })}
            >
              {t('serverNode.disableNow')}
            </Button>
          </div>
        )}
        {renderEchSection()}
      </div>
    );
  };

  const renderRealitySettings = () => {
    const reality = (settings.reality_settings as Record<string, unknown> | undefined) ?? {};
    return (
      <div className="space-y-3.5 rounded-lg border bg-[var(--xb-panel)] p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">SNI (server_name)</Label>
            <Input
              className="h-10 font-mono text-xs"
              value={String(reality.server_name ?? '')}
              onChange={(e) => patchNested('reality_settings', { server_name: e.target.value })}
              placeholder="www.apple.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Handshake Port</Label>
            <Input
              className="h-10 font-mono text-xs"
              value={String(reality.server_port ?? '')}
              onChange={(e) => patchNested('reality_settings', { server_port: e.target.value })}
              placeholder="443"
            />
          </div>
          {side !== 'client' && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Dest</Label>
              <Input
                className="h-10 font-mono text-xs"
                value={String(reality.dest ?? '')}
                onChange={(e) => patchNested('reality_settings', { dest: e.target.value })}
                placeholder="www.apple.com:443"
              />
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Public Key</Label>
            <Input
              className="h-10 font-mono text-xs"
              value={String(reality.public_key ?? '')}
              onChange={(e) => patchNested('reality_settings', { public_key: e.target.value })}
            />
          </div>
          {side !== 'client' && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Private Key</Label>
              <Input
                className="h-10 font-mono text-xs"
                value={String(reality.private_key ?? '')}
                onChange={(e) => patchNested('reality_settings', { private_key: e.target.value })}
              />
            </div>
          )}
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs text-muted-foreground">Short ID</Label>
            <Input
              className="h-10 font-mono text-xs"
              value={String(reality.short_id ?? '')}
              onChange={(e) => patchNested('reality_settings', { short_id: e.target.value })}
              placeholder="0123abcd"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 text-xs"
            onClick={() => patchNested('reality_settings', { short_id: generateRandomShortId() })}
          >
            <Dices className="h-3.5 w-3.5" />
            {t('serverNode.randomShortId')}
          </Button>
        </div>
      </div>
    );
  };

  const renderUtlsSection = () => {
    const utls = (settings.utls as Record<string, unknown> | undefined) ?? {};
    const enabled = Boolean(utls.enabled);
    return (
      <div className="space-y-3 rounded-lg border bg-[var(--xb-panel)] px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label className="text-xs font-medium">uTLS</Label>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{t('serverNode.utlsHint')}</p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(checked) => patchNested('utls', { enabled: checked })}
          />
        </div>
        {enabled && (
          <Select
            value={String(utls.fingerprint || 'chrome')}
            onValueChange={(v) => patchNested('utls', { fingerprint: v })}
          >
            <SelectTrigger className="h-10 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UTLS_FINGERPRINTS.map((fp) => (
                <SelectItem key={fp} value={fp}>
                  {fp}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    );
  };

  const renderXrayFallback = () => {
    if (side === 'client') {
      return (
        <div className="space-y-1.5 rounded-lg border bg-[var(--xb-panel)] p-4 text-xs">
          <Label className="text-xs font-medium">{t('serverNode.fallbackServerSide')}</Label>
          <Input
            className="h-10 font-mono text-xs"
            value={serverFallbackValue || ''}
            readOnly
            disabled
          />
          <p className="text-[11px] text-muted-foreground">
            {t('serverNode.fallbackEditInCdnHint')}
          </p>
        </div>
      );
    }
    const { supported, disabledByEncryption } = supportsXrayFallback(protocol, settings);
    if (!supported) return null;
    return (
      <div className="space-y-1.5 rounded-lg border bg-[var(--xb-panel)] p-4">
        <div className="flex items-center gap-2">
          <Label className="text-xs font-medium">Fallback ({t('serverNode.optional')})</Label>
          <Badge variant="outline" className="text-[10px]">
            {t('serverNode.xrayOnly')}
          </Badge>
        </div>
        <Input
          className="h-10 font-mono text-xs"
          disabled={disabledByEncryption}
          value={String(settings.xray_fallback ?? '')}
          onChange={(e) => patch({ xray_fallback: e.target.value })}
          placeholder="127.0.0.1:8080"
        />
        <p className="text-[11px] text-muted-foreground">
          {disabledByEncryption
            ? t('serverNode.fallbackDisabledByEncryption')
            : t('serverNode.fallbackHint')}
        </p>
      </div>
    );
  };

  const tlsMode = Number(settings.tls ?? (protocol === 'trojan' ? 1 : 0));
  const vlessFlow = String(settings.flow ?? '');
  const isDeprecatedFlow =
    vlessFlow === 'xtls-rprx-direct' || vlessFlow === 'xtls-rprx-splice';
  const hy2Bw = settings.bandwidth as { up?: number | null; down?: number | null } | undefined;
  const hasHy2Bandwidth = Number(hy2Bw?.up || 0) > 0 || Number(hy2Bw?.down || 0) > 0;

  return (
    <div className="space-y-4">
      {/* Target Kernel selector only for protocols that don't embed TransportEditor */}
      {!hasTransport && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t('serverNode.targetKernel')}</Label>
          <Select value={kernel} onValueChange={(v) => handleKernelChange(v as TargetKernel)}>
            <SelectTrigger className="h-10 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="xray">Xray</SelectItem>
              <SelectItem value="singbox">Sing-box</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">{t('serverNode.kernelStandaloneHint')}</p>
        </div>
      )}

      {protocol === 'vless' && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t('serverNode.tlsSecurity')}</Label>
            <Select value={String(tlsMode)} onValueChange={(v) => patch({ tls: Number(v) })}>
              <SelectTrigger className="h-10 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">{t('serverNode.securityNone')}</SelectItem>
                <SelectItem value="1">TLS</SelectItem>
                <SelectItem value="2">Reality</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {tlsMode === 1 && renderTlsSettings(true)}
          {tlsMode === 2 && renderRealitySettings()}
          {renderUtlsSection()}
          {renderXrayFallback()}

          <TransportEditor
            kernel={kernel}
            network={String(settings.network ?? 'tcp')}
            networkSettings={
              (settings.network_settings as Record<string, unknown> | undefined) ?? {}
            }
            side={side}
            onChangeKernel={handleKernelChange}
            onChangeNetwork={(net) => patch({ network: net })}
            onChangeSettings={(ns) => patch({ network_settings: ns })}
            onDraftInvalidChange={(inv) => {
              onDraftInvalidChange?.(inv);
            }}
          />

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Flow</Label>
            <Select
              value={vlessFlow || 'none'}
              onValueChange={(v) => patch({ flow: v === 'none' ? '' : v })}
            >
              <SelectTrigger className="h-10 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('serverNode.securityNone')}</SelectItem>
                <SelectItem value="xtls-rprx-vision">xtls-rprx-vision</SelectItem>
                {isDeprecatedFlow && (
                  <SelectItem value={vlessFlow} disabled>
                    {vlessFlow} (Deprecated)
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {isDeprecatedFlow && (
            <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{t('serverNode.deprecatedFlowWarning', { flow: vlessFlow })}</span>
            </div>
          )}

          {/* VLESS Extra Encryption */}
          <div className="space-y-3 rounded-lg border bg-[var(--xb-panel)] p-4">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">{t('serverNode.vlessEncryption')}</Label>
              <Switch
                checked={Boolean((settings.encryption as { enabled?: boolean })?.enabled)}
                onCheckedChange={(checked) => patchNested('encryption', { enabled: checked })}
              />
            </div>
            {Boolean((settings.encryption as { enabled?: boolean })?.enabled) && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {side !== 'server' && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Encryption (Client)</Label>
                    <Input
                      className="h-10 font-mono text-xs"
                      value={String(
                        (settings.encryption as { encryption?: string })?.encryption ?? '',
                      )}
                      onChange={(e) => patchNested('encryption', { encryption: e.target.value })}
                    />
                  </div>
                )}
                {side !== 'client' && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Decryption (Server)</Label>
                    <Input
                      className="h-10 font-mono text-xs"
                      value={String(
                        (settings.encryption as { decryption?: string })?.decryption ?? '',
                      )}
                      onChange={(e) => patchNested('encryption', { decryption: e.target.value })}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {protocol === 'vmess' && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t('serverNode.tlsSecurity')}</Label>
            <Select value={String(tlsMode)} onValueChange={(v) => patch({ tls: Number(v) })}>
              <SelectTrigger className="h-10 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">{t('serverNode.securityNone')}</SelectItem>
                <SelectItem value="1">TLS</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {tlsMode === 1 && renderTlsSettings(true)}
          {renderUtlsSection()}
          <TransportEditor
            kernel={kernel}
            network={String(settings.network ?? 'tcp')}
            networkSettings={
              (settings.network_settings as Record<string, unknown> | undefined) ?? {}
            }
            side={side}
            onChangeKernel={handleKernelChange}
            onChangeNetwork={(net) => patch({ network: net })}
            onChangeSettings={(ns) => patch({ network_settings: ns })}
            onDraftInvalidChange={(inv) => {
              onDraftInvalidChange?.(inv);
            }}
          />
        </>
      )}

      {protocol === 'trojan' && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t('serverNode.tlsSecurity')}</Label>
            <Select value={String(tlsMode)} onValueChange={(v) => patch({ tls: Number(v) })}>
              <SelectTrigger className="h-10 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {side !== 'server' && (
                  <SelectItem value="0">{t('serverNode.securityNone')}</SelectItem>
                )}
                <SelectItem value="1">TLS</SelectItem>
                <SelectItem value="2">Reality</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {tlsMode === 1 && renderTlsSettings(true)}
          {tlsMode === 2 && renderRealitySettings()}
          {renderUtlsSection()}
          {renderXrayFallback()}
          <TransportEditor
            kernel={kernel}
            network={String(settings.network ?? 'tcp')}
            networkSettings={
              (settings.network_settings as Record<string, unknown> | undefined) ?? {}
            }
            side={side}
            onChangeKernel={handleKernelChange}
            onChangeNetwork={(net) => patch({ network: net })}
            onChangeSettings={(ns) => patch({ network_settings: ns })}
            onDraftInvalidChange={(inv) => {
              onDraftInvalidChange?.(inv);
            }}
          />
        </>
      )}

      {protocol === 'shadowsocks' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t('serverNode.cipher')}</Label>
              <Select
                value={String(settings.cipher || 'aes-128-gcm')}
                onValueChange={(v) => patch({ cipher: v })}
              >
                <SelectTrigger className="h-10 font-mono text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {settings.cipher === '2022-blake3-chacha20-poly1305' && (
                    <SelectItem value="2022-blake3-chacha20-poly1305" disabled>2022-blake3-chacha20-poly1305 (single-user)</SelectItem>
                  )}
                  {SHADOWSOCKS_CIPHERS.map((c) => (
                    <SelectItem key={c} value={c} className="font-mono text-xs">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t('serverNode.obfs')}</Label>
              <Select
                value={String(settings.obfs || 'none')}
                onValueChange={(v) => patch({ obfs: v === 'none' ? '' : v })}
              >
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('serverNode.securityNone')}</SelectItem>
                  <SelectItem value="http">HTTP</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {settings.obfs === 'http' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Obfs Host</Label>
                <Input
                  className="h-10 font-mono text-xs"
                  value={String((settings.obfs_settings as { host?: string })?.host ?? '')}
                  onChange={(e) => patchNested('obfs_settings', { host: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Obfs Path</Label>
                <Input
                  className="h-10 font-mono text-xs"
                  value={String((settings.obfs_settings as { path?: string })?.path ?? '')}
                  onChange={(e) => patchNested('obfs_settings', { path: e.target.value })}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Plugin</Label>
              <Select
                value={String(settings.plugin || 'none')}
                onValueChange={(v) => patch({ plugin: v === 'none' ? '' : v })}
              >
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SHADOWSOCKS_PLUGINS.map((p) => (
                    <SelectItem key={p || 'none'} value={p || 'none'}>
                      {p || 'None'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {Boolean(settings.plugin) && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Plugin Options</Label>
                <Input
                  className="h-10 font-mono text-xs"
                  value={String(settings.plugin_opts ?? '')}
                  onChange={(e) => patch({ plugin_opts: e.target.value })}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {protocol === 'hysteria' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t('serverNode.version')}</Label>
              <Select
                value={String(settings.version ?? 2)}
                onValueChange={(v) => patch({ version: Number(v) })}
              >
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">Hysteria v2</SelectItem>
                  <SelectItem value="1">Hysteria v1</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t('serverNode.upMbps')}</Label>
              <Input
                type="number"
                min={0}
                className="h-10 font-mono text-xs"
                value={hy2Bw?.up ?? ''}
                onChange={(e) =>
                  patchNested('bandwidth', {
                    up: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
                placeholder="BBR / Auto"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t('serverNode.downMbps')}</Label>
              <Input
                type="number"
                min={0}
                className="h-10 font-mono text-xs"
                value={hy2Bw?.down ?? ''}
                onChange={(e) =>
                  patchNested('bandwidth', {
                    down: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
                placeholder="BBR / Auto"
              />
            </div>
          </div>

          {Number(settings.version ?? 2) === 2 && (
            <div className="space-y-3 rounded-lg border bg-[var(--xb-panel)] p-4">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">{t('serverNode.hy2Obfs')}</Label>
                <Switch
                  checked={Boolean((settings.obfs as { open?: boolean })?.open)}
                  onCheckedChange={(checked) => patchNested('obfs', { open: checked })}
                />
              </div>
              {Boolean((settings.obfs as { open?: boolean })?.open) && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Select
                    value={String((settings.obfs as { type?: string })?.type || 'salamander')}
                    onValueChange={(v) => patchNested('obfs', { type: v })}
                  >
                    <SelectTrigger className="h-10 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="salamander">salamander</SelectItem>
                      <SelectItem value="gecko">gecko</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    className="h-10 font-mono text-xs"
                    value={String((settings.obfs as { password?: string })?.password ?? '')}
                    onChange={(e) => patchNested('obfs', { password: e.target.value })}
                    placeholder={t('serverNode.obfsPasswordPlaceholder')}
                  />
                </div>
              )}
            </div>
          )}

          {renderTlsSettings(false)}

          {Number(settings.version ?? 2) === 2 && side !== 'client' && (
            <Hy2MasqueradeEditor
              kernel={kernel}
              hy2Settings={(settings.hy2_settings as Record<string, unknown> | undefined) ?? {}}
              hasBandwidth={hasHy2Bandwidth}
              onChange={(hy2) => patch({ hy2_settings: hy2 })}
              onDraftInvalidChange={(inv) => {
                onDraftInvalidChange?.(inv);
              }}
            />
          )}
          {Number(settings.version ?? 2) === 2 && side === 'client' && (
            <p className="text-xs text-muted-foreground">
              {t('serverNode.hy2MasqueradeInCdnHint')}
            </p>
          )}
        </div>
      )}

      {protocol === 'tuic' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t('serverNode.version')}</Label>
              <Select
                value={String(settings.version ?? 5)}
                onValueChange={(v) => patch({ version: Number(v) })}
              >
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">TUIC v5</SelectItem>
                  <SelectItem value="4">TUIC v4</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {t('serverNode.congestionControl')}
              </Label>
              <Select
                value={String(settings.congestion_control || 'bbr')}
                onValueChange={(v) => patch({ congestion_control: v })}
              >
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bbr">bbr</SelectItem>
                  <SelectItem value="cubic">cubic</SelectItem>
                  <SelectItem value="new_reno">new_reno</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">UDP Relay Mode</Label>
              <Select
                value={String(settings.udp_relay_mode || 'native')}
                onValueChange={(v) => patch({ udp_relay_mode: v })}
              >
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="native">native</SelectItem>
                  <SelectItem value="quic">quic</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">ALPN</Label>
            <div className="flex flex-wrap gap-4 rounded-lg border bg-[var(--input-bg)] px-3.5 py-2.5">
              {TUIC_ALPN_OPTIONS.map((alpn) => {
                const current = Array.isArray(settings.alpn)
                  ? (settings.alpn as string[])
                  : ['h3'];
                const checked = current.includes(alpn);
                return (
                  <label key={alpn} className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(c) => {
                        const next = c
                          ? [...current, alpn]
                          : current.filter((item) => item !== alpn);
                        patch({ alpn: next });
                      }}
                    />
                    <span className="font-mono">{alpn}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {renderTlsSettings(false)}
        </div>
      )}

      {protocol === 'anytls' && (
        <div className="space-y-4">
          {renderTlsSettings(false)}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Padding Scheme</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => patch({ padding_scheme: [...ANYTLS_DEFAULT_PADDING] })}
              >
                <RotateCcw className="h-3 w-3" />
                {t('serverNode.resetDefault')}
              </Button>
            </div>
            <Textarea
              rows={5}
              className="font-mono text-xs"
              value={
                Array.isArray(settings.padding_scheme)
                  ? (settings.padding_scheme as string[]).join('\n')
                  : ANYTLS_DEFAULT_PADDING.join('\n')
              }
              onChange={(e) =>
                patch({
                  padding_scheme: e.target.value
                    .split(/\r?\n/)
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </div>
        </div>
      )}

      {(protocol === 'socks' || protocol === 'naive' || protocol === 'http') && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t('serverNode.tlsSecurity')}</Label>
            <Select
              value={String(Number(settings.tls ?? 0))}
              onValueChange={(v) => patch({ tls: Number(v) })}
            >
              <SelectTrigger className="h-10 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">{t('serverNode.securityNone')}</SelectItem>
                <SelectItem value="1">TLS</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {Number(settings.tls ?? 0) === 1 && renderTlsSettings(false)}
        </div>
      )}

      {protocol === 'mieru' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Transport</Label>
            <Select
              value={String(settings.transport || 'TCP')}
              onValueChange={(v) => patch({ transport: v })}
            >
              <SelectTrigger className="h-10 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TCP">TCP</SelectItem>
                <SelectItem value="UDP">UDP</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Traffic Pattern</Label>
            <Input
              className="h-10 font-mono text-xs"
              value={String(settings.traffic_pattern ?? '')}
              onChange={(e) => patch({ traffic_pattern: e.target.value })}
              placeholder="Optional"
            />
          </div>
        </div>
      )}
    </div>
  );
}
