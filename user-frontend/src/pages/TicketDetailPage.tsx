import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Send } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { closeTicket, fetchTicketDetail, replyTicket } from '@/api/ticket';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { formatTimestamp } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function TicketDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { ticket_id } = useParams<{ ticket_id: string }>();

  const [replyText, setReplyText] = useState('');
  const [closeOpen, setCloseOpen] = useState(false);

  const detailQuery = useQuery({
    queryKey: ['ticket-detail', ticket_id],
    queryFn: () => fetchTicketDetail(ticket_id!),
    enabled: Boolean(ticket_id),
    refetchInterval: (query) => (query.state.data?.status === 0 ? 5000 : false),
  });

  const ticket = detailQuery.data;

  const replyMutation = useMutation({
    mutationFn: () => replyTicket({ id: Number(ticket_id), message: replyText.trim() }),
    onSuccess: () => {
      setReplyText('');
      void queryClient.invalidateQueries({ queryKey: ['ticket-detail', ticket_id] });
    },
  });

  const closeMutation = useMutation({
    mutationFn: () => closeTicket(Number(ticket_id)),
    onSuccess: () => {
      toast.success(t('common.operationSuccess'));
      setCloseOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['ticket-detail', ticket_id] });
      void queryClient.invalidateQueries({ queryKey: ['user-tickets'] });
    },
  });

  if (detailQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={() => navigate('/ticket')}>
            <ArrowLeft className="h-4 w-4" />
            {t('common.back')}
          </Button>
          <h1 className="truncate text-lg font-semibold">{ticket?.subject}</h1>
        </div>
        {ticket && (
          <div className="flex items-center gap-2">
            <Badge variant={ticket.status === 0 ? 'warning' : 'secondary'}>
              {t(`ticket.statuses.${ticket.status}`, { defaultValue: String(ticket.status) })}
            </Badge>
            {ticket.status === 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setCloseOpen(true)}
              >
                {t('ticket.closeTicket')}
              </Button>
            )}
          </div>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-muted-foreground">
            #{ticket?.id} · {ticket ? formatTimestamp(ticket.created_at) : ''}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-h-[460px] space-y-3 overflow-y-auto rounded-lg border bg-muted/20 p-4">
            {(ticket?.message ?? []).map((msg) => (
              <div
                key={msg.id}
                className={cn('flex flex-col gap-1', msg.is_me ? 'items-end' : 'items-start')}
              >
                <div className="text-[11px] text-muted-foreground">
                  {msg.is_me ? t('ticket.me') : t('ticket.staff')} ·{' '}
                  {formatTimestamp(msg.created_at)}
                </div>
                <div
                  className={cn(
                    'max-w-[85%] whitespace-pre-wrap rounded-xl px-3.5 py-2.5 text-sm leading-relaxed shadow-xs',
                    msg.is_me
                      ? 'bg-primary text-primary-foreground'
                      : 'border bg-card text-card-foreground',
                  )}
                >
                  {msg.message}
                </div>
              </div>
            ))}
          </div>

          {ticket?.status === 0 && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!replyText.trim()) return;
                replyMutation.mutate();
              }}
              className="space-y-2.5"
            >
              <Textarea
                rows={3}
                placeholder={t('ticket.replyPlaceholder')}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
              />
              <div className="flex justify-end">
                <Button
                  type="submit"
                  size="sm"
                  disabled={!replyText.trim() || replyMutation.isPending}
                >
                  {replyMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  {t('ticket.sendReply')}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        title={t('ticket.closeTicket')}
        description={t('ticket.closeConfirm')}
        variant="destructive"
        loading={closeMutation.isPending}
        onConfirm={() => closeMutation.mutate()}
      />
    </div>
  );
}
