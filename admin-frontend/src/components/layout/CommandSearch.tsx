import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { FLAT_NAV_ITEMS } from '@/config/navigation';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export function CommandSearch() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const open = useUiStore((s) => s.searchOpen);
  const setOpen = useUiStore((s) => s.setSearchOpen);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, setOpen]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FLAT_NAV_ITEMS;
    return FLAT_NAV_ITEMS.filter((item) => {
      const title = t(item.titleKey).toLowerCase();
      const group = item.groupTitleKey ? t(item.groupTitleKey).toLowerCase() : '';
      return (
        title.includes(q) ||
        group.includes(q) ||
        item.href.toLowerCase().includes(q)
      );
    });
  }, [query, t]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, open]);

  const handleSelect = (href: string) => {
    setOpen(false);
    setQuery('');
    void navigate(href);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">{t('search.title')}</DialogTitle>
        <div className="flex items-center border-b px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex((i) => (results.length ? (i + 1) % results.length : 0));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex((i) =>
                  results.length ? (i - 1 + results.length) % results.length : 0,
                );
              } else if (e.key === 'Enter' && results[selectedIndex]) {
                e.preventDefault();
                handleSelect(results[selectedIndex].href);
              }
            }}
            placeholder={t('search.placeholder')}
            className="h-11 border-0 px-0 shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="max-h-72 overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t('search.noResults')}
            </div>
          ) : (
            results.map((item, idx) => {
              const Icon = item.icon;
              const active = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={() => handleSelect(item.href)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors cursor-pointer',
                    active ? 'bg-accent text-accent-foreground' : 'text-foreground',
                  )}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span>{t(item.titleKey)}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {item.groupTitleKey ? t(item.groupTitleKey) : item.href}
                  </span>
                </button>
              );
            })
          )}
        </div>
        <div className="border-t bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
          {t('search.hint')}
        </div>
      </DialogContent>
    </Dialog>
  );
}
