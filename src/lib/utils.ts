export const pad = (n: number): string => String(n).padStart(2, '0');

export const fmtDate = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const parseDate = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const todayStr = (): string => fmtDate(new Date());

export const addDays = (s: string, n: number): string => {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return fmtDate(d);
};

export const minToHHMM = (m: number): string => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

export const hhmmToMin = (s: string): number => {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
};

export const dtToMin = (iso: string): number => hhmmToMin(iso.slice(11, 16));
export const dtToDate = (iso: string): string => iso.slice(0, 10);
export const makeDT = (dateStr: string, min: number): string => `${dateStr}T${minToHHMM(min)}`;

export const nowMin = (): number => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

/**
 * Computes current wall-clock date/time inside the salon's configured timezone (`tz`),
 * preventing clients from ever seeing or selecting past slots even if their device
 * timezone differs from the salon's timezone.
 */
export function getSalonNow(tz?: string): { dateStr: string; timeStr: string; iso: string; minOfDay: number } {
  const zone = tz || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow';
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
  } catch {
    const d = new Date();
    const dateStr = fmtDate(d);
    const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return { dateStr, timeStr, iso: `${dateStr}T${timeStr}`, minOfDay: d.getHours() * 60 + d.getMinutes() };
  }
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const h = Number(map.hour === '24' ? '0' : map.hour);
  const m = Number(map.minute);
  const dateStr = `${map.year}-${map.month}-${map.day}`;
  const timeStr = `${pad(h)}:${pad(m)}`;
  return { dateStr, timeStr, iso: `${dateStr}T${timeStr}`, minOfDay: h * 60 + m };
}

export function addMinutesISO(iso: string, minutes: number): string {
  const [datePart, timePart] = iso.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm] = timePart.split(':').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, hh, mm + minutes));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}T${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}`;
}

export const money = (n?: number | null): string =>
  (n ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + ' ₽';

export const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
export const WEEKDAYS_FULL = [
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
  'Воскресенье',
];
export const MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];
export const MONTHS_SHORT = [
  'янв', 'фев', 'мар', 'апр', 'мая', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
];

export const weekdayIdx = (dateStr: string): number => (parseDate(dateStr).getDay() + 6) % 7;

export function ruDate(dateStr: string, { short = false, withYear = false } = {}): string {
  const d = parseDate(dateStr);
  const base = `${d.getDate()} ${short ? MONTHS_SHORT[d.getMonth()] : MONTHS[d.getMonth()]}`;
  return withYear ? `${base} ${d.getFullYear()}` : base;
}

export function ruDateTime(iso: string): string {
  return `${ruDate(iso.slice(0, 10), { short: true })}, ${iso.slice(11, 16)}`;
}

export function fmtPhone(digits?: string | null): string {
  if (!digits) return '';
  if (digits.length === 11 && digits[0] === '7') {
    return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
  }
  return '+' + digits;
}

export const STATUS_META: Record<
  string,
  { label: string; bg: string; text: string; border: string }
> = {
  confirmed: {
    label: 'Подтверждена',
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
  },
  completed: {
    label: 'Выполнена',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
  },
  cancelled: {
    label: 'Отменена',
    bg: 'bg-slate-100',
    text: 'text-slate-600',
    border: 'border-slate-200',
  },
  no_show: {
    label: 'Неявка',
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-200',
  },
};

export function durationLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h} ч ${m} мин`;
  if (h) return `${h} ч`;
  return `${m} мин`;
}

export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return `rgba(225, 29, 72, ${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export interface ServiceItem {
  id: number;
  name: string;
  duration_min: number;
  price: number;
  color: string;
  is_active: boolean;
}

export interface ClientItem {
  id: number;
  name: string;
  phone: string;
  birth_date: string | null;
  notes: string;
  telegram_chat_id: string | null;
  tg_token: string;
}

export interface AppointmentItem {
  id: number;
  client_id: number;
  service_id: number;
  start_at: string;
  end_at: string;
  status: 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  price: number;
  comment: string;
  source: 'owner' | 'online';
  client_confirmed: boolean | null;
  client: ClientItem;
  service: ServiceItem;
}

export interface SalonSettings {
  salon_name: string;
  salon_address: string;
  work_start: string;
  work_end: string;
  slot_step: string;
  work_days: string;
  booking_horizon_days: string;
  min_lead_minutes: string;
  tz: string;
  telegram_enabled?: boolean;
  bot_username?: string | null;
}
