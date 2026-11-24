import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, ExternalLink, Lock, Save } from 'lucide-react';
import { api, copyText } from '../lib/api';
import { useSettings } from '../context/SettingsContext';
import { BTN_PRIMARY, BTN_SECONDARY, Field, INPUT_CLS, useToast } from '../components/UI';
import { WEEKDAYS } from '../lib/utils';

const TIMEZONES = [
  { value: 'Europe/Moscow', label: 'Москва (UTC+3)' },
  { value: 'Europe/Kaliningrad', label: 'Калининград (UTC+2)' },
  { value: 'Europe/Samara', label: 'Самара (UTC+4)' },
  { value: 'Asia/Yekaterinburg', label: 'Екатеринбург (UTC+5)' },
  { value: 'Asia/Omsk', label: 'Омск (UTC+6)' },
  { value: 'Asia/Novosibirsk', label: 'Новосибирск (UTC+7)' },
  { value: 'Asia/Irkutsk', label: 'Иркутск (UTC+8)' },
  { value: 'Asia/Vladivostok', label: 'Владивосток (UTC+10)' },
  { value: 'Europe/Minsk', label: 'Минск (UTC+3)' },
  { value: 'Asia/Almaty', label: 'Алматы (UTC+5)' },
  { value: 'UTC', label: 'UTC' },
];

export default function SettingsPage() {
  const { settings, refresh } = useSettings();
  const toast = useToast();
  const [form, setForm] = useState({ ...settings });
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState({ old: '', next: '', repeat: '' });

  const workDays = (form.work_days || '').split(',').filter(Boolean);

  const toggleDay = (i: number) => {
    const s = new Set(workDays);
    if (s.has(String(i))) s.delete(String(i));
    else s.add(String(i));
    setForm({ ...form, work_days: [...s].sort().join(',') });
  };

  const save = async () => {
    setBusy(true);
    try {
      await api('/settings', { method: 'PUT', body: form });
      await refresh();
      toast('Настройки сохранены');
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Ошибка сохранения', 'err');
    } finally {
      setBusy(false);
    }
  };

  const bookUrl = `${window.location.origin}/book`;

  const copyLink = async () => {
    const ok = await copyText(bookUrl);
    toast(ok ? 'Ссылка скопирована' : 'Не удалось скопировать', ok ? 'ok' : 'err');
  };

  const changePassword = async () => {
    if (pw.next !== pw.repeat) {
      toast('Новые пароли не совпадают', 'err');
      return;
    }
    try {
      await api('/auth/change-password', {
        method: 'POST',
        body: { old_password: pw.old, new_password: pw.next },
      });
      setPw({ old: '', next: '', repeat: '' });
      toast('Пароль изменён');
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Ошибка смены пароля', 'err');
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="font-display text-3xl font-bold text-[#241322]">Настройки студии</h1>
        <p className="text-xs text-rose-900/60 mt-0.5">
          Ссылка для клиентов, расписание, часовой пояс и безопасность кабинета
        </p>
      </div>

      {/* Online Booking Link */}
      <div className="rounded-3xl bg-gradient-to-br from-rose-50 via-white to-fuchsia-50 border border-rose-200/80 p-6 space-y-3">
        <h2 className="text-base font-bold text-[#241322]">Ссылка для онлайн-записи клиентов</h2>
        <p className="text-xs text-rose-950/70">
          Клиенты видят только актуальные будущие свободные окна в вашем часовом поясе и не могут записаться на прошедшее время.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className={`${INPUT_CLS} flex-1 min-w-[220px] font-mono-num text-xs`}
            readOnly
            value={bookUrl}
            onFocus={(e) => e.target.select()}
          />
          <button type="button" className={BTN_SECONDARY} onClick={copyLink}>
            <Copy className="w-4 h-4" />
            Копировать
          </button>
          <Link to="/book" className={BTN_PRIMARY}>
            Открыть
            <ExternalLink className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Salon & Schedule */}
      <div className="rounded-3xl bg-white border border-rose-100 p-6 space-y-5">
        <h2 className="text-base font-bold text-[#241322]">Студия и расписание</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Название студии">
            <input
              className={INPUT_CLS}
              value={form.salon_name}
              onChange={(e) => setForm({ ...form, salon_name: e.target.value })}
            />
          </Field>
          <Field label="Адрес (показывается на странице записи)">
            <input
              className={INPUT_CLS}
              value={form.salon_address}
              onChange={(e) => setForm({ ...form, salon_address: e.target.value })}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <Field label="Начало дня">
            <input
              className={`${INPUT_CLS} font-mono-num`}
              type="time"
              value={form.work_start}
              onChange={(e) => setForm({ ...form, work_start: e.target.value })}
            />
          </Field>
          <Field label="Конец дня">
            <input
              className={`${INPUT_CLS} font-mono-num`}
              type="time"
              value={form.work_end}
              onChange={(e) => setForm({ ...form, work_end: e.target.value })}
            />
          </Field>
          <Field label="Шаг сетки">
            <select
              className={INPUT_CLS}
              value={form.slot_step}
              onChange={(e) => setForm({ ...form, slot_step: e.target.value })}
            >
              {[10, 15, 20, 30, 60].map((s) => (
                <option key={s} value={s}>
                  {s} мин
                </option>
              ))}
            </select>
          </Field>
          <Field label="Часовой пояс">
            <select
              className={INPUT_CLS}
              value={form.tz}
              onChange={(e) => setForm({ ...form, tz: e.target.value })}
            >
              {TIMEZONES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Рабочие дни">
          <div className="flex flex-wrap gap-2 pt-1">
            {WEEKDAYS.map((d, i) => {
              const active = workDays.includes(String(i));
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(i)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    active
                      ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white border-transparent shadow-xs'
                      : 'bg-white text-rose-950/60 border-rose-200 hover:bg-rose-50'
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Горизонт онлайн-записи, дней">
            <input
              className={`${INPUT_CLS} font-mono-num`}
              type="number"
              min="1"
              max="90"
              value={form.booking_horizon_days}
              onChange={(e) => setForm({ ...form, booking_horizon_days: e.target.value })}
            />
          </Field>
          <Field label="Мин. запас времени до записи, мин">
            <input
              className={`${INPUT_CLS} font-mono-num`}
              type="number"
              min="0"
              max="1440"
              value={form.min_lead_minutes}
              onChange={(e) => setForm({ ...form, min_lead_minutes: e.target.value })}
            />
          </Field>
        </div>

        <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={save}>
          <Save className="w-4 h-4" />
          Сохранить настройки
        </button>
      </div>

      {/* Password */}
      <div className="rounded-3xl bg-white border border-rose-100 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-rose-600" />
          <h2 className="text-base font-bold text-[#241322]">Безопасность</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Текущий пароль">
            <input
              className={INPUT_CLS}
              type="password"
              value={pw.old}
              onChange={(e) => setPw({ ...pw, old: e.target.value })}
              autoComplete="current-password"
            />
          </Field>
          <Field label="Новый пароль">
            <input
              className={INPUT_CLS}
              type="password"
              value={pw.next}
              onChange={(e) => setPw({ ...pw, next: e.target.value })}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Повторите новый">
            <input
              className={INPUT_CLS}
              type="password"
              value={pw.repeat}
              onChange={(e) => setPw({ ...pw, repeat: e.target.value })}
              autoComplete="new-password"
            />
          </Field>
        </div>
        <button
          type="button"
          className={BTN_SECONDARY}
          disabled={!pw.old || pw.next.length < 6}
          onClick={changePassword}
        >
          Сменить пароль
        </button>
      </div>
    </div>
  );
}
