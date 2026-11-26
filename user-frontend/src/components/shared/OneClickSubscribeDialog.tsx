import { BookOpen, Copy, ExternalLink, QrCode } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { QrCodeBox } from '@/components/shared/QrCodeBox';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { copyToClipboard } from '@/lib/format';
import { getUserSettings } from '@/lib/settings';

interface OneClickSubscribeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscribeUrl: string;
}

function encodeBase64Utf8(str: string): string {
  try {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  } catch {
    return btoa(str);
  }
}

export function OneClickSubscribeDialog({
  open,
  onOpenChange,
  subscribeUrl,
}: OneClickSubscribeDialogProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { title } = getUserSettings();
  const [showQr, setShowQr] = useState(false);

  const encodedUrl = encodeURIComponent(subscribeUrl);
  const encodedTitle = encodeURIComponent(title);

  const clients = [
    {
      name: 'Clash / Mihomo',
      href: `clash://install-config?url=${encodedUrl}&name=${encodedTitle}`,
    },
    {
      name: 'Hiddify',
      href: `hiddify://import/${encodedUrl}#${encodedTitle}`,
    },
    {
      name: 'Shadowrocket',
      href: `shadowrocket://add/sub://${encodeBase64Utf8(subscribeUrl)}?remark=${encodedTitle}`,
    },
    {
      name: 'sing-box',
      href: `sing-box://import-remote-profile?url=${encodedUrl}#${encodedTitle}`,
    },
    {
      name: 'Stash',
      href: `stash://install-config?url=${encodedUrl}&name=${encodedTitle}`,
    },
    {
      name: 'Surge',
      href: `surge:///install-config?url=${encodedUrl}&name=${encodedTitle}`,
    },
    {
      name: 'Surfboard',
      href: `surfboard:///install-config?url=${encodedUrl}&name=${encodedTitle}`,
    },
  ];

  const handleCopy = async () => {
    if (!subscribeUrl) return;
    const ok = await copyToClipboard(subscribeUrl);
    if (ok) toast.success(t('common.copied'));
    else toast.error(t('common.copyFailed'));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setShowQr(false);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('dashboard.subscribeModalTitle')}</DialogTitle>
          <DialogDescription>
            {showQr ? t('dashboard.qrModalDesc') : t('dashboard.subscribeModalDesc')}
          </DialogDescription>
        </DialogHeader>

        {showQr ? (
          <div className="flex flex-col items-center gap-4 py-2">
            <QrCodeBox value={subscribeUrl} size={208} />
            <div className="flex w-full gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={handleCopy}>
                <Copy className="h-4 w-4" />
                {t('dashboard.copySubUrl')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => setShowQr(false)}
              >
                {t('common.back')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" onClick={() => setShowQr(true)}>
                <QrCode className="h-4 w-4" />
                {t('dashboard.scanQrCode')}
              </Button>
              <Button type="button" onClick={handleCopy}>
                <Copy className="h-4 w-4" />
                {t('dashboard.copySubUrl')}
              </Button>
            </div>

            <div className="rounded-lg border bg-muted/30 p-2.5 font-mono text-[11px] text-muted-foreground break-all">
              {subscribeUrl || '—'}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              {clients.map((c) => (
                <Button key={c.name} type="button" variant="outline" size="sm" asChild>
                  <a href={c.href}>
                    <ExternalLink className="h-3.5 w-3.5 opacity-60" />
                    {t('dashboard.importTo', { client: c.name })}
                  </a>
                </Button>
              ))}
            </div>

            <Button
              type="button"
              variant="ghost"
              className="w-full text-xs text-muted-foreground"
              onClick={() => {
                onOpenChange(false);
                navigate('/knowledge');
              }}
            >
              <BookOpen className="h-3.5 w-3.5" />
              {t('dashboard.viewDocsBtn')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
