const DAY_MS = 86_400_000;

/** Local calendar day as YYYY-MM-DD. */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parses YYYY-MM-DD as local midnight (Date.parse would treat it as UTC). */
export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Monday 00:00 local of the week containing `date` (ISO weeks). */
export function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  const offset = (d.getDay() + 6) % 7;
  return addDays(d, -offset);
}

export function weekKey(date: Date): string {
  return dayKey(startOfWeek(date));
}

/** ISO 8601 week number. */
export function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart) / DAY_MS + 1) / 7);
}

/** Whole calendar days from a to b (positive when b is later). DST-safe. */
export function daysBetween(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / DAY_MS);
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}

/** mm:ss or h:mm:ss for running timers. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const dayMonthYear = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const weekdayLong = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
const weekdayShort = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const monthYear = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });
const timeOfDay = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

export const fmt = {
  dayMonth: (d: Date) => dayMonth.format(d),
  dayMonthYear: (d: Date) => dayMonthYear.format(d),
  weekdayLong: (d: Date) => weekdayLong.format(d),
  weekdayShort: (d: Date) => weekdayShort.format(d),
  monthYear: (d: Date) => monthYear.format(d),
  time: (d: Date) => timeOfDay.format(d),
};

/** "Today", "Yesterday", "3 days ago", then a date. */
export function relativeDay(date: Date, now: Date): string {
  const diff = daysBetween(date, now);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff > 1 && diff < 7) return `${diff} days ago`;
  return date.getFullYear() === now.getFullYear() ? fmt.dayMonth(date) : fmt.dayMonthYear(date);
}

/** "just now", "4 min ago", "2 h ago", then a date and time. */
export function relativeTime(date: Date, now: Date): string {
  const s = Math.round((now.getTime() - date.getTime()) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return `${fmt.dayMonth(date)}, ${fmt.time(date)}`;
}
