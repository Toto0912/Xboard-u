export function formatBytes(bytes: number | null | undefined): string {
  const num = Number(bytes ?? 0);
  if (!Number.isFinite(num) || num <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const idx = Math.min(units.length - 1, Math.floor(Math.log(num) / Math.log(1024)));
  const val = num / 1024 ** idx;
  return `${val >= 100 ? val.toFixed(1) : val.toFixed(2)} ${units[idx]}`;
}

export function formatCurrency(fen: number | null | undefined, symbol = '¥'): string {
  const amount = Number(fen ?? 0) / 100;
  return `${symbol}${amount.toFixed(2)}`;
}

export function formatTimestamp(ts: number | string | null | undefined): string {
  if (!ts) return '—';
  const num = typeof ts === 'string' ? Number(ts) : ts;
  if (!Number.isFinite(num) || num <= 0) return '—';
  const ms = num > 1e12 ? num : num * 1000;
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDate(ts: number | string | null | undefined): string {
  if (!ts) return '—';
  const num = typeof ts === 'string' ? Number(ts) : ts;
  if (!Number.isFinite(num) || num <= 0) return '—';
  const ms = num > 1e12 ? num : num * 1000;
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fallback below
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export interface TrafficUsageTone {
  level: 'normal' | 'warning' | 'danger';
  pct: number;
  barClass: string;
  textClass: string;
}

/** Return progress percentage and warning/danger classes based on traffic usage thresholds (80% / 90%). */
export function getTrafficUsageTone(usedBytes: number, totalBytes: number): TrafficUsageTone {
  if (!Number.isFinite(totalBytes) || totalBytes <= 0 || !Number.isFinite(usedBytes) || usedBytes <= 0) {
    return {
      level: 'normal',
      pct: 0,
      barClass: 'bg-primary',
      textClass: '',
    };
  }

  const rawPct = (usedBytes / totalBytes) * 100;
  const pct = Math.min(100, Math.max(0, rawPct));

  if (rawPct >= 90) {
    return {
      level: 'danger',
      pct,
      barClass: 'bg-rose-500',
      textClass: 'text-rose-600 dark:text-rose-400 font-medium',
    };
  }

  if (rawPct >= 80) {
    return {
      level: 'warning',
      pct,
      barClass: 'bg-amber-500',
      textClass: 'text-amber-600 dark:text-amber-400 font-medium',
    };
  }

  return {
    level: 'normal',
    pct,
    barClass: 'bg-primary',
    textClass: '',
  };
}
