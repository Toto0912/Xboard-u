import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Check, Loader2, Palette, Settings, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  activateTheme,
  deleteTheme,
  getThemeConfig,
  getThemes,
  saveThemeConfig,
  uploadTheme,
  type ThemeInfo,
} from '@/api/theme';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

export default function ThemeConfigPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [configTheme, setConfigTheme] = useState<{ key: string; info: ThemeInfo } | null>(null);
  const [themeValues, setThemeValues] = useState<Record<string, unknown>>({});
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const themesQuery = useQuery({
    queryKey: ['admin-themes'],
    queryFn: getThemes,
  });

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-themes'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-config'] });
  };

  const activateMutation = useMutation({
    mutationFn: (name: string) => activateTheme(name),
    onSuccess: () => {
      toast.success(t('themePage.activated'));
      invalidateAll();
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadTheme(file),
    onSuccess: () => {
      toast.success(t('themePage.uploadSuccess'));
      invalidateAll();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (name: string) => deleteTheme(name),
    onSuccess: () => {
      toast.success(t('common.deleteSuccess'));
      setDeleting(null);
      invalidateAll();
    },
  });

  const saveConfigMutation = useMutation({
    mutationFn: () => {
      if (!configTheme) return Promise.resolve({});
      return saveThemeConfig(configTheme.key, themeValues);
    },
    onSuccess: () => {
      toast.success(t('common.saveSuccess'));
      setConfigTheme(null);
      invalidateAll();
    },
  });

  const openConfigDialog = async (key: string, info: ThemeInfo) => {
    setConfigTheme({ key, info });
    setLoadingConfig(true);
    try {
      const current = await getThemeConfig(key);
      const merged: Record<string, unknown> = { ...current };
      for (const field of info.configs ?? []) {
        if (merged[field.field_name] === undefined) {
          merged[field.field_name] = field.default_value ?? '';
        }
      }
      setThemeValues(merged);
    } catch {
      setConfigTheme(null);
    } finally {
      setLoadingConfig(false);
    }
  };

  const themes = Object.entries(themesQuery.data?.themes ?? {});
  const activeName = themesQuery.data?.active;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('nav.themeConfig')}</h1>
          <p className="text-sm text-muted-foreground">{t('themePage.subtitle')}</p>
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
            {t('themePage.upload')}
          </Button>
        </div>
      </div>

      {themesQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-52 w-full" />
          <Skeleton className="h-52 w-full" />
        </div>
      ) : themes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-14 text-muted-foreground">
            <Palette className="h-8 w-8 opacity-40" />
            <p className="text-sm">{t('themePage.empty')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {themes.map(([key, theme]) => {
            const isActive = activeName === key;
            return (
              <Card key={key} className="flex flex-col justify-between">
                <CardHeader className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{theme.name || key}</CardTitle>
                      <div className="mt-1 text-xs text-muted-foreground">
                        v{theme.version || '1.0.0'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline">
                        {theme.is_system ? t('themePage.system') : t('themePage.custom')}
                      </Badge>
                      {isActive && (
                        <Badge variant="success" className="gap-1">
                          <Check className="h-3 w-3" />
                          {t('themePage.active')}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <CardDescription>{theme.description || '—'}</CardDescription>
                </CardHeader>

                <CardContent className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                  <div className="flex items-center gap-2">
                    {!isActive && (
                      <Button
                        size="sm"
                        disabled={activateMutation.isPending}
                        onClick={() => activateMutation.mutate(key)}
                      >
                        {t('themePage.activate')}
                      </Button>
                    )}
                    {theme.configs && theme.configs.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void openConfigDialog(key, theme)}
                      >
                        <Settings className="h-3.5 w-3.5" />
                        {t('themePage.configure')}
                      </Button>
                    )}
                  </div>

                  {theme.can_delete && !isActive && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleting(key)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={Boolean(configTheme)} onOpenChange={(open) => !open && setConfigTheme(null)}>
        <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {configTheme?.info.name || configTheme?.key} — {t('themePage.configure')}
            </DialogTitle>
            <DialogDescription>{t('themePage.configDesc')}</DialogDescription>
          </DialogHeader>

          {loadingConfig ? (
            <Skeleton className="h-36 w-full" />
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                saveConfigMutation.mutate();
              }}
            >
              {(configTheme?.info.configs ?? []).map((field) => {
                const value = String(themeValues[field.field_name] ?? '');
                if (field.field_type === 'select' && field.select_options) {
                  return (
                    <div key={field.field_name} className="space-y-1.5">
                      <Label>{field.label}</Label>
                      <Select
                        value={value}
                        onValueChange={(v) =>
                          setThemeValues((prev) => ({ ...prev, [field.field_name]: v }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={field.placeholder} />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(field.select_options).map(([optVal, optLabel]) => (
                            <SelectItem key={optVal} value={optVal}>
                              {optLabel}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                }

                if (field.field_type === 'textarea') {
                  return (
                    <div key={field.field_name} className="space-y-1.5">
                      <Label>{field.label}</Label>
                      <Textarea
                        rows={5}
                        placeholder={field.placeholder}
                        value={value}
                        onChange={(e) =>
                          setThemeValues((prev) => ({
                            ...prev,
                            [field.field_name]: e.target.value,
                          }))
                        }
                      />
                    </div>
                  );
                }

                return (
                  <div key={field.field_name} className="space-y-1.5">
                    <Label>{field.label}</Label>
                    <Input
                      placeholder={field.placeholder}
                      value={value}
                      onChange={(e) =>
                        setThemeValues((prev) => ({
                          ...prev,
                          [field.field_name]: e.target.value,
                        }))
                      }
                    />
                  </div>
                );
              })}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfigTheme(null)}
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

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('themePage.deleteTitle')}
        description={t('themePage.deleteDesc', { name: deleting ?? '' })}
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
      />
    </div>
  );
}
