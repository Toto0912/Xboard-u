import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeftRight,
  ChevronDown,
  Loader2,
  Plus,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ServerGroupItem } from '@/api/serverGroup';
import type { ServerMachineItem } from '@/api/serverMachine';
import {
  normalizeNumericIds,
  saveServerNode,
  type CdnSettings,
  type CertConfig,
  type RateTimeRange,
  type ServerNodeItem,
  type ServerProtocolType,
} from '@/api/serverNode';
import type { ServerRouteItem } from '@/api/serverRoute';
import { AdvancedSettingsDialog } from '@/components/server/AdvancedSettingsDialog';
import { ProtocolFields } from '@/components/server/ProtocolFields';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { TimePicker } from '@/components/shared/DateTimePicker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  defaultProtocolSettings,
  inferTargetKernel,
  isMultiPortRange,
  parsePortRange,
  PROTOCOL_LIST,
  PROTOCOL_MAP,
} from '@/lib/serverPresets';

function bytesToGbInput(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '';
  const gb = bytes / 1073741824;
  return gb >= 0.01 ? String(Number(gb.toFixed(2))) : String(Number(gb.toFixed(6)));
}

interface NodeEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: ServerNodeItem | null;
  openAdvancedOnStart?: boolean;
  allNodes: ServerNodeItem[];
  groups: ServerGroupItem[];
  routes: ServerRouteItem[];
  machines: ServerMachineItem[];
}

export function NodeEditorDialog({
  open,
  onOpenChange,
  editing,
  openAdvancedOnStart = false,
  allNodes,
  groups,
  routes,
  machines,
}: NodeEditorDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [protocol, setProtocol] = useState<ServerProtocolType>('vless');
  const [pendingProtocol, setPendingProtocol] = useState<ServerProtocolType | null>(null);
  const [name, setName] = useState('');
  const [rate, setRate] = useState('1');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [serverPort, setServerPort] = useState('');
  const [hopIntervalRaw, setHopIntervalRaw] = useState('');
  const [protocolSettings, setProtocolSettings] = useState<Record<string, unknown>>({});
  const [draftInvalid, setDraftInvalid] = useState(false);

  const [cdnSettings, setCdnSettings] = useState<CdnSettings>({ enabled: false });
  const [certConfig, setCertConfig] = useState<CertConfig>({});
  const [customOutbounds, setCustomOutbounds] = useState<Array<Record<string, unknown>>>([]);
  const [customRoutes, setCustomRoutes] = useState<Array<Record<string, unknown>>>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // More Node Attributes
  const [rateTimeEnable, setRateTimeEnable] = useState(false);
  const [rateTimeRanges, setRateTimeRanges] = useState<RateTimeRange[]>([]);
  const [transferEnableGb, setTransferEnableGb] = useState('');
  const [transferDirty, setTransferDirty] = useState(false);
  const [code, setCode] = useState('');
  const [groupIds, setGroupIds] = useState<number[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  // Assignment & Deployment
  const [machineId, setMachineId] = useState<number | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [parentId, setParentId] = useState<number | null>(null);
  const [routeIds, setRouteIds] = useState<number[]>([]);
  const [show, setShow] = useState(true);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setProtocol(editing.type);
      setName(editing.name ?? '');
      setRate(String(editing.rate ?? '1'));
      setHost(editing.host ?? '');
      setPort(String(editing.port ?? ''));
      setServerPort(String(editing.server_port ?? ''));
      const ps = JSON.parse(JSON.stringify(editing.protocol_settings ?? {})) as Record<
        string,
        unknown
      >;
      setProtocolSettings(ps);
      const minHop = ps.hop_interval;
      const maxHop = ps.hop_interval_max;
      setHopIntervalRaw(
        minHop != null && minHop !== ''
          ? Number(maxHop) > Number(minHop)
            ? `${minHop}-${maxHop}`
            : String(minHop)
          : '',
      );
      setCdnSettings(
        JSON.parse(JSON.stringify(editing.cdn_settings ?? { enabled: false })) as CdnSettings,
      );
      setCertConfig(JSON.parse(JSON.stringify(editing.cert_config ?? {})) as CertConfig);
      setCustomOutbounds(
        JSON.parse(JSON.stringify(editing.custom_outbounds ?? [])) as Array<
          Record<string, unknown>
        >,
      );
      setCustomRoutes(
        JSON.parse(JSON.stringify(editing.custom_routes ?? [])) as Array<
          Record<string, unknown>
        >,
      );
      setRateTimeEnable(Boolean(editing.rate_time_enable));
      setRateTimeRanges(editing.rate_time_ranges ?? []);
      setTransferEnableGb(bytesToGbInput(editing.transfer_enable));
      setTransferDirty(false);
      setCode(editing.code ?? '');
      setGroupIds(normalizeNumericIds(editing.group_ids));
      setTags(editing.tags ?? []);
      setMachineId(editing.machine_id ?? null);
      setEnabled(editing.enabled !== undefined ? Boolean(editing.enabled) : true);
      setParentId(editing.parent_id ?? null);
      setRouteIds(normalizeNumericIds(editing.route_ids));
      setShow(Boolean(editing.show));
      setAdvancedOpen(openAdvancedOnStart);
    } else {
      setProtocol('vless');
      setName('');
      setRate('1');
      setHost('');
      setPort('443');
      setServerPort('443');
      setHopIntervalRaw('');
      setProtocolSettings(defaultProtocolSettings('vless'));
      setCdnSettings({ enabled: false });
      setCertConfig({});
      setCustomOutbounds([]);
      setCustomRoutes([]);
      setRateTimeEnable(false);
      setRateTimeRanges([]);
      setTransferEnableGb('');
      setTransferDirty(false);
      setCode('');
      setGroupIds([]);
      setTags([]);
      setMachineId(null);
      setEnabled(true);
      setParentId(null);
      setRouteIds([]);
      setShow(true);
      setAdvancedOpen(false);
    }
    setTagInput('');
    setDraftInvalid(false);
    setPendingProtocol(null);
  }, [open, editing, openAdvancedOnStart]);

  const parentCandidates = useMemo(
    () =>
      allNodes.filter(
        (n) => (!n.parent_id || n.parent_id === 0) && n.type === protocol && n.id !== editing?.id,
      ),
    [allNodes, protocol, editing?.id],
  );

  const saveMutation = useMutation({
    mutationFn: saveServerNode,
    onSuccess: () => {
      toast.success(t('common.saveSuccess'));
      void queryClient.invalidateQueries({ queryKey: ['server-nodes'] });
      onOpenChange(false);
    },
  });

  const switchProtocol = (next: ServerProtocolType, clearCdn = false) => {
    setDraftInvalid(false);
    setProtocol(next);
    setProtocolSettings(defaultProtocolSettings(next));
    setHopIntervalRaw('');
    setParentId(null);
    if (clearCdn) {
      setCdnSettings({ enabled: false });
    }
  };

  const handleProtocolChange = (next: ServerProtocolType) => {
    if (next === protocol) return;
    if (cdnSettings.server) {
      setPendingProtocol(next);
      return;
    }
    switchProtocol(next, false);
  };

  const isHy2V2 = protocol === 'hysteria' && Number(protocolSettings.version ?? 2) === 2;
  const hy2PortHopEnabled = isHy2V2 && isMultiPortRange(port);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (draftInvalid) {
      toast.error(t('serverNode.fixDraftErrorsFirst'));
      return;
    }
    if (!name.trim() || !host.trim() || !String(port).trim() || !String(serverPort).trim()) {
      toast.error(t('serverNode.requiredFieldsError'));
      return;
    }

    const ps = JSON.parse(JSON.stringify(protocolSettings ?? {})) as Record<string, unknown>;
    delete ps.hy2_draft_invalid;
    ps.target_kernel = inferTargetKernel(protocol, ps);

    if (isHy2V2) {
      if (hopIntervalRaw.trim()) {
        const range = parsePortRange(hopIntervalRaw.trim());
        const match = /^(\d{1,10})(?:-(\d{1,10}))?$/.exec(hopIntervalRaw.trim());
        const min = match ? Number(match[1]) : 0;
        const max = match?.[2] ? Number(match[2]) : min;
        if (!match || min < 5 || max < min || (!range && max > 2147483647)) {
          toast.error(t('serverNode.hopIntervalError'));
          return;
        }
        ps.hop_interval = min;
        ps.hop_interval_max = max > min ? max : null;
      } else {
        ps.hop_interval = null;
        ps.hop_interval_max = null;
      }

      const hy2 = (ps.hy2_settings as Record<string, unknown> | undefined) ?? {};
      if (isMultiPortRange(serverPort)) {
        hy2.port_range = String(serverPort).trim();
      } else {
        delete hy2.port_range;
      }
      hy2.kernel = ps.target_kernel;
      hy2.bandwidth_mode = 'auto';
      ps.hy2_settings = hy2;
    }

    let transferBytes = 0;
    if (editing && !transferDirty) {
      transferBytes = Math.max(0, Math.round(Number(editing.transfer_enable ?? 0)));
    } else {
      const gbNum = parseFloat(transferEnableGb || '0');
      transferBytes = Number.isFinite(gbNum) && gbNum > 0 ? Math.round(gbNum * 1073741824) : 0;
    }

    const payload: Record<string, unknown> = {
      ...(editing ? { id: editing.id } : {}),
      type: protocol,
      name: name.trim(),
      rate: Number(rate) >= 0 ? Number(rate) : 1,
      rate_time_enable: rateTimeEnable,
      rate_time_ranges: rateTimeEnable ? rateTimeRanges : [],
      host: host.trim(),
      port: String(port).trim(),
      server_port: String(serverPort).trim(),
      protocol_settings: ps,
      cert_config: certConfig ?? {},
      custom_outbounds: customOutbounds ?? [],
      custom_routes: customRoutes ?? [],
      transfer_enable: transferBytes,
      code: code.trim() || null,
      group_ids: normalizeNumericIds(groupIds),
      tags,
      machine_id: machineId,
      enabled,
      parent_id: parentId,
      route_ids: normalizeNumericIds(routeIds),
      show: show ? 1 : 0,
    };

    if (cdnSettings.server) {
      const settings = { ...cdnSettings.server.protocol_settings };
      delete settings.hy2_draft_invalid;
      payload.cdn_settings = {
        enabled: Boolean(cdnSettings.enabled),
        type: protocol,
        server: { ...cdnSettings.server, protocol_settings: settings },
      };
    } else if (editing?.cdn_settings) {
      payload.cdn_settings = { enabled: false };
    }

    saveMutation.mutate(payload);
  };

  const addTag = () => {
    const val = tagInput.trim();
    if (!val) return;
    if (!tags.includes(val)) setTags([...tags, val]);
    setTagInput('');
  };

  const cdnEnabled = Boolean(cdnSettings.enabled);
  const displayServerPort = cdnEnabled
    ? String(cdnSettings.server?.server_port ?? serverPort)
    : serverPort;

  const hasAdvancedBadges =
    cdnEnabled ||
    Boolean(certConfig.cert_mode && certConfig.cert_mode !== 'none') ||
    customOutbounds.length > 0 ||
    customRoutes.length > 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[calc(100dvh-48px)] w-[min(920px,calc(100vw-40px))] max-w-[920px] flex-col gap-0 overflow-hidden rounded-[15px] bg-[var(--xb-surface)] p-0">
          {/* Fixed Header matching xb-node-head */}
          <div className="shrink-0 border-b bg-[var(--xb-heading)] px-7 pb-5 pt-6 pr-12">
            <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.17em] text-muted-foreground">
              NODE CONFIGURATION
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <DialogTitle className="text-xl font-semibold tracking-tight">
                  {editing ? t('serverNode.editTitle') : t('serverNode.createTitle')}
                </DialogTitle>
                <Badge
                  variant="outline"
                  className={PROTOCOL_MAP[protocol]?.badgeClass ?? 'text-xs'}
                >
                  {PROTOCOL_MAP[protocol]?.label ?? protocol}
                </Badge>
              </div>
              <Select
                value={protocol}
                onValueChange={(v) => handleProtocolChange(v as ServerProtocolType)}
              >
                <SelectTrigger className="h-9 w-[156px] border-[var(--xb-border-accent)] bg-[var(--xb-accent-soft)] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROTOCOL_LIST.map((p) => (
                    <SelectItem key={p.type} value={p.type}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogDescription className="mt-2 text-xs text-muted-foreground">
              {t('serverNode.dialogDescription')}
            </DialogDescription>
          </div>

          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            {/* Scrollable Body */}
            <div className="flex-1 space-y-6 overflow-y-auto px-7 py-6">
              {/* Basic Section */}
              <div className="space-y-4 border-b pb-6">
                <div className="flex flex-col gap-4 sm:flex-row">
                  <div className="flex-[2] space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{t('serverNode.name')}</Label>
                    <Input
                      className="h-10 text-xs"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={t('serverNode.namePlaceholder')}
                    />
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{t('serverNode.rate')}</Label>
                    <div className="relative flex items-center">
                      <Input
                        type="number"
                        min={0}
                        step="0.1"
                        className="h-10 pr-8 font-mono text-xs"
                        value={rate}
                        onChange={(e) => setRate(e.target.value)}
                      />
                      <span className="pointer-events-none absolute right-3 text-xs text-muted-foreground">
                        x
                      </span>
                    </div>
                  </div>
                </div>

                {/* Collapsible More Attributes */}
                <details className="group rounded-lg border bg-[var(--xb-panel)]">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs">
                    <span className="font-medium">{t('serverNode.moreAttributesTitle')}</span>
                    <small className="text-[11px] text-muted-foreground">
                      {t('serverNode.moreAttributesHint')}
                    </small>
                    <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="space-y-4 border-t p-4">
                    <div className="flex items-center justify-between rounded-lg border bg-[var(--input-bg)] px-3.5 py-2.5">
                      <div>
                        <Label className="text-xs font-medium">{t('serverNode.dynamicRate')}</Label>
                        <p className="text-[11px] text-muted-foreground">
                          {t('serverNode.dynamicRateHint')}
                        </p>
                      </div>
                      <Switch checked={rateTimeEnable} onCheckedChange={setRateTimeEnable} />
                    </div>

                    {rateTimeEnable && (
                      <div className="space-y-2 rounded-lg border bg-[var(--input-bg)] p-3">
                        {rateTimeRanges.map((r, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <TimePicker
                              className="w-28"
                              value={r.start}
                              onChange={(val) => {
                                const next = [...rateTimeRanges];
                                next[idx] = { ...r, start: val };
                                setRateTimeRanges(next);
                              }}
                            />
                            <span className="text-xs text-muted-foreground">→</span>
                            <TimePicker
                              className="w-28"
                              value={r.end}
                              onChange={(val) => {
                                const next = [...rateTimeRanges];
                                next[idx] = { ...r, end: val };
                                setRateTimeRanges(next);
                              }}
                            />
                            <Input
                              type="number"
                              step="0.1"
                              min={0}
                              className="h-8 w-24 font-mono text-xs"
                              value={r.rate}
                              onChange={(e) => {
                                const next = [...rateTimeRanges];
                                next[idx] = { ...r, rate: Number(e.target.value) };
                                setRateTimeRanges(next);
                              }}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setRateTimeRanges(rateTimeRanges.filter((_, i) => i !== idx))
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        ))}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() =>
                            setRateTimeRanges([
                              ...rateTimeRanges,
                              { start: '00:00', end: '06:00', rate: 0.5 },
                            ])
                          }
                        >
                          <Plus className="h-3 w-3" />
                          {t('serverNode.addTimeRange')}
                        </Button>
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">
                          {t('serverNode.trafficLimitGb')}
                        </Label>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          className="h-10 font-mono text-xs"
                          value={transferEnableGb}
                          onChange={(e) => {
                            setTransferEnableGb(e.target.value);
                            setTransferDirty(true);
                          }}
                          placeholder={t('serverNode.unlimitedPlaceholder')}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">
                          {t('serverNode.customCode')}
                        </Label>
                        <Input
                          className="h-10 font-mono text-xs"
                          value={code}
                          onChange={(e) => setCode(e.target.value)}
                          placeholder="Optional"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">{t('serverNode.tags')}</Label>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {tags.map((tag) => (
                          <Badge key={tag} variant="secondary" className="gap-1">
                            {tag}
                            <button
                              type="button"
                              onClick={() => setTags(tags.filter((item) => item !== tag))}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                        <div className="flex items-center gap-1.5">
                          <Input
                            className="h-8 w-44 text-xs"
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addTag();
                              }
                            }}
                            placeholder={t('serverNode.addTagPlaceholder')}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={addTag}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        {t('serverNode.groups')}
                      </Label>
                      <div className="flex flex-wrap gap-3 rounded-lg border bg-[var(--input-bg)] p-3">
                        {groups.length === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            {t('serverGroup.empty')}
                          </span>
                        ) : (
                          groups.map((g) => {
                            const checked = groupIds.includes(g.id);
                            return (
                              <label key={g.id} className="flex items-center gap-1.5 text-xs">
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(c) =>
                                    setGroupIds(
                                      c
                                        ? [...groupIds, g.id]
                                        : groupIds.filter((id) => id !== g.id),
                                    )
                                  }
                                />
                                <span>{g.name}</span>
                              </label>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                </details>
              </div>

              {/* Connection Section matching xb-connection-section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <span className="block text-[9px] font-medium uppercase tracking-[0.17em] text-muted-foreground">
                      CONNECTION
                    </span>
                    <h3 className="mt-1 text-[15px] font-semibold">
                      {t('serverNode.connectionHeading')}
                    </h3>
                  </div>
                  <Badge
                    variant="outline"
                    className="border-[var(--xb-border-accent)] bg-[var(--xb-accent-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--xb-accent)]"
                  >
                    {cdnEnabled
                      ? t('serverNode.clientSideBadge')
                      : t('serverNode.clientAndServerBadge')}
                  </Badge>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t('serverNode.host')}</Label>
                  <Input
                    className="h-10 font-mono text-xs"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="node.example.com"
                  />
                </div>

                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{t('serverNode.port')}</Label>
                    <Input
                      className="h-10 font-mono text-xs"
                      value={port}
                      onChange={(e) => setPort(e.target.value)}
                      placeholder={isHy2V2 ? '443 or 60000-65000' : '443'}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="mb-0.5 h-9 w-9 shrink-0 text-muted-foreground"
                    disabled={cdnEnabled}
                    onClick={() => port && setServerPort(port)}
                    title={t('serverNode.syncPortHint')}
                  >
                    <ArrowLeftRight className="h-4 w-4" />
                  </Button>
                  <div className="flex-1 space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      {t('serverNode.serverPort')}
                    </Label>
                    <Input
                      className="h-10 font-mono text-xs"
                      value={displayServerPort}
                      disabled={cdnEnabled}
                      onChange={(e) => setServerPort(e.target.value)}
                      placeholder={isHy2V2 ? '443 or 60000-65000' : '443'}
                    />
                  </div>
                </div>

                {cdnEnabled && (
                  <p className="text-[11px] text-muted-foreground">
                    {t('serverNode.cdnPortHint')}
                  </p>
                )}

                {isHy2V2 && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      {t('serverNode.hopIntervalLabel')}
                    </Label>
                    <Input
                      className="h-10 font-mono text-xs"
                      disabled={!hy2PortHopEnabled}
                      value={hopIntervalRaw}
                      onChange={(e) => setHopIntervalRaw(e.target.value)}
                      placeholder={t('serverNode.hopIntervalPlaceholder')}
                    />
                  </div>
                )}

                <ProtocolFields
                  protocol={protocol}
                  settings={protocolSettings}
                  side={cdnEnabled ? 'client' : 'shared'}
                  serverFallbackValue={String(
                    cdnSettings.server?.protocol_settings?.xray_fallback ?? '',
                  )}
                  onChange={setProtocolSettings}
                  onDraftInvalidChange={setDraftInvalid}
                />
              </div>

              {/* Collapsible Assignment & Deployment */}
              <details className="group rounded-lg border bg-[var(--xb-panel)]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs">
                  <span className="font-medium">{t('serverNode.deploymentTitle')}</span>
                  <small className="text-[11px] text-muted-foreground">
                    {t('serverNode.deploymentHint')}
                  </small>
                  <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="space-y-4 border-t p-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        {t('serverNode.parentNode')}
                      </Label>
                      <Select
                        value={parentId ? String(parentId) : '0'}
                        onValueChange={(v) => setParentId(v === '0' ? null : Number(v))}
                      >
                        <SelectTrigger className="h-10 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">{t('serverNode.noParent')}</SelectItem>
                          {parentCandidates.map((p) => (
                            <SelectItem key={p.id} value={String(p.id)}>
                              #{p.id} {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        {t('serverNode.machine')}
                      </Label>
                      <Select
                        value={machineId ? String(machineId) : 'none'}
                        onValueChange={(v) => setMachineId(v === 'none' ? null : Number(v))}
                      >
                        <SelectTrigger className="h-10 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t('serverNode.standalone')}</SelectItem>
                          {machines.map((m) => (
                            <SelectItem key={m.id} value={String(m.id)}>
                              #{m.id} {m.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{t('serverNode.routes')}</Label>
                    <div className="flex flex-wrap gap-3 rounded-lg border bg-[var(--input-bg)] p-3">
                      {routes.length === 0 ? (
                        <span className="text-xs text-muted-foreground">
                          {t('serverRoute.empty')}
                        </span>
                      ) : (
                        routes.map((r) => {
                          const checked = routeIds.includes(r.id);
                          return (
                            <label key={r.id} className="flex items-center gap-1.5 text-xs">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(c) =>
                                  setRouteIds(
                                    c
                                      ? [...routeIds, r.id]
                                      : routeIds.filter((id) => id !== r.id),
                                  )
                                }
                              />
                              <span>{r.remarks}</span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="flex items-center justify-between rounded-lg border bg-[var(--input-bg)] px-3.5 py-2.5">
                      <Label className="text-xs">{t('serverNode.showInSubscribe')}</Label>
                      <Switch checked={show} onCheckedChange={setShow} />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border bg-[var(--input-bg)] px-3.5 py-2.5">
                      <Label className="text-xs">{t('serverNode.nodeEnabled')}</Label>
                      <Switch checked={enabled} onCheckedChange={setEnabled} />
                    </div>
                  </div>
                </div>
              </details>
            </div>

            {/* Sticky Footer matching xb-node-footer with Advanced Settings button on left of Cancel/Save */}
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2.5 border-t bg-[var(--xb-heading)] px-7 py-4">
              <Button
                type="button"
                variant="outline"
                className="h-9 border-[var(--xb-border-accent)] bg-[var(--xb-accent-soft)] text-xs"
                onClick={() => setAdvancedOpen(true)}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {t('serverNode.advancedSettings')}
                {hasAdvancedBadges && (
                  <span className="ml-1 h-1.5 w-1.5 rounded-full bg-[var(--xb-accent)]" />
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-9 text-xs"
                onClick={() => onOpenChange(false)}
                disabled={saveMutation.isPending}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" className="h-9 px-5 text-xs" disabled={saveMutation.isPending}>
                {saveMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {t('serverNode.saveNode')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AdvancedSettingsDialog
        open={advancedOpen}
        onOpenChange={setAdvancedOpen}
        nodeName={name}
        protocol={protocol}
        clientHost={host}
        clientPort={port}
        clientServerPort={serverPort}
        clientProtocolSettings={protocolSettings}
        cdnSettings={cdnSettings}
        certConfig={certConfig}
        customOutbounds={customOutbounds}
        customRoutes={customRoutes}
        onApply={({
          cdnSettings: nextCdn,
          certConfig: nextCert,
          customOutbounds: nextOutbounds,
          customRoutes: nextRoutes,
          multiplex,
        }) => {
          setCdnSettings(nextCdn);
          setCertConfig(nextCert);
          setCustomOutbounds(nextOutbounds);
          setCustomRoutes(nextRoutes);
          if (multiplex !== undefined) {
            setProtocolSettings((prev) => ({ ...prev, multiplex }));
          }
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingProtocol)}
        onOpenChange={(o) => !o && setPendingProtocol(null)}
        title={t('serverNode.protocolSwitchTitle')}
        description={t('serverNode.protocolSwitchDesc')}
        onConfirm={() => {
          if (pendingProtocol) {
            switchProtocol(pendingProtocol, true);
            setPendingProtocol(null);
          }
        }}
      />
    </>
  );
}
