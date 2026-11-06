import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatNumber(n: number) {
  return new Intl.NumberFormat(undefined, { notation: n >= 100_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(n);
}

export function formatTime(iso: string, locale?: string) {
  const d = new Date(iso);
  const sameDay = new Date().toDateString() === d.toDateString();
  return new Intl.DateTimeFormat(locale, sameDay ? { hour: 'numeric', minute: '2-digit' } : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d);
}

export function formatDate(iso: string | null | undefined, locale?: string) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(iso));
}

export type DateGroup = 'pinned' | 'today' | 'yesterday' | 'previous7' | 'previous30' | 'older';

/** Buckets conversations into Today / Yesterday / Previous 7 days / Previous 30 days / Older. */
export function groupByDate<T extends { updatedAt: string; pinned?: boolean }>(items: T[], now = new Date()) {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86_400_000;
  const groups: Record<DateGroup, T[]> = { pinned: [], today: [], yesterday: [], previous7: [], previous30: [], older: [] };
  for (const item of items) {
    if (item.pinned) {
      groups.pinned.push(item);
      continue;
    }
    const t = new Date(item.updatedAt).getTime();
    if (t >= startOfToday) groups.today.push(item);
    else if (t >= startOfToday - day) groups.yesterday.push(item);
    else if (t >= startOfToday - 7 * day) groups.previous7.push(item);
    else if (t >= startOfToday - 30 * day) groups.previous30.push(item);
    else groups.older.push(item);
  }
  return groups;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function greetingKey(date = new Date()): 'morning' | 'afternoon' | 'evening' {
  const h = date.getHours();
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

export function describeUserAgent(ua: string | null) {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}
