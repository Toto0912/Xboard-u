import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { saveConfig, type ConfigMappings } from '@/api/config';
import { CodeEditor, type CodeLanguage } from '@/components/shared/CodeEditor';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { TemplateToolKind } from '@/lib/templateTools';

type TemplateKey = keyof ConfigMappings['subscribe_template'];

const TEMPLATE_DEFS: Array<{
  key: TemplateKey;
  label: string;
  language: CodeLanguage;
  tools: TemplateToolKind;
}> = [
  { key: 'subscribe_template_singbox', label: 'sing-box', language: 'json', tools: 'json' },
  { key: 'subscribe_template_clash', label: 'Clash', language: 'yaml', tools: 'yaml' },
  { key: 'subscribe_template_clashmeta', label: 'Clash Meta', language: 'yaml', tools: 'yaml' },
  { key: 'subscribe_template_stash', label: 'Stash', language: 'yaml', tools: 'yaml' },
  { key: 'subscribe_template_surge', label: 'Surge', language: 'conf', tools: 'conf' },
  { key: 'subscribe_template_surfboard', label: 'Surfboard', language: 'conf', tools: 'conf' },
];

export function SubscribeTemplateSection({
  initial,
}: {
  initial: ConfigMappings['subscribe_template'];
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TemplateKey>('subscribe_template_singbox');
  const [drafts, setDrafts] = useState<ConfigMappings['subscribe_template']>(initial);

  useEffect(() => {
    setDrafts(initial);
  }, [initial]);

  const saveMutation = useMutation({
    mutationFn: () => saveConfig(drafts),
    onSuccess: () => {
      toast.success(t('common.saveSuccess'));
      void queryClient.invalidateQueries({ queryKey: ['admin-config'] });
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 border-b px-6 py-4">
        <div>
          <CardTitle className="text-base">{t('config.tabs.subscribe_template')}</CardTitle>
          <CardDescription>{t('config.subscribeTemplateDesc')}</CardDescription>
        </div>
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {t('common.save')}
        </Button>
      </CardHeader>
      <CardContent className="p-6">
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as TemplateKey)}
        >
          <TabsList className="flex h-auto flex-wrap justify-start">
            {TEMPLATE_DEFS.map((tpl) => (
              <TabsTrigger key={tpl.key} value={tpl.key}>
                {tpl.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {TEMPLATE_DEFS.map((tpl) => (
            <TabsContent key={tpl.key} value={tpl.key}>
              <CodeEditor
                value={drafts[tpl.key] ?? ''}
                language={tpl.language}
                height="460px"
                templateTools={tpl.tools}
                onChange={(next) =>
                  setDrafts((prev) => ({
                    ...prev,
                    [tpl.key]: next,
                  }))
                }
              />
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
