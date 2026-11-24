import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, MessageSquare, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { closeTicket, createTicket, fetchTickets, type TicketItem } from '@/api/ticket';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import { formatTimestamp } from '@/lib/format';

export default function TicketPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [level, setLevel] = useState('1');
  const [message, setMessage] = useState('');
  const [closeTarget, setCloseTarget] = useState<TicketItem | null>(null);

  const ticketsQuery = useQuery({
    queryKey: ['user-tickets'],
    queryFn: fetchTickets,
  });

  const createMutation = useMutation({
    mutationFn: createTicket,
    onSuccess: () => {
      toast.success(t('common.operationSuccess'));
      setCreateOpen(false);
      setSubject('');
      setLevel('1');
      setMessage('');
      void queryClient.invalidateQueries({ queryKey: ['user-tickets'] });
      void queryClient.invalidateQueries({ queryKey: ['user-stat'] });
    },
  });

  const closeMutation = useMutation({
    mutationFn: (id: number) => closeTicket(id),
    onSuccess: () => {
      toast.success(t('common.operationSuccess'));
      setCloseTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['user-tickets'] });
      void queryClient.invalidateQueries({ queryKey: ['user-stat'] });
    },
  });

  const tickets = ticketsQuery.data ?? [];

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    createMutation.mutate({
      subject: subject.trim(),
      level: Number(level),
      message: message.trim(),
    });
  };

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{t('ticket.title')}</h1>
        <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          {t('ticket.newTicket')}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {ticketsQuery.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : tickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <MessageSquare className="h-8 w-8 opacity-40" />
              <span>{t('common.noData')}</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">{t('ticket.subject')}</th>
                    <th className="px-4 py-3 font-medium">{t('ticket.level')}</th>
                    <th className="px-4 py-3 font-medium">{t('ticket.status')}</th>
                    <th className="px-4 py-3 font-medium">{t('ticket.createdAt')}</th>
                    <th className="px-4 py-3 font-medium">{t('ticket.updatedAt')}</th>
                    <th className="px-4 py-3 text-right font-medium">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {tickets.map((ticket) => (
                    <tr key={ticket.id} className="hover:bg-muted/30">
                      <td className="max-w-[240px] truncate px-4 py-3 font-medium">
                        {ticket.subject}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">
                          {t(`ticket.levels.${ticket.level}`, {
                            defaultValue: String(ticket.level),
                          })}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Badge variant={ticket.status === 0 ? 'warning' : 'secondary'}>
                            {t(`ticket.statuses.${ticket.status}`, {
                              defaultValue: String(ticket.status),
                            })}
                          </Badge>
                          {ticket.status === 0 && (
                            <Badge variant="outline">
                              {t(`ticket.replyStatuses.${ticket.reply_status}`, {
                                defaultValue: '',
                              })}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {formatTimestamp(ticket.created_at)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {formatTimestamp(ticket.updated_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2.5 text-xs"
                            onClick={() => navigate(`/ticket/${ticket.id}`)}
                          >
                            {t('common.detail')}
                          </Button>
                          {ticket.status === 0 && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                              onClick={() => setCloseTarget(ticket)}
                            >
                              {t('ticket.closeTicket')}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('ticket.newTicket')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t('ticket.subject')}</Label>
              <Input
                required
                placeholder={t('ticket.subjectPlaceholder')}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('ticket.level')}</Label>
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger>
                  <SelectValue placeholder={t('ticket.levelPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">{t('ticket.levels.0')}</SelectItem>
                  <SelectItem value="1">{t('ticket.levels.1')}</SelectItem>
                  <SelectItem value="2">{t('ticket.levels.2')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('ticket.message')}</Label>
              <Textarea
                required
                rows={5}
                placeholder={t('ticket.messagePlaceholder')}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('common.confirm')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(closeTarget)}
        onOpenChange={(o) => !o && setCloseTarget(null)}
        title={t('ticket.closeTicket')}
        description={t('ticket.closeConfirm')}
        variant="destructive"
        loading={closeMutation.isPending}
        onConfirm={() => closeTarget && closeMutation.mutate(closeTarget.id)}
      />
    </div>
  );
}
