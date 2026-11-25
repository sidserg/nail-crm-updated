import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';

// ---------------- Types ----------------
interface UserRecord {
  id: number;
  login: string;
  passwordHash: string;
}

interface ClientRecord {
  id: number;
  name: string;
  phone: string;
  birth_date: string | null;
  notes: string;
  telegram_chat_id: string | null;
  tg_token: string;
  created_at: string;
}

interface ServiceRecord {
  id: number;
  name: string;
  duration_min: number;
  price: number;
  color: string;
  is_active: boolean;
}

type ApptStatus = 'confirmed' | 'completed' | 'cancelled' | 'no_show';

interface AppointmentRecord {
  id: number;
  client_id: number;
  service_id: number;
  start_at: string; // YYYY-MM-DDTHH:mm
  end_at: string;   // YYYY-MM-DDTHH:mm
  status: ApptStatus;
  price: number;
  comment: string;
  source: 'owner' | 'online';
  client_confirmed: boolean | null;
}

interface ExpenseRecord {
  id: number;
  date: string; // YYYY-MM-DD
  category: string;
  amount: number;
  comment: string;
}

interface TimeBlockRecord {
  id: number;
  start_at: string; // YYYY-MM-DDTHH:mm
  end_at: string;   // YYYY-MM-DDTHH:mm
  comment: string;
}

interface SettingsMap {
  salon_name: string;
  salon_address: string;
  work_start: string;
  work_end: string;
  slot_step: string;
  work_days: string; // "0,1,2,3,4,5" (Mon=0..Sun=6)
  booking_horizon_days: string;
  min_lead_minutes: string;
  tz: string;
}

interface StoreData {
  nextId: {
    user: number;
    client: number;
    service: number;
    appointment: number;
    expense: number;
    timeBlock: number;
  };
  users: UserRecord[];
  clients: ClientRecord[];
  services: ServiceRecord[];
  appointments: AppointmentRecord[];
  expenses: ExpenseRecord[];
  timeBlocks: TimeBlockRecord[];
  settings: SettingsMap;
}

// ---------------- Config & Security ----------------
const PORT = Number(process.env.PORT || 3000);
const TOKEN_SECRET = process.env.JWT_SECRET || 'nail-crm-dev-secret-change-in-prod';
// Data directory resolution order:
// 1. DATA_DIR — set to /data on Amvera, where the persistent volume is mounted.
// 2. ./data — local development fallback, keeps `npm run dev` working unchanged.
// On Amvera the app code lives in /app, which is replaced on every rebuild, so
// relying on the fallback there would wipe all CRM data on each deploy.
const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'nail-crm.json');
const BLOCKING_STATUSES = new Set<ApptStatus>(['confirmed', 'completed']);
const VALID_STATUSES = new Set<ApptStatus>(['confirmed', 'completed', 'cancelled', 'no_show']);

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, original] = stored.split(':');
  if (!salt || !original) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const target = Buffer.from(original, 'hex');
  if (candidate.length !== target.length) return false;
  return crypto.timingSafeEqual(candidate, target);
}

function createToken(userId: number): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: userId, exp: Date.now() + 30 * 24 * 3600 * 1000 }),
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyToken(token: string): number | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!parsed.sub || !parsed.exp || Date.now() > Number(parsed.exp)) return null;
    return Number(parsed.sub);
  } catch {
    return null;
  }
}

// ---------------- Timezone & Date Helpers ----------------
const pad2 = (n: number) => String(n).padStart(2, '0');

function getSalonClock(tz: string): { dateStr: string; timeStr: string; iso: string; minOfDay: number } {
  let zone = tz || 'Europe/Moscow';
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
    zone = 'UTC';
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
  }
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const hourNum = Number(map.hour === '24' ? '0' : map.hour);
  const minNum = Number(map.minute);
  const dateStr = `${map.year}-${map.month}-${map.day}`;
  const timeStr = `${pad2(hourNum)}:${pad2(minNum)}`;
  return {
    dateStr,
    timeStr,
    iso: `${dateStr}T${timeStr}`,
    minOfDay: hourNum * 60 + minNum,
  };
}

function addMinutesToISO(iso: string, minutes: number): string {
  const [datePart, timePart] = iso.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm] = timePart.split(':').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, hh, mm + minutes));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}T${pad2(dt.getUTCHours())}:${pad2(dt.getUTCMinutes())}`;
}

function addDaysToDateStr(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

function weekdayIdxFromDateStr(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const jsDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // Sun=0..Sat=6
  return (jsDay + 6) % 7; // Mon=0..Sun=6
}

function hhmmToMin(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

function minToHHMM(m: number): string {
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

function normalizePhone(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) return '7' + digits.slice(1);
  if (digits.length === 10 && digits.startsWith('9')) return '7' + digits;
  return digits;
}

function daysBetween(olderDateStr: string, newerDateStr: string): number {
  const [y1, m1, d1] = olderDateStr.split('-').map(Number);
  const [y2, m2, d2] = newerDateStr.split('-').map(Number);
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  return Math.floor((t2 - t1) / 86400000);
}

// ---------------- Persistence & Seeding ----------------

function ensureDataDir(): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err: unknown) {
    console.error(
      `Failed to create data directory ${DATA_DIR}:`,
      err instanceof Error ? err.message : err,
    );
    throw err;
  }
}

function createInitialStore(): StoreData {
  const tz = 'Europe/Moscow';
  const today = getSalonClock(tz).dateStr;
  const at = (dayOffset: number, hh: number, mm = 0) =>
    `${addDaysToDateStr(today, dayOffset)}T${pad2(hh)}:${pad2(mm)}`;

  const services: ServiceRecord[] = [
    { id: 1, name: 'Маникюр + гель-лак', duration_min: 90, price: 2200, color: '#e11d48', is_active: true },
    { id: 2, name: 'Маникюр (классический)', duration_min: 60, price: 1400, color: '#a21caf', is_active: true },
    { id: 3, name: 'Педикюр + гель-лак', duration_min: 90, price: 2600, color: '#7c3aed', is_active: true },
    { id: 4, name: 'Наращивание ногтей', duration_min: 150, price: 3500, color: '#0891b2', is_active: true },
    { id: 5, name: 'Коррекция наращивания', duration_min: 120, price: 2800, color: '#059669', is_active: true },
    { id: 6, name: 'Дизайн / укрепление', duration_min: 30, price: 500, color: '#d97706', is_active: true },
  ];

  const clients: ClientRecord[] = [
    { id: 1, name: 'Анна Смирнова', phone: '79161234567', birth_date: '1992-04-12', notes: 'Аллергия на ацетон! Любит нюдовые оттенки, форма — мягкий квадрат.', telegram_chat_id: '101', tg_token: crypto.randomBytes(12).toString('hex'), created_at: at(-90, 10) },
    { id: 2, name: 'Мария Иванова', phone: '79265557788', birth_date: '1988-11-03', notes: 'Красный гель-лак, миндаль. Постоянный клиент, приходит раз в 3 недели.', telegram_chat_id: '102', tg_token: crypto.randomBytes(12).toString('hex'), created_at: at(-80, 11) },
    { id: 3, name: 'Екатерина Козлова', phone: '79031112233', birth_date: '1995-07-21', notes: 'Педикюр раз в месяц, предпочитает классический френч.', telegram_chat_id: null, tg_token: crypto.randomBytes(12).toString('hex'), created_at: at(-65, 12) },
    { id: 4, name: 'Ольга Петрова', phone: '79150001122', birth_date: '1990-02-08', notes: 'Наращивание, длина 2. Просит напоминания за сутки.', telegram_chat_id: '104', tg_token: crypto.randomBytes(12).toString('hex'), created_at: at(-50, 14) },
    { id: 5, name: 'Виктория Соколова', phone: '79267778899', birth_date: '1998-09-30', notes: 'Любит яркий шиммер и втирку жемчуг.', telegram_chat_id: null, tg_token: crypto.randomBytes(12).toString('hex'), created_at: at(-40, 16) },
    { id: 6, name: 'Дарья Волкова', phone: '79998887766', birth_date: '1993-01-17', notes: 'Не была давно — предложить скидку 15% на обновление.', telegram_chat_id: null, tg_token: crypto.randomBytes(12).toString('hex'), created_at: at(-100, 12) },
    { id: 7, name: 'Алина Морозова', phone: '79057776655', birth_date: '1996-05-25', notes: 'Предпочитает вечерние слоты после 18:00.', telegram_chat_id: null, tg_token: crypto.randomBytes(12).toString('hex'), created_at: at(-110, 14) },
  ];

  let apptId = 1;
  const appts: AppointmentRecord[] = [];
  const pushAppt = (
    clientId: number,
    serviceId: number,
    startAt: string,
    status: ApptStatus,
    source: 'owner' | 'online' = 'owner',
    comment = '',
    confirmed: boolean | null = null,
  ) => {
    const svc = services.find((s) => s.id === serviceId)!;
    appts.push({
      id: apptId++,
      client_id: clientId,
      service_id: serviceId,
      start_at: startAt,
      end_at: addMinutesToISO(startAt, svc.duration_min),
      status,
      price: svc.price,
      comment,
      source,
      client_confirmed: confirmed,
    });
  };

  // Today
  pushAppt(1, 1, at(0, 10, 0), 'completed', 'owner', 'Нюдовая база + микрофренч', true);
  pushAppt(2, 2, at(0, 12, 0), 'completed', 'owner', '', true);
  pushAppt(3, 3, at(0, 14, 0), 'confirmed', 'online', 'Хочу френч, как в прошлый раз', true);
  pushAppt(4, 4, at(0, 16, 30), 'confirmed', 'owner', 'Длина 2, форма балерина');
  pushAppt(5, 2, at(0, 19, 30), 'confirmed', 'online', 'Снятие старого покрытия');

  // Recent days
  pushAppt(2, 1, at(-1, 11, 0), 'completed');
  pushAppt(1, 6, at(-1, 13, 0), 'completed');
  pushAppt(5, 2, at(-1, 15, 0), 'no_show');
  pushAppt(3, 1, at(-2, 10, 0), 'completed', 'online');
  pushAppt(4, 5, at(-3, 12, 0), 'completed');
  pushAppt(6, 1, at(-4, 16, 0), 'cancelled');

  // History for rich chart
  const hist: Array<[number, number, number]> = [
    [-6, 1, 1],
    [-8, 2, 3],
    [-10, 4, 4],
    [-13, 3, 1],
    [-16, 5, 2],
    [-20, 1, 1],
    [-24, 2, 1],
    [-27, 4, 5],
  ];
  for (const [off, cid, sid] of hist) {
    pushAppt(cid, sid, at(off, 12, 0), 'completed');
  }

  // Inactive clients
  pushAppt(6, 1, at(-75, 12, 0), 'completed');
  pushAppt(7, 3, at(-95, 14, 0), 'completed');

  // Upcoming
  pushAppt(1, 1, at(1, 10, 0), 'confirmed', 'owner', '', true);
  pushAppt(2, 2, at(1, 12, 30), 'confirmed', 'online');
  pushAppt(4, 5, at(2, 15, 0), 'confirmed');
  pushAppt(3, 1, at(3, 11, 0), 'confirmed', 'online');

  const expenses: ExpenseRecord[] = [
    { id: 1, date: today, category: 'Материалы', amount: 1200, comment: 'Гель-лаки, базы, топы' },
    { id: 2, date: addDaysToDateStr(today, -2), category: 'Инструменты', amount: 850, comment: 'Керамические фрезы' },
    { id: 3, date: addDaysToDateStr(today, -5), category: 'Материалы', amount: 2300, comment: 'Пилки, бафы, безворсовые салфетки' },
    { id: 4, date: addDaysToDateStr(today, -10), category: 'Аренда', amount: 15000, comment: 'Аренда студии' },
  ];

  const timeBlocks: TimeBlockRecord[] = [
    { id: 1, start_at: at(1, 14, 0), end_at: at(1, 14, 30), comment: 'Обеденный перерыв' },
  ];

  return {
    nextId: {
      user: 2,
      client: clients.length + 1,
      service: services.length + 1,
      appointment: apptId,
      expense: expenses.length + 1,
      timeBlock: timeBlocks.length + 1,
    },
    users: [
      { id: 1, login: 'admin', passwordHash: hashPassword('admin123') },
    ],
    clients,
    services,
    appointments: appts,
    expenses,
    timeBlocks,
    settings: {
      salon_name: 'Atelier Velvet Nails',
      salon_address: 'ул. Покровка, 28, студия 4',
      work_start: '09:00',
      work_end: '21:00',
      slot_step: '30',
      work_days: '0,1,2,3,4,5',
      booking_horizon_days: '21',
      min_lead_minutes: '60',
      tz,
    },
  };
}

function loadStore(): StoreData {
  let raw: string | null;
  try {
    raw = fs.readFileSync(DATA_FILE, 'utf8');
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code !== 'ENOENT') {
      // EACCES/EROFS/EISDIR: reading is impossible, but the file may still hold
      // real data. Seeding here would overwrite it, so fail loudly instead.
      console.error(`Cannot read ${DATA_FILE}:`, err instanceof Error ? err.message : err);
      throw err;
    }
    raw = null;
  }

  if (raw === null) {
    console.log(`No data file at ${DATA_FILE}, seeding a fresh store`);
    const initial = createInitialStore();
    saveStore(initial);
    return initial;
  }

  try {
    return JSON.parse(raw) as StoreData;
  } catch (err: unknown) {
    const backup = `${DATA_FILE}.corrupt-${new Date().toISOString().replace(/[:.]/g, '')}`;
    try {
      fs.copyFileSync(DATA_FILE, backup);
    } catch (copyErr: unknown) {
      console.error(
        `${DATA_FILE} is corrupt and backing it up failed (${
          copyErr instanceof Error ? copyErr.message : copyErr
        }); refusing to overwrite it with a seed`,
      );
      throw err;
    }
    console.error(
      `${DATA_FILE} is not valid JSON (${err instanceof Error ? err.message : err}); ` +
        `moved the original to ${backup} and seeded a fresh store`,
    );
    const initial = createInitialStore();
    saveStore(initial);
    return initial;
  }
}

function saveStore(data: StoreData): void {
  ensureDataDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

ensureDataDir();
const store: StoreData = loadStore();

// ---------------- Domain Logic ----------------
function getBusyIntervals(day: string, excludeApptId?: number): Array<[string, string]> {
  const dayStart = `${day}T00:00`;
  const dayEnd = `${addDaysToDateStr(day, 1)}T00:00`;
  const intervals: Array<[string, string]> = [];
  for (const a of store.appointments) {
    if (excludeApptId && a.id === excludeApptId) continue;
    if (BLOCKING_STATUSES.has(a.status) && a.start_at < dayEnd && a.end_at > dayStart) {
      intervals.push([a.start_at, a.end_at]);
    }
  }
  for (const b of store.timeBlocks) {
    if (b.start_at < dayEnd && b.end_at > dayStart) {
      intervals.push([b.start_at, b.end_at]);
    }
  }
  return intervals;
}

function checkOverlap(startAt: string, endAt: string, excludeApptId?: number): string | null {
  for (const a of store.appointments) {
    if (excludeApptId && a.id === excludeApptId) continue;
    if (BLOCKING_STATUSES.has(a.status) && a.start_at < endAt && a.end_at > startAt) {
      return 'Это время уже занято другой записью';
    }
  }
  for (const b of store.timeBlocks) {
    if (b.start_at < endAt && b.end_at > startAt) {
      return 'Это время заблокировано мастером';
    }
  }
  return null;
}

function getSlotsForDay(day: string, serviceId: number | null, isPublic: boolean): Array<{ start: string; end: string; available: boolean }> {
  const st = store.settings;
  let duration = Number(st.slot_step);
  if (serviceId !== null) {
    const svc = store.services.find((s) => s.id === serviceId);
    if (!svc || (isPublic && !svc.is_active)) {
      throw Object.assign(new Error('Услуга не найдена'), { status: 404 });
    }
    duration = svc.duration_min;
  }
  const workDays = (st.work_days || '').split(',').filter(Boolean);
  if (!workDays.includes(String(weekdayIdxFromDateStr(day)))) {
    return [];
  }

  const startMin = hhmmToMin(st.work_start);
  const endMin = hhmmToMin(st.work_end);
  const step = Math.max(5, Number(st.slot_step) || 30);
  const busy = getBusyIntervals(day);

  // CRITICAL FIX FOR BUG 1: Always compare against the salon's configured timezone clock!
  const clock = getSalonClock(st.tz);
  const leadMinutes = Math.max(0, Number(st.min_lead_minutes) || 0);
  const cutoffISO = isPublic ? addMinutesToISO(clock.iso, leadMinutes) : clock.iso;

  const slots: Array<{ start: string; end: string; available: boolean }> = [];
  for (let m = startMin; m + duration <= endMin; m += step) {
    const startISO = `${day}T${minToHHMM(m)}`;
    const endISO = addMinutesToISO(startISO, duration);
    let free = busy.every(([bStart, bEnd]) => !(startISO < bEnd && endISO > bStart));

    // Strictly forbid past slots (and for public booking, slots earlier than now + min_lead_minutes)
    if (startISO <= clock.iso) {
      free = false;
    } else if (isPublic && startISO < cutoffISO) {
      free = false;
    }
    slots.push({ start: startISO, end: endISO, available: free });
  }
  return slots;
}

function enrichAppointment(a: AppointmentRecord) {
  const client = store.clients.find((c) => c.id === a.client_id);
  const service = store.services.find((s) => s.id === a.service_id);
  return {
    ...a,
    client: client || { id: a.client_id, name: 'Удалённый клиент', phone: '', notes: '', birth_date: null, telegram_chat_id: null, tg_token: '' },
    service: service || { id: a.service_id, name: 'Услуга', duration_min: 60, price: a.price, color: '#e11d48', is_active: true },
  };
}

// ---------------- Express App & Middleware ----------------
const app = express();
app.use(express.json());

// Token Bucket Rate Limiter - smoother handling of burst traffic
interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

const tokenBuckets = new Map<string, { tokens: number; lastRefill: number }>();

const tokenBucketRateLimit = (maxTokens: number, refillRatePerSec: number) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const bucket = tokenBuckets.get(key) || { tokens: maxTokens, lastRefill: now };

    // Refill tokens based on time passed
    const timePassedSec = (now - bucket.lastRefill) / 1000;
    const tokensToAdd = timePassedSec * refillRatePerSec;
    bucket.tokens = Math.min(maxTokens, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      tokenBuckets.set(key, bucket);
      next();
    } else {
      // Calculate when next token will be available
      const retryAfter = Math.ceil((1 - bucket.tokens) / refillRatePerSec);
      res.set('Retry-After', retryAfter.toString());
      res.status(429).json({ detail: 'Слишком много запросов. Попробуйте позже.' });
    }
  };
};

// More generous limits with token bucket algorithm
const slotsRateLimit = tokenBucketRateLimit(120, 2);   // 120 tokens, refill 2/sec = ~120 req/min burst
const bookRateLimit = tokenBucketRateLimit(30, 0.5);    // 30 tokens, refill 0.5/sec = ~30 req/min burst
const generalRateLimit = tokenBucketRateLimit(200, 5);  // 200 tokens, refill 5/sec for other public endpoints

// Middleware for caching public API responses
app.use((req: Request, res: Response, next: NextFunction) => {
  const path = req.path;
  // Cache services (10 minutes)
  if (path === '/api/public/services' && req.method === 'GET') {
    res.setHeader('Cache-Control', 'public, max-age=600');
  }
  // Cache config settings (1 hour)
  else if (path === '/api/public/config' && req.method === 'GET') {
    res.setHeader('Cache-Control', 'public, max-age=3600');
  }
  // Do not cache slots or appointments (they change frequently)
  next();
});

interface AuthRequest extends Request {
  userId?: number;
}

function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const userId = token ? verifyToken(token) : null;
  if (!userId) {
    res.status(401).json({ detail: 'Требуется авторизация' });
    return;
  }
  req.userId = userId;
  next();
}

// Health
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// ---------------- Auth ----------------
app.post('/api/auth/login', (req, res) => {
  const login = String(req.body?.login || '').trim();
  const password = String(req.body?.password || '');
  const user = store.users.find((u) => u.login === login);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ detail: 'Неверный логин или пароль' });
    return;
  }
  res.json({ token: createToken(user.id), login: user.login });
});

app.get('/api/auth/me', requireAuth, (req: AuthRequest, res) => {
  const user = store.users.find((u) => u.id === req.userId);
  if (!user) {
    res.status(401).json({ detail: 'Пользователь не найден' });
    return;
  }
  res.json({ id: user.id, login: user.login });
});

app.post('/api/auth/change-password', requireAuth, (req: AuthRequest, res) => {
  const oldPw = String(req.body?.old_password || '');
  const newPw = String(req.body?.new_password || '');
  const user = store.users.find((u) => u.id === req.userId);
  if (!user || !verifyPassword(oldPw, user.passwordHash)) {
    res.status(400).json({ detail: 'Текущий пароль указан неверно' });
    return;
  }
  if (newPw.length < 6) {
    res.status(422).json({ detail: 'Новый пароль должен быть не короче 6 символов' });
    return;
  }
  user.passwordHash = hashPassword(newPw);
  saveStore(store);
  res.json({ ok: true });
});

// ---------------- Public Booking API ----------------
// Rate limiting removed - was causing 429 errors on public booking endpoints
// The token bucket implementation is kept for potential future use but not applied to public endpoints
app.get('/api/public/config', (_req, res) => {
  const st = store.settings;
  const clock = getSalonClock(st.tz);
  res.json({
    salon_name: st.salon_name,
    salon_address: st.salon_address,
    work_days: st.work_days,
    work_start: st.work_start,
    work_end: st.work_end,
    booking_horizon_days: Number(st.booking_horizon_days),
    min_lead_minutes: Number(st.min_lead_minutes),
    tz: st.tz,
    salon_now: clock.iso,
    salon_today: clock.dateStr,
    bot_username: null,
    demo: true,
  });
});

app.get('/api/public/services', (_req, res) => {
  const active = store.services
    .filter((s) => s.is_active)
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  res.json(active);
});

app.get('/api/public/slots', (req, res) => {
  // No rate limiting - was causing 429 errors
  const day = String(req.query.date || '');
  const serviceId = Number(req.query.service_id);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !serviceId) {
    res.status(422).json({ detail: 'Некорректные параметры даты или услуги' });
    return;
  }
  const st = store.settings;
  const clock = getSalonClock(st.tz);
  const horizon = Number(st.booking_horizon_days);
  const maxDay = addDaysToDateStr(clock.dateStr, horizon);
  if (day < clock.dateStr || day > maxDay) {
    res.json([]);
    return;
  }
  try {
    const slots = getSlotsForDay(day, serviceId, true).filter((s) => s.available);
    res.json(slots);
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status || 400;
    const message = err instanceof Error ? err.message : 'Ошибка подбора слотов';
    res.status(status).json({ detail: message });
  }
});

app.post('/api/public/book', (req, res) => { // No rate limiting - was causing 429 errors
  const name = String(req.body?.name || '').trim();
  const rawPhone = String(req.body?.phone || '');
  const serviceId = Number(req.body?.service_id);
  const startAt = String(req.body?.start_at || '').slice(0, 16);
  const comment = String(req.body?.comment || '').trim();

  if (name.length < 2) {
    res.status(422).json({ detail: 'Укажите ваше имя (минимум 2 символа)' });
    return;
  }
  const phone = normalizePhone(rawPhone);
  if (phone.length < 10) {
    res.status(422).json({ detail: 'Укажите корректный номер телефона (10–11 цифр)' });
    return;
  }
  const service = store.services.find((s) => s.id === serviceId && s.is_active);
  if (!service) {
    res.status(404).json({ detail: 'Услуга недоступна для записи' });
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(startAt)) {
    res.status(422).json({ detail: 'Некорректное время записи' });
    return;
  }

  const st = store.settings;
  const clock = getSalonClock(st.tz);
  const day = startAt.slice(0, 10);
  const horizon = Number(st.booking_horizon_days);
  const maxDay = addDaysToDateStr(clock.dateStr, horizon);

  if (day < clock.dateStr || day > maxDay) {
    res.status(422).json({ detail: 'Эта дата недоступна для онлайн-записи' });
    return;
  }
  if (startAt <= clock.iso) {
    res.status(422).json({ detail: 'Нельзя записаться на время, которое уже прошло' });
    return;
  }
  const minAllowedISO = addMinutesToISO(clock.iso, Math.max(0, Number(st.min_lead_minutes) || 0));
  if (startAt < minAllowedISO) {
    res.status(422).json({ detail: 'Слишком близко к текущему времени — выберите более поздний слот' });
    return;
  }

  const slots = getSlotsForDay(day, service.id, true);
  const matched = slots.find((s) => s.start === startAt && s.available);
  if (!matched) {
    res.status(409).json({ detail: 'Этот слот уже занят или недоступен. Выберите другое время.' });
    return;
  }

  const endAt = addMinutesToISO(startAt, service.duration_min);
  const conflict = checkOverlap(startAt, endAt);
  if (conflict) {
    res.status(409).json({ detail: conflict });
    return;
  }

  let client = store.clients.find((c) => c.phone === phone);
  if (!client) {
    client = {
      id: store.nextId.client++,
      name,
      phone,
      birth_date: null,
      notes: '',
      telegram_chat_id: null,
      tg_token: crypto.randomBytes(12).toString('hex'),
      created_at: clock.iso,
    };
    store.clients.push(client);
  }

  const appt: AppointmentRecord = {
    id: store.nextId.appointment++,
    client_id: client.id,
    service_id: service.id,
    start_at: startAt,
    end_at: endAt,
    status: 'confirmed',
    price: service.price,
    comment,
    source: 'online',
    client_confirmed: null,
  };
  store.appointments.push(appt);
  saveStore(store);

  res.status(201).json({
    ok: true,
    appointment: {
      start_at: appt.start_at,
      end_at: appt.end_at,
      service: service.name,
      price: service.price,
    },
    salon_name: st.salon_name,
    salon_address: st.salon_address,
  });
});

// ---------------- Settings (Auth) ----------------
app.get('/api/settings', requireAuth, (_req, res) => {
  res.json({
    ...store.settings,
    telegram_enabled: false,
    bot_username: null,
  });
});

app.put('/api/settings', requireAuth, (req, res) => {
  const next = { ...store.settings, ...req.body };
  if (hhmmToMin(next.work_start) >= hhmmToMin(next.work_end)) {
    res.status(422).json({ detail: 'Время начала работы должно быть раньше окончания' });
    return;
  }
  const step = Number(next.slot_step);
  if (![10, 15, 20, 30, 60].includes(step)) {
    res.status(422).json({ detail: 'Шаг сетки должен быть 10, 15, 20, 30 или 60 мин' });
    return;
  }
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: next.tz });
  } catch {
    res.status(422).json({ detail: 'Некорректный часовой пояс' });
    return;
  }
  store.settings = {
    salon_name: String(next.salon_name || 'Nail Studio').trim(),
    salon_address: String(next.salon_address || '').trim(),
    work_start: String(next.work_start),
    work_end: String(next.work_end),
    slot_step: String(step),
    work_days: String(next.work_days || ''),
    booking_horizon_days: String(Math.min(90, Math.max(1, Number(next.booking_horizon_days) || 14))),
    min_lead_minutes: String(Math.min(1440, Math.max(0, Number(next.min_lead_minutes) || 0))),
    tz: String(next.tz || 'Europe/Moscow'),
  };
  saveStore(store);
  res.json({ ...store.settings, telegram_enabled: false, bot_username: null });
});

// ---------------- Services (Auth) ----------------
app.get('/api/services', requireAuth, (_req, res) => {
  const list = [...store.services].sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
    return a.name.localeCompare(b.name, 'ru');
  });
  res.json(list);
});

app.post('/api/services', requireAuth, (req, res) => {
  const name = String(req.body?.name || '').trim();
  const durationMin = Number(req.body?.duration_min);
  const price = Number(req.body?.price);
  const color = String(req.body?.color || '#e11d48');
  const isActive = req.body?.is_active !== false;
  if (!name || durationMin < 5 || price < 0) {
    res.status(422).json({ detail: 'Проверьте название, длительность и цену услуги' });
    return;
  }
  const svc: ServiceRecord = {
    id: store.nextId.service++,
    name,
    duration_min: durationMin,
    price,
    color,
    is_active: isActive,
  };
  store.services.push(svc);
  saveStore(store);
  res.status(201).json(svc);
});

app.patch('/api/services/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const svc = store.services.find((s) => s.id === id);
  if (!svc) {
    res.status(404).json({ detail: 'Услуга не найдена' });
    return;
  }
  svc.name = String(req.body?.name ?? svc.name).trim();
  svc.duration_min = Number(req.body?.duration_min ?? svc.duration_min);
  svc.price = Number(req.body?.price ?? svc.price);
  svc.color = String(req.body?.color ?? svc.color);
  svc.is_active = req.body?.is_active !== undefined ? Boolean(req.body.is_active) : svc.is_active;
  saveStore(store);
  res.json(svc);
});

app.delete('/api/services/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const idx = store.services.findIndex((s) => s.id === id);
  if (idx === -1) {
    res.status(404).json({ detail: 'Услуга не найдена' });
    return;
  }
  const used = store.appointments.some((a) => a.service_id === id);
  if (used) {
    res.status(409).json({
      detail: 'По этой услуге есть записи — нельзя удалить. Отключите её (снимите «Активна»), чтобы скрыть из записи.',
    });
    return;
  }
  store.services.splice(idx, 1);
  saveStore(store);
  res.json({ ok: true });
});

// ---------------- Clients (Auth) ----------------
app.get('/api/clients', requireAuth, (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const digitsQ = q.replace(/\D/g, '');
  let list = [...store.clients];
  if (q) {
    list = list.filter(
      (c) => c.name.toLowerCase().includes(q) || (digitsQ && c.phone.includes(digitsQ)),
    );
  }
  list.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  res.json(list);
});

app.post('/api/clients', requireAuth, (req, res) => {
  const name = String(req.body?.name || '').trim();
  const phone = normalizePhone(String(req.body?.phone || ''));
  if (!name) {
    res.status(422).json({ detail: 'Укажите имя клиента' });
    return;
  }
  if (phone.length < 6) {
    res.status(422).json({ detail: 'Укажите корректный номер телефона' });
    return;
  }
  const clash = store.clients.find((c) => c.phone === phone);
  if (clash) {
    res.status(409).json({ detail: `Клиент с этим номером уже есть: «${clash.name}»` });
    return;
  }
  const client: ClientRecord = {
    id: store.nextId.client++,
    name,
    phone,
    birth_date: req.body?.birth_date || null,
    notes: String(req.body?.notes || ''),
    telegram_chat_id: null,
    tg_token: crypto.randomBytes(12).toString('hex'),
    created_at: getSalonClock(store.settings.tz).iso,
  };
  store.clients.push(client);
  saveStore(store);
  res.status(201).json(client);
});

app.get('/api/clients/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const client = store.clients.find((c) => c.id === id);
  if (!client) {
    res.status(404).json({ detail: 'Клиент не найден' });
    return;
  }
  const appts = store.appointments
    .filter((a) => a.client_id === id)
    .sort((a, b) => b.start_at.localeCompare(a.start_at))
    .map(enrichAppointment);
  const completed = appts.filter((a) => a.status === 'completed');
  const totalSpent = Math.round(completed.reduce((s, a) => s + (a.price || 0), 0) * 100) / 100;
  res.json({
    client,
    stats: {
      visits: completed.length,
      total_spent: totalSpent,
      last_visit: completed[0]?.start_at || null,
    },
    appointments: appts,
  });
});

app.patch('/api/clients/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const client = store.clients.find((c) => c.id === id);
  if (!client) {
    res.status(404).json({ detail: 'Клиент не найден' });
    return;
  }
  const name = String(req.body?.name ?? client.name).trim();
  const phone = normalizePhone(String(req.body?.phone ?? client.phone));
  if (phone.length < 6) {
    res.status(422).json({ detail: 'Укажите корректный номер телефона' });
    return;
  }
  const clash = store.clients.find((c) => c.phone === phone && c.id !== id);
  if (clash) {
    res.status(409).json({ detail: `Этот номер уже записан у клиента «${clash.name}»` });
    return;
  }
  client.name = name;
  client.phone = phone;
  client.birth_date = req.body?.birth_date !== undefined ? req.body.birth_date : client.birth_date;
  client.notes = req.body?.notes !== undefined ? String(req.body.notes) : client.notes;
  saveStore(store);
  res.json(client);
});

app.delete('/api/clients/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const idx = store.clients.findIndex((c) => c.id === id);
  if (idx === -1) {
    res.status(404).json({ detail: 'Клиент не найден' });
    return;
  }
  const force = req.query.force === 'true';
  const count = store.appointments.filter((a) => a.client_id === id).length;
  if (count > 0 && !force) {
    res.status(409).json({
      detail: `У клиента есть записи (${count} шт.). Удалите их или подтвердите удаление вместе с записями.`,
    });
    return;
  }
  store.appointments = store.appointments.filter((a) => a.client_id !== id);
  store.clients.splice(idx, 1);
  saveStore(store);
  res.json({ ok: true });
});

// ---------------- Appointments & Slots (Auth) ----------------
app.get('/api/appointments', requireAuth, (req, res) => {
  const dateFrom = String(req.query.from || '');
  const dateTo = String(req.query.to || '');
  const start = `${dateFrom}T00:00`;
  const end = `${addDaysToDateStr(dateTo, 1)}T00:00`;
  const list = store.appointments
    .filter((a) => a.start_at < end && a.end_at > start)
    .sort((a, b) => a.start_at.localeCompare(b.start_at))
    .map(enrichAppointment);
  res.json(list);
});

app.post('/api/appointments', requireAuth, (req, res) => {
  const clientId = Number(req.body?.client_id);
  const serviceId = Number(req.body?.service_id);
  const startAt = String(req.body?.start_at || '').slice(0, 16);
  const clock = getSalonClock(store.settings.tz);
  if (startAt < clock.iso) {
    res.status(400).json({ detail: 'Нельзя создать запись на прошедшее время' });
    return;
  }
  const client = store.clients.find((c) => c.id === clientId);
  const service = store.services.find((s) => s.id === serviceId);
  if (!client || !service) {
    res.status(404).json({ detail: 'Клиент или услуга не найдены' });
    return;
  }
  const endAt = addMinutesToISO(startAt, service.duration_min);
  const conflict = checkOverlap(startAt, endAt);
  if (conflict) {
    res.status(409).json({ detail: conflict });
    return;
  }
  const appt: AppointmentRecord = {
    id: store.nextId.appointment++,
    client_id: client.id,
    service_id: service.id,
    start_at: startAt,
    end_at: endAt,
    status: 'confirmed',
    price: req.body?.price !== undefined && req.body?.price !== null ? Number(req.body.price) : service.price,
    comment: String(req.body?.comment || ''),
    source: 'owner',
    client_confirmed: null,
  };
  store.appointments.push(appt);
  saveStore(store);
  res.status(201).json(enrichAppointment(appt));
});

app.patch('/api/appointments/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const appt = store.appointments.find((a) => a.id === id);
  if (!appt) {
    res.status(404).json({ detail: 'Запись не найдена' });
    return;
  }
  const body = req.body || {};
  if (body.status !== undefined) {
    if (!VALID_STATUSES.has(body.status)) {
      res.status(422).json({ detail: 'Недопустимый статус' });
      return;
    }
    appt.status = body.status;
  }
  if (body.client_id !== undefined) {
    if (!store.clients.some((c) => c.id === Number(body.client_id))) {
      res.status(404).json({ detail: 'Клиент не найден' });
      return;
    }
    appt.client_id = Number(body.client_id);
  }
  if (body.service_id !== undefined) {
    if (!store.services.some((s) => s.id === Number(body.service_id))) {
      res.status(404).json({ detail: 'Услуга не найдена' });
      return;
    }
    appt.service_id = Number(body.service_id);
  }
  if (body.comment !== undefined) {
    appt.comment = String(body.comment || '');
  }
  if (body.price !== undefined) {
    const svc = store.services.find((s) => s.id === appt.service_id);
    appt.price = body.price !== null ? Number(body.price) : (svc?.price ?? appt.price);
  }
  if (body.start_at !== undefined || body.service_id !== undefined) {
    const newStart = body.start_at ? String(body.start_at).slice(0, 16) : appt.start_at;
    if (body.start_at && newStart !== appt.start_at && newStart < getSalonClock(store.settings.tz).iso) {
      res.status(400).json({ detail: 'Нельзя перенести запись на прошедшее время' });
      return;
    }
    const svc = store.services.find((s) => s.id === appt.service_id)!;
    const endAt = addMinutesToISO(newStart, svc.duration_min);
    const conflict = checkOverlap(newStart, endAt, appt.id);
    if (conflict) {
      res.status(409).json({ detail: conflict });
      return;
    }
    appt.start_at = newStart;
    appt.end_at = endAt;
  }
  saveStore(store);
  res.json(enrichAppointment(appt));
});

app.delete('/api/appointments/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const idx = store.appointments.findIndex((a) => a.id === id);
  if (idx === -1) {
    res.status(404).json({ detail: 'Запись не найдена' });
    return;
  }
  store.appointments.splice(idx, 1);
  saveStore(store);
  res.json({ ok: true });
});

app.get('/api/slots', requireAuth, (req, res) => {
  const day = String(req.query.date || '');
  const serviceId = req.query.service_id ? Number(req.query.service_id) : null;
  try {
    res.json(getSlotsForDay(day, serviceId, false));
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status || 400;
    const message = err instanceof Error ? err.message : 'Ошибка';
    res.status(status).json({ detail: message });
  }
});

// ---------------- Time Blocks (Auth) ----------------
app.get('/api/time-blocks', requireAuth, (req, res) => {
  const dateFrom = String(req.query.from || '');
  const dateTo = String(req.query.to || '');
  const start = `${dateFrom}T00:00`;
  const end = `${addDaysToDateStr(dateTo, 1)}T00:00`;
  const list = store.timeBlocks
    .filter((b) => b.start_at < end && b.end_at > start)
    .sort((a, b) => a.start_at.localeCompare(b.start_at));
  res.json(list);
});

app.post('/api/time-blocks', requireAuth, (req, res) => {
  const startAt = String(req.body?.start_at || '').slice(0, 16);
  const endAt = String(req.body?.end_at || '').slice(0, 16);
  const comment = String(req.body?.comment || '').trim();
  if (startAt < getSalonClock(store.settings.tz).iso) {
    res.status(400).json({ detail: 'Нельзя заблокировать прошедшее время' });
    return;
  }
  const conflict = checkOverlap(startAt, endAt);
  if (conflict) {
    res.status(409).json({ detail: conflict });
    return;
  }
  const block: TimeBlockRecord = {
    id: store.nextId.timeBlock++,
    start_at: startAt,
    end_at: endAt,
    comment,
  };
  store.timeBlocks.push(block);
  saveStore(store);
  res.status(201).json(block);
});

app.delete('/api/time-blocks/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const idx = store.timeBlocks.findIndex((b) => b.id === id);
  if (idx === -1) {
    res.status(404).json({ detail: 'Блок не найден' });
    return;
  }
  store.timeBlocks.splice(idx, 1);
  saveStore(store);
  res.status(204).end();
});

// ---------------- Overview & Analytics (Auth) ----------------
app.get('/api/overview/stats', requireAuth, (req, res) => {
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  if (!year || !month || month < 1 || month > 12) {
    res.status(422).json({ detail: 'Некорректный год или месяц' });
    return;
  }
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const prefix = `${year}-${pad2(month)}-`;
  const stats: Record<string, number> = {};
  for (let d = 1; d <= daysInMonth; d++) stats[String(d)] = 0;

  for (const a of store.appointments) {
    if (!BLOCKING_STATUSES.has(a.status)) continue;
    if (a.start_at.startsWith(prefix)) {
      const dayNum = Number(a.start_at.slice(8, 10));
      stats[String(dayNum)] = (stats[String(dayNum)] || 0) + 1;
    }
  }
  res.json(stats);
});

app.get('/api/expenses', requireAuth, (req, res) => {
  const dateFrom = String(req.query.from || '');
  const dateTo = String(req.query.to || '');
  const list = store.expenses
    .filter((e) => e.date >= dateFrom && e.date <= dateTo)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  res.json(list);
});

app.post('/api/expenses', requireAuth, (req, res) => {
  const date = String(req.body?.date || '');
  const category = String(req.body?.category || 'Материалы');
  const amount = Number(req.body?.amount);
  const comment = String(req.body?.comment || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(amount > 0)) {
    res.status(422).json({ detail: 'Укажите дату и положительную сумму' });
    return;
  }
  const expense: ExpenseRecord = {
    id: store.nextId.expense++,
    date,
    category,
    amount,
    comment,
  };
  store.expenses.push(expense);
  saveStore(store);
  res.status(201).json(expense);
});

app.delete('/api/expenses/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const idx = store.expenses.findIndex((e) => e.id === id);
  if (idx === -1) {
    res.status(404).json({ detail: 'Расход не найден' });
    return;
  }
  store.expenses.splice(idx, 1);
  saveStore(store);
  res.json({ ok: true });
});

app.get('/api/analytics/summary', requireAuth, (req, res) => {
  const dateFrom = String(req.query.from || '');
  const dateTo = String(req.query.to || '');
  const start = `${dateFrom}T00:00`;
  const end = `${addDaysToDateStr(dateTo, 1)}T00:00`;

  const appts = store.appointments.filter((a) => a.start_at >= start && a.start_at < end);
  const completed = appts.filter((a) => a.status === 'completed');
  const revenue = Math.round(completed.reduce((s, a) => s + (a.price || 0), 0) * 100) / 100;

  const byDay: Record<string, number> = {};
  const svcStats = new Map<number, { name: string; color: string; count: number; revenue: number }>();

  for (const a of completed) {
    const day = a.start_at.slice(0, 10);
    byDay[day] = (byDay[day] || 0) + (a.price || 0);
    const svc = store.services.find((s) => s.id === a.service_id);
    const cur = svcStats.get(a.service_id) || {
      name: svc?.name || 'Услуга',
      color: svc?.color || '#e11d48',
      count: 0,
      revenue: 0,
    };
    cur.count += 1;
    cur.revenue += a.price || 0;
    svcStats.set(a.service_id, cur);
  }

  const days: Array<{ date: string; revenue: number }> = [];
  let cursor = dateFrom;
  while (cursor <= dateTo) {
    days.push({ date: cursor, revenue: Math.round((byDay[cursor] || 0) * 100) / 100 });
    cursor = addDaysToDateStr(cursor, 1);
  }

  const expensesTotal = Math.round(
    store.expenses
      .filter((e) => e.date >= dateFrom && e.date <= dateTo)
      .reduce((s, e) => s + e.amount, 0) * 100,
  ) / 100;

  const statusCounts = {
    confirmed: appts.filter((a) => a.status === 'confirmed').length,
    completed: completed.length,
    cancelled: appts.filter((a) => a.status === 'cancelled').length,
    no_show: appts.filter((a) => a.status === 'no_show').length,
  };

  const topServices = [...svcStats.values()]
    .sort((a, b) => b.count - a.count || b.revenue - a.revenue)
    .slice(0, 5)
    .map((t) => ({ ...t, revenue: Math.round(t.revenue * 100) / 100 }));

  res.json({
    revenue,
    completed_count: completed.length,
    avg_check: completed.length ? Math.round((revenue / completed.length) * 100) / 100 : 0,
    expenses: expensesTotal,
    net_profit: Math.round((revenue - expensesTotal) * 100) / 100,
    revenue_by_day: days,
    top_services: topServices,
    status_counts: statusCounts,
  });
});

app.get('/api/analytics/inactive', requireAuth, (req, res) => {
  const days = Math.min(365, Math.max(7, Number(req.query.days || 60)));
  const today = getSalonClock(store.settings.tz).dateStr;
  const result = [];

  for (const client of store.clients) {
    const completed = store.appointments
      .filter((a) => a.client_id === client.id && a.status === 'completed')
      .sort((a, b) => b.start_at.localeCompare(a.start_at));
    if (completed.length === 0) continue;
    const last = completed[0].start_at;
    const diff = daysBetween(last.slice(0, 10), today);
    if (diff >= days) {
      result.push({
        id: client.id,
        name: client.name,
        phone: client.phone,
        last_visit: last,
        days_ago: diff,
        visits: completed.length,
        total_spent: Math.round(completed.reduce((s, a) => s + (a.price || 0), 0) * 100) / 100,
        has_telegram: Boolean(client.telegram_chat_id),
      });
    }
  }
  result.sort((a, b) => b.days_ago - a.days_ago);
  res.json(result);
});

// ---------------- Project Export ZIP ----------------
app.get('/api/download-project', (_req, res) => {
  try {
    const outZip = '/tmp/nail-crm-updated.zip';
    const script = [
      'import os, zipfile',
      `root = ${JSON.stringify(process.cwd())}`,
      `out = ${JSON.stringify(outZip)}`,
      'skip_dirs = {"node_modules", "dist", "data", ".git", ".aistudio"}',
      'skip_files = {".env", "bun.lock"}',
      'with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:',
      '    for dirpath, dirnames, filenames in os.walk(root):',
      '        dirnames[:] = [d for d in dirnames if d not in skip_dirs]',
      '        for fn in filenames:',
      '            if fn in skip_files or fn.endswith(".log"):',
      '                continue',
      '            full = os.path.join(dirpath, fn)',
      '            rel = os.path.relpath(full, root)',
      '            zf.write(full, rel)',
    ].join('\n');
    execFileSync('python3', ['-c', script], { timeout: 15000 });
    res.download(outZip, 'nail-crm-updated.zip');
  } catch (err: unknown) {
    res.status(500).json({ detail: 'Не удалось собрать архив проекта' });
  }
});

// ---------------- Vite / Static Serving ----------------
async function start() {
  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Nail Studio CRM listening on http://0.0.0.0:${PORT}`);
    console.log(`CRM data file: ${DATA_FILE}`);
  });
}

start();
