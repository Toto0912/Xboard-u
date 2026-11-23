import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Eye, Loader2, Mail, Pencil, RotateCcw, Send } from 'lucide-react';
import { toast } from 'sonner';
import {
  getMailTemplate,
  listMailTemplates,
  resetMailTemplate,
  saveMailTemplate,
  testMailTemplate,
  type MailTemplateDetail,
} from '@/api/config';
import { CodeEditor } from '@/components/shared/CodeEditor';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatTimestamp } from '@/lib/format';

export function MailTemplateSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState<MailTemplateDetail | null>(null);
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [editorTab, setEditorTab] = useState<'code' | 'preview'>('code');
  const [resetTarget, setResetTarget] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ['admin-mail-templates'],
    queryFn: listMailTemplates,
  });

  const openEditor = async (name: string) => {
    const detail = await getMailTemplate(name);
    setEditing(detail);
    setSubject(detail.subject);
    setContent(detail.content);
    setEditorTab('code');
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!editing) return Promise.resolve(false);
      return saveMailTemplate({ name: editing.name, subject, content });
    },
    onSuccess: () => {
      toast.success(t('common.saveSuccess'));
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ['admin-mail-templates'] });
    },
  });

  const resetMutation = useMutation({
    mutationFn: (name: string) => resetMailTemplate(name),
    onSuccess: () => {
      toast.success(t('config.mailTemplateResetSuccess'));
      setResetTarget(null);
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ['admin-mail-templates'] });
    },
  });

  const testMutation = useMutation({
    mutationFn: (name: string) => testMailTemplate({ name }),
    onSuccess: () => {
      toast.success(t('config.mailTestSent'));
    },
  });

  const insertPlaceholder = (variable: string) => {
    setContent((prev) => `${prev}{{${variable}}}`);
  };

  return (
    <Card>
      <CardHeader className="border-b px-6 py-4">
        <CardTitle className="text-base">{t('config.mailTemplatesTitle')}</CardTitle>
        <CardDescription>{t('config.mailTemplatesDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        {listQuery.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <div className="divide-y rounded-lg border">
            {(listQuery.data ?? []).map((tpl) => (
              <div
                key={tpl.name}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{tpl.label}</span>
                    <span className="font-mono text-xs text-muted-foreground">({tpl.name})</span>
                    <Badge variant={tpl.customized ? 'default' : 'secondary'}>
                      {tpl.customized
                        ? t('config.mailCustomized')
                        : t('config.mailDefault')}
                    </Badge>
                  </div>
                  {tpl.subject && (
                    <div className="text-xs text-muted-foreground">
                      {tpl.subject} · {formatTimestamp(tpl.updated_at)}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void openEditor(tpl.name)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {t('common.edit')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={testMutation.isPending}
                    onClick={() => testMutation.mutate(tpl.name)}
                  >
                    <Send className="h-3.5 w-3.5" />
                    {t('config.testSend')}
                  </Button>
                  {tpl.customized && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setResetTarget(tpl.name)}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      {t('config.resetDefault')}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing?.label} ({editing?.name})
            </DialogTitle>
            <DialogDescription>{t('config.mailEditorDesc')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="mail-tpl-subject">{t('config.mailSubject')}</Label>
              <Input
                id="mail-tpl-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>

            {editing && (
              <div className="space-y-2 rounded-lg border bg-muted/20 p-3 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-muted-foreground">
                    {t('config.requiredVars')}:
                  </span>
                  {editing.required_vars.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => insertPlaceholder(v)}
                      className="rounded border bg-background px-1.5 py-0.5 font-mono hover:bg-accent cursor-pointer"
                    >
                      {`{{${v}}}`}
                    </button>
                  ))}
                </div>
                {editing.optional_vars.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-muted-foreground">
                      {t('config.optionalVars')}:
                    </span>
                    {editing.optional_vars.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => insertPlaceholder(v)}
                        className="rounded border bg-background px-1.5 py-0.5 font-mono text-muted-foreground hover:bg-accent cursor-pointer"
                      >
                        {`{{${v}}}`}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <Tabs
              value={editorTab}
              onValueChange={(v) => setEditorTab(v as 'code' | 'preview')}
            >
              <TabsList>
                <TabsTrigger value="code">HTML</TabsTrigger>
                <TabsTrigger value="preview" className="gap-1.5">
                  <Eye className="h-3.5 w-3.5" />
                  {t('common.preview')}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="code">
                <CodeEditor
                  value={content}
                  language="html"
                  height="360px"
                  onChange={setContent}
                />
              </TabsContent>
              <TabsContent value="preview">
                <iframe
                  title="Mail template preview"
                  sandbox=""
                  srcDoc={content}
                  className="h-[360px] w-full rounded-lg border bg-white"
                />
              </TabsContent>
            </Tabs>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <div className="flex items-center gap-2">
                {editing && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={testMutation.isPending}
                    onClick={() => testMutation.mutate(editing.name)}
                  >
                    <Send className="h-3.5 w-3.5" />
                    {t('config.testSend')}
                  </Button>
                )}
                {editing?.customized && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setResetTarget(editing.name)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {t('config.resetDefault')}
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  {t('common.cancel')}
                </Button>
                <Button
                  type="button"
                  disabled={saveMutation.isPending}
                  onClick={() => saveMutation.mutate()}
                >
                  {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t('common.save')}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(resetTarget)}
        onOpenChange={(open) => !open && setResetTarget(null)}
        title={t('config.resetDefault')}
        description={t('config.resetDefaultConfirm')}
        loading={resetMutation.isPending}
        onConfirm={() => resetTarget && resetMutation.mutate(resetTarget)}
      />
    </Card>
  );
}
