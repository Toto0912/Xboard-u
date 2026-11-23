import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  Eye,
  Loader2,
  Mail,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  closeTicket,
  fetchTicketDetail,
  fetchTickets,
  replyTicket,
  TICKET_REPLY_REPLIED,
  TICKET_STATUS_CLOSED,
  TICKET_STATUS_OPEN,
  type TicketRecord,
} from '@/api/ticket';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataTablePagination } from '@/components/shared/DataTablePagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { formatBytes } from '@/lib/format';

function formatUnixTs(ts?: number | null): string {
  if (!ts) return '—';
  const d = new Date(ts * 1000);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function TicketManagePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [statusTab, setStatusTab] = useState<string>(String(TICKET_STATUS_OPEN));
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [emailSearch, setEmailSearch] = useState('');
  const [sortField, setSortField] = useState<string>('status');
  const [sortDesc, setSortDesc] = useState<boolean>(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [detailOpen, setDetailOpen] = useState(false);
  const [activeTicketId, setActiveTicketId] = useState<number | null>(null);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [replyText, setReplyText] = useState('');
  const [closingTarget, setClosingTarget] = useState<TicketRecord | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const filters = useMemo(() => {
    const out: Array<{ id: string; value: unknown }> = [
      { id: 'status', value: [Number(statusTab)] },
    ];
    if (levelFilter !== 'all') {
      out.push({ id: 'level', value: [Number(levelFilter)] });
    }
    return out;
  }, [statusTab, levelFilter]);

  const ticketsQuery = useQuery({
    queryKey: ['admin-tickets', page, pageSize, filters, emailSearch, sortField, sortDesc],
    queryFn: () =>
      fetchTickets({
        current: page,
        pageSize,
        filter: filters,
        sort: [{ id: sortField, desc: sortDesc }],
        ...(emailSearch.trim() ? { email: emailSearch.trim() } : {}),
      }),
  });

  const sidebarQuery = useQuery({
    queryKey: ['admin-tickets-sidebar', detailOpen, statusTab],
    queryFn: () =>
      fetchTickets({
        current: 1,
        pageSize: 50,
        filter: [{ id: 'status', value: [Number(statusTab)] }],
      }),
    enabled: detailOpen,
  });

  const detailQuery = useQuery({
    queryKey: ['admin-ticket-detail', activeTicketId],
    queryFn: () => fetchTicketDetail(activeTicketId!),
    enabled: detailOpen && activeTicketId !== null,
    refetchInterval: detailOpen && activeTicketId !== null ? 5000 : false,
  });

  const detail = detailQuery.data;

  useEffect(() => {
    if (detailOpen && detail?.messages) {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      });
    }
  }, [detailOpen, detail?.messages?.length]);

  const invalidateAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-tickets'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-tickets-sidebar'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-ticket-detail'] }),
    ]);
  };

  const replyMutation = useMutation({
    mutationFn: replyTicket,
    onSuccess: async () => {
      setReplyText('');
      toast.success(t('ticket.replySuccess'));
      await invalidateAll();
    },
  });

  const closeMutation = useMutation({
    mutationFn: closeTicket,
    onSuccess: async () => {
      toast.success(t('ticket.closeSuccess'));
      setClosingTarget(null);
      await invalidateAll();
    },
  });

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDesc((v) => !v);
    } else {
      setSortField(field);
      setSortDesc(true);
    }
    setPage(1);
  };

  const renderSortIcon = (field: string) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3" />;
    return sortDesc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />;
  };

  const getLevelBadge = (level: number) => {
    if (level === 2) {
      return <Badge variant="destructive">{t('ticket.levels.2')}</Badge>;
    }
    if (level === 1) {
      return <Badge variant="secondary">{t('ticket.levels.1')}</Badge>;
    }
    return <Badge variant="outline">{t('ticket.levels.0')}</Badge>;
  };

  const getStatusBadge = (item: Pick<TicketRecord, 'status' | 'reply_status'>) => {
    if (item.status === TICKET_STATUS_CLOSED) {
      return <Badge variant="secondary">{t('ticket.statuses.closed')}</Badge>;
    }
    if (item.reply_status === TICKET_REPLY_REPLIED) {
      return <Badge variant="secondary">{t('ticket.statuses.replied')}</Badge>;
    }
    return <Badge variant="destructive">{t('ticket.statuses.pending')}</Badge>;
  };

  const openDetail = (ticket: TicketRecord) => {
    setActiveTicketId(ticket.id);
    setReplyText('');
    setDetailOpen(true);
  };

  const handleSendReply = () => {
    const message = replyText.trim();
    if (!message || activeTicketId === null || replyMutation.isPending) return;
    replyMutation.mutate({ id: activeTicketId, message });
  };

  const sidebarItems = useMemo(() => {
    const items = sidebarQuery.data?.data ?? [];
    const q = sidebarSearch.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.subject.toLowerCase().includes(q) ||
        (item.user?.email ?? '').toLowerCase().includes(q) ||
        String(item.id).includes(q),
    );
  }, [sidebarQuery.data, sidebarSearch]);

  const tickets = ticketsQuery.data?.data ?? [];
  const total = ticketsQuery.data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t('nav.ticketManagement')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('ticket.pageSubtitle')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <Tabs
          value={statusTab}
          onValueChange={(v) => {
            setStatusTab(v);
            setPage(1);
          }}
        >
          <TabsList className="h-8">
            <TabsTrigger value={String(TICKET_STATUS_OPEN)} className="h-6 px-3 text-xs">
              {t('ticket.tabs.open')}
            </TabsTrigger>
            <TabsTrigger value={String(TICKET_STATUS_CLOSED)} className="h-6 px-3 text-xs">
              {t('ticket.tabs.closed')}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Select
          value={levelFilter}
          onValueChange={(v) => {
            setLevelFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue placeholder={t('ticket.allLevels')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('ticket.allLevels')}</SelectItem>
            <SelectItem value="0">{t('ticket.levels.0')}</SelectItem>
            <SelectItem value="1">{t('ticket.levels.1')}</SelectItem>
            <SelectItem value="2">{t('ticket.levels.2')}</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative min-w-[200px] flex-1 max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={emailSearch}
            onChange={(e) => {
              setEmailSearch(e.target.value);
              setPage(1);
            }}
            placeholder={t('ticket.searchPlaceholder')}
            className="h-8 pl-9 text-xs"
          />
        </div>

        <Button
          variant="outline"
          size="icon"
          className="ml-auto h-8 w-8"
          onClick={() => void ticketsQuery.refetch()}
          disabled={ticketsQuery.isFetching}
          title={t('common.refresh')}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${ticketsQuery.isFetching ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card/60">
        {ticketsQuery.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <table className="w-full min-w-[920px] text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-24 px-4 py-3 font-medium">{t('ticket.id')}</th>
                <th className="px-3 py-3 font-medium">{t('ticket.subject')}</th>
                <th className="px-3 py-3 font-medium">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                    onClick={() => toggleSort('level')}
                  >
                    {t('ticket.level')}
                    {renderSortIcon('level')}
                  </button>
                </th>
                <th className="px-3 py-3 font-medium">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                    onClick={() => toggleSort('status')}
                  >
                    {t('ticket.status')}
                    {renderSortIcon('status')}
                  </button>
                </th>
                <th className="px-3 py-3 font-medium">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                    onClick={() => toggleSort('updated_at')}
                  >
                    {t('ticket.updatedAt')}
                    {renderSortIcon('updated_at')}
                  </button>
                </th>
                <th className="px-3 py-3 font-medium">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                    onClick={() => toggleSort('created_at')}
                  >
                    {t('ticket.createdAt')}
                    {renderSortIcon('created_at')}
                  </button>
                </th>
                <th className="sticky right-0 w-32 border-l bg-card/95 px-4 py-3 text-right font-medium backdrop-blur-sm">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tickets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                    {t('ticket.empty')}
                  </td>
                </tr>
              ) : (
                tickets.map((ticket) => (
                  <tr key={ticket.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      #{ticket.id}
                    </td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        className="text-left font-medium hover:text-primary hover:underline cursor-pointer"
                        onClick={() => openDetail(ticket)}
                      >
                        {ticket.subject}
                      </button>
                      {ticket.user?.email && (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {ticket.user.email}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">{getLevelBadge(Number(ticket.level ?? 0))}</td>
                    <td className="px-3 py-3">{getStatusBadge(ticket)}</td>
                    <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                      {formatUnixTs(ticket.updated_at)}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                      {formatUnixTs(ticket.created_at)}
                    </td>
                    <td className="sticky right-0 border-l bg-card/95 px-4 py-3 text-right backdrop-blur-sm">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDetail(ticket)}
                          title={t('ticket.viewTicket')}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {ticket.status !== TICKET_STATUS_CLOSED && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setClosingTarget(ticket)}
                            title={t('ticket.closeTicket')}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      <DataTablePagination
        total={total}
        page={page}
        pageSize={pageSize}
        pageSizeOptions={[10, 20, 50, 100]}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      {/* Split-pane Ticket Detail & Reply Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="flex h-[85vh] max-w-5xl flex-col gap-0 overflow-hidden p-0">
          <DialogTitle className="sr-only">{detail?.subject ?? t('ticket.viewTicket')}</DialogTitle>
          <div className="flex min-h-0 flex-1">
            {/* Left Ticket List Sidebar */}
            <div className="hidden w-72 shrink-0 flex-col border-r bg-muted/20 md:flex">
              <div className="border-b p-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={sidebarSearch}
                    onChange={(e) => setSidebarSearch(e.target.value)}
                    placeholder={t('ticket.sidebarSearchPlaceholder')}
                    className="h-8 pl-8 text-xs"
                  />
                </div>
              </div>
              <div className="flex-1 space-y-1 overflow-y-auto p-2">
                {sidebarQuery.isLoading ? (
                  <div className="space-y-2 p-2">
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                  </div>
                ) : sidebarItems.length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted-foreground">
                    {t('ticket.empty')}
                  </p>
                ) : (
                  sidebarItems.map((item) => {
                    const active = item.id === activeTicketId;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveTicketId(item.id)}
                        className={`w-full rounded-md border px-3 py-2 text-left transition-colors cursor-pointer ${
                          active
                            ? 'border-primary/40 bg-primary/10'
                            : 'border-transparent hover:bg-muted/60'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="truncate text-xs font-medium">{item.subject}</span>
                          <span className="font-mono text-[10px] text-muted-foreground">
                            #{item.id}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-1 text-[11px] text-muted-foreground">
                          <span className="truncate">{item.user?.email ?? `#${item.user_id}`}</span>
                          {getStatusBadge(item)}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Conversation Panel */}
            <div className="flex min-w-0 flex-1 flex-col">
              {detailQuery.isLoading && !detail ? (
                <div className="flex flex-1 flex-col gap-4 p-6">
                  <Skeleton className="h-8 w-2/3" />
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : !detail ? (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                  {t('ticket.empty')}
                </div>
              ) : (
                <>
                  <div className="shrink-0 border-b bg-[var(--xb-heading)] px-6 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold leading-tight">
                            {detail.subject}
                          </h3>
                          {getLevelBadge(Number(detail.level ?? 0))}
                          {getStatusBadge(detail)}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Mail className="h-3.5 w-3.5" />
                            {detail.user?.email ?? `#${detail.user_id}`}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {formatUnixTs(detail.created_at)}
                          </span>
                          {detail.user && (
                            <span className="font-mono">
                              {t('ticket.userBalance')}: ¥{Number(detail.user.balance ?? 0).toFixed(2)}
                              {' · '}
                              {t('ticket.userTraffic')}:{' '}
                              {formatBytes(Number(detail.user.u ?? 0) + Number(detail.user.d ?? 0))} /{' '}
                              {formatBytes(Number(detail.user.transfer_enable ?? 0))}
                            </span>
                          )}
                        </div>
                      </div>

                      {detail.status !== TICKET_STATUS_CLOSED && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-destructive hover:text-destructive"
                          onClick={() => setClosingTarget(detail)}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          {t('ticket.closeTicket')}
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
                    {(detail.messages ?? []).length === 0 ? (
                      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                        <MessageSquare className="h-8 w-8 opacity-40" />
                        <p className="text-xs">{t('ticket.noMessages')}</p>
                      </div>
                    ) : (
                      (detail.messages ?? []).map((msg) => {
                        const isAdmin = Boolean(msg.is_from_admin);
                        return (
                          <div
                            key={msg.id}
                            className={`flex flex-col ${isAdmin ? 'items-end' : 'items-start'}`}
                          >
                            <div
                              className={`max-w-[82%] rounded-lg border px-4 py-2.5 text-sm ${
                                isAdmin
                                  ? 'border-primary/30 bg-primary/10 text-foreground'
                                  : 'bg-muted/40 text-foreground'
                              }`}
                            >
                              <div className="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                                <span className="font-medium">
                                  {isAdmin
                                    ? t('ticket.adminSender')
                                    : detail.user?.email ?? t('ticket.userSender')}
                                </span>
                                <span>·</span>
                                <span className="font-mono">{formatUnixTs(msg.created_at)}</span>
                              </div>
                              <div className="whitespace-pre-wrap break-words leading-relaxed">
                                {msg.message}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  <div className="shrink-0 border-t bg-[var(--xb-heading)] px-6 py-3">
                    {detail.status === TICKET_STATUS_CLOSED ? (
                      <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
                        <CheckCircle2 className="h-4 w-4" />
                        {t('ticket.closedNotice')}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Textarea
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          onKeyDown={(e) => {
                            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                              e.preventDefault();
                              handleSendReply();
                            }
                          }}
                          placeholder={t('ticket.replyPlaceholder')}
                          rows={3}
                          className="resize-none text-sm"
                        />
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-muted-foreground">
                            {t('ticket.replyShortcutHint')}
                          </span>
                          <Button
                            size="sm"
                            onClick={handleSendReply}
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
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(closingTarget)}
        onOpenChange={(open) => {
          if (!open) setClosingTarget(null);
        }}
        title={t('ticket.closeConfirmTitle')}
        description={t('ticket.closeConfirmDesc', { subject: closingTarget?.subject ?? '' })}
        destructive
        loading={closeMutation.isPending}
        onConfirm={() => {
          if (closingTarget) closeMutation.mutate(closingTarget.id);
        }}
      />
    </div>
  );
}
