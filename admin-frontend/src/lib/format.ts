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
