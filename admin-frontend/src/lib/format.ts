export function formatCurrency(cents: number | string | null | undefined, symbol = '¥'): string {
  const num = Number(cents ?? 0);
  if (!Number.isFinite(num)) return `${symbol}0.00`;
  return `${symbol}${(num / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatBytes(bytes: number | string | null | undefined): string {
  const value = Number(bytes ?? 0);
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const idx = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  const scaled = value / 1024 ** idx;
  return `${scaled >= 100 ? scaled.toFixed(1) : scaled.toFixed(2)} ${units[idx]}`;
}

export function formatTimestamp(ts: number | string | null | undefined): string {
  if (ts === null || ts === undefined || ts === '') return '—';
  const num = Number(ts);
  const date = Number.isFinite(num)
    ? new Date(num > 1e12 ? num : num * 1000)
    : new Date(String(ts));
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

export function formatPercent(value: number | null | undefined): string {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return '0%';
  const prefix = num > 0 ? '+' : '';
  return `${prefix}${num.toFixed(1)}%`;
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
