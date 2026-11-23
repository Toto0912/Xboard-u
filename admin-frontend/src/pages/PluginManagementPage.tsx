import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ArrowUpCircle,
  BookText,
  Download,
  Loader2,
  Plug,
  Search,
  Settings,
  Shield,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  deletePlugin,
  disablePlugin,
  enablePlugin,
  getPluginConfig,
  getPlugins,
  getPluginTypes,
  installPlugin,
  uninstallPlugin,
  updatePluginConfig,
  upgradePlugin,
  uploadPlugin,
  type PluginItem,
} from '@/api/plugin';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import {
  DynamicConfigFields,
  type DynamicFieldSchema,
} from '@/components/shared/DynamicConfigFields';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function PluginManagementPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [configPlugin, setConfigPlugin] = useState<PluginItem | null>(null);
  const [configSchema, setConfigSchema] = useState<Record<string, DynamicFieldSchema>>({});
  const [configValues, setConfigValues] = useState<Record<string, unknown>>({});
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [readmePlugin, setReadmePlugin] = useState<PluginItem | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'uninstall' | 'delete';
    plugin: PluginItem;
  } | null>(null);

  const typesQuery = useQuery({
    queryKey: ['admin-plugin-types'],
    queryFn: getPluginTypes,
  });

  const pluginsQuery = useQuery({
    queryKey: ['admin-plugins', typeFilter],
    queryFn: () => getPlugins(typeFilter),
  });

  const invalidatePlugins = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-plugins'] });
  };

  const actionMutation = useMutation({
    mutationFn: async (action: { kind: string; code: string }) => {
      switch (action.kind) {
        case 'install':
          return installPlugin(action.code);
        case 'uninstall':
          return uninstallPlugin(action.code);
        case 'enable':
          return enablePlugin(action.code);
        case 'disable':
          return disablePlugin(action.code);
        case 'upgrade':
          return upgradePlugin(action.code);
        case 'delete':
          return deletePlugin(action.code);
      }
    },
    onSuccess: () => {
      toast.success(t('common.operationSuccess'));
      setConfirmAction(null);
      invalidatePlugins();
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadPlugin(file),
    onSuccess: () => {
      toast.success(t('plugin.uploadSuccess'));
      invalidatePlugins();
    },
  });

  const saveConfigMutation = useMutation({
    mutationFn: () => {
      if (!configPlugin) return Promise.resolve();
      return updatePluginConfig(configPlugin.code, configValues);
    },
    onSuccess: () => {
      toast.success(t('common.saveSuccess'));
      setConfigPlugin(null);
      invalidatePlugins();
    },
  });

  const openConfigDialog = async (plugin: PluginItem) => {
    setConfigPlugin(plugin);
    setLoadingConfig(true);
    try {
      const schema = await getPluginConfig(plugin.code);
      setConfigSchema(schema);
      const initial: Record<string, unknown> = {};
      for (const [k, field] of Object.entries(schema)) {
        initial[k] = field.value ?? '';
      }
      setConfigValues(initial);
    } catch {
      setConfigPlugin(null);
    } finally {
      setLoadingConfig(false);
    }
  };

  const filteredPlugins = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = pluginsQuery.data ?? [];
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q),
    );
  }, [pluginsQuery.data, search]);

  const hasConfigFields = (p: PluginItem) =>
    p.config && !Array.isArray(p.config) && Object.keys(p.config).length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('nav.pluginManagement')}</h1>
          <p className="text-sm text-muted-foreground">{t('plugin.subtitle')}</p>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadMutation.mutate(file);
              e.target.value = '';
            }}
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
          >
            {uploadMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {t('plugin.upload')}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={typeFilter} onValueChange={setTypeFilter}>
          <TabsList>
            <TabsTrigger value="all">{t('common.all')}</TabsTrigger>
            {(typesQuery.data ?? []).map((pt) => (
              <TabsTrigger key={pt.value} value={pt.value}>
                {pt.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('plugin.searchPlaceholder')}
            className="pl-8"
          />
        </div>
      </div>

      {pluginsQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-44 w-full" />
        </div>
      ) : filteredPlugins.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-14 text-muted-foreground">
            <Plug className="h-8 w-8 opacity-40" />
            <p className="text-sm">{t('plugin.empty')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredPlugins.map((plugin) => (
            <Card key={plugin.code} className="flex flex-col justify-between">
              <CardHeader className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <span className="truncate">{plugin.name}</span>
                      {plugin.is_protected && (
                        <Shield className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                    </CardTitle>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="font-mono">{plugin.code}</span>
                      <span>·</span>
                      <span>v{plugin.version}</span>
                      {plugin.author && (
                        <>
                          <span>·</span>
                          <span>{plugin.author}</span>
                        </>
                      )}
                    </div>
                  </div>
                  {plugin.is_installed && (
                    <Switch
                      checked={Boolean(plugin.is_enabled)}
                      disabled={actionMutation.isPending}
                      onCheckedChange={(checked) =>
                        actionMutation.mutate({
                          kind: checked ? 'enable' : 'disable',
                          code: plugin.code,
                        })
                      }
                    />
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline">{plugin.type}</Badge>
                  {plugin.is_installed ? (
                    <Badge variant={plugin.is_enabled ? 'success' : 'secondary'}>
                      {plugin.is_enabled ? t('plugin.enabled') : t('plugin.disabled')}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">{t('plugin.notInstalled')}</Badge>
                  )}
                  {plugin.need_upgrade && (
                    <Badge variant="default">{t('plugin.upgradeAvailable')}</Badge>
                  )}
                </div>

                <CardDescription className="line-clamp-2 min-h-[2.5rem]">
                  {plugin.description || t('plugin.noDescription')}
                </CardDescription>
              </CardHeader>

              <CardContent className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {!plugin.is_installed ? (
                    <Button
                      size="sm"
                      disabled={actionMutation.isPending}
                      onClick={() =>
                        actionMutation.mutate({ kind: 'install', code: plugin.code })
                      }
                    >
                      <Download className="h-3.5 w-3.5" />
                      {t('plugin.install')}
                    </Button>
                  ) : (
                    <>
                      {hasConfigFields(plugin) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void openConfigDialog(plugin)}
                        >
                          <Settings className="h-3.5 w-3.5" />
                          {t('plugin.configure')}
                        </Button>
                      )}
                      {plugin.need_upgrade && (
                        <Button
                          size="sm"
                          disabled={actionMutation.isPending}
                          onClick={() =>
                            actionMutation.mutate({ kind: 'upgrade', code: plugin.code })
                          }
                        >
                          <ArrowUpCircle className="h-3.5 w-3.5" />
                          {t('plugin.upgrade')}
                        </Button>
                      )}
                      {!plugin.is_enabled && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmAction({ type: 'uninstall', plugin })}
                        >
                          {t('plugin.uninstall')}
                        </Button>
                      )}
                    </>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {plugin.readme && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setReadmePlugin(plugin)}
                      title="README"
                    >
                      <BookText className="h-4 w-4" />
                    </Button>
                  )}
                  {plugin.can_be_deleted && !plugin.is_installed && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setConfirmAction({ type: 'delete', plugin })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Plugin Config Dialog */}
      <Dialog open={Boolean(configPlugin)} onOpenChange={(open) => !open && setConfigPlugin(null)}>
        <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{configPlugin?.name}</DialogTitle>
            <DialogDescription>{t('plugin.configDesc')}</DialogDescription>
          </DialogHeader>
          {loadingConfig ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                saveConfigMutation.mutate();
              }}
            >
              <DynamicConfigFields
                schema={configSchema}
                values={configValues}
                onChange={(k, v) => setConfigValues((prev) => ({ ...prev, [k]: v }))}
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfigPlugin(null)}
                >
                  {t('common.cancel')}
                </Button>
                <Button type="submit" disabled={saveConfigMutation.isPending}>
                  {saveConfigMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t('common.save')}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* README Dialog */}
      <Dialog open={Boolean(readmePlugin)} onOpenChange={(open) => !open && setReadmePlugin(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{readmePlugin?.name} — README</DialogTitle>
          </DialogHeader>
          <pre className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-4 text-xs leading-relaxed">
            {readmePlugin?.readme}
          </pre>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(confirmAction)}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title={
          confirmAction?.type === 'delete'
            ? t('plugin.deleteTitle')
            : t('plugin.uninstallTitle')
        }
        description={
          confirmAction?.type === 'delete'
            ? t('plugin.deleteDesc', { name: confirmAction.plugin.name })
            : t('plugin.uninstallDesc', { name: confirmAction?.plugin.name ?? '' })
        }
        loading={actionMutation.isPending}
        onConfirm={() =>
          confirmAction &&
          actionMutation.mutate({
            kind: confirmAction.type,
            code: confirmAction.plugin.code,
          })
        }
      />
    </div>
  );
}
