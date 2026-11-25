import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarPlus, ChevronLeft, ChevronRight, Globe, Lock, Plus, CheckCircle2, Clock, ArrowLeft } from 'lucide-react';
import { api } from '../lib/api';
import { useSettings } from '../context/SettingsContext';
import {
  BTN_DANGER,
  BTN_GHOST,
  BTN_PRIMARY,
  BTN_SECONDARY,
  Field,
  INPUT_CLS,
  Modal,
  SkeletonList,
  useToast,
} from '../components/UI';
import {
  addDays,
  AppointmentItem,
  ClientItem,
  dtToDate,
  dtToMin,
  durationLabel,
  fmtDate,
  fmtPhone,
  getSalonNow,
  hexToRgba,
  hhmmToMin,
  makeDT,
  minToHHMM,
  money,
  parseDate,
  ServiceItem,
  STATUS_META,
  WEEKDAYS,
  WEEKDAYS_FULL,
  weekdayIdx,
  ruDate,
} from '../lib/utils';

const ROW_H_WEEK = 48;
const ROW_H_DAY = 52;

interface TimeBlockItem {
  id: number;
  start_at: string;
  end_at: string;
  comment: string;
}

const getMondayStr = (dateStr: string): string => {
  const d = parseDate(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d);
  mon.setDate(diff);
  return fmtDate(mon);
};

// Блок карточек статистики. Родительский контейнер задаёт сетку (grid-cols-*),
// поэтому здесь возвращаем только сами карточки как фрагмент.
function MetricsCards({
  viewMode,
  activeCount,
  plannedSum,
  doneSum,
  loadPct,
}: {
  viewMode: 'week' | 'day';
  activeCount: number;
  plannedSum: number;
  doneSum: number;
  loadPct: number;
}) {
  return (
    <>
      <div className="rounded-2xl bg-white border border-rose-100 p-4">
        <div className="text-xs font-medium text-rose-900/60">{viewMode === 'week' ? 'Записей за неделю' : 'Записей за день'}</div>
        <div className="text-2xl font-bold font-mono-num text-[#241322] mt-1">{activeCount}</div>
      </div>
      <div className="rounded-2xl bg-gradient-to-br from-rose-50 to-pink-50 border border-rose-200/70 p-4">
        <div className="text-xs font-medium text-rose-800/75">План выручки</div>
        <div className="text-2xl font-bold font-mono-num text-rose-700 mt-1">{money(plannedSum)}</div>
      </div>
      <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200/70 p-4">
        <div className="text-xs font-medium text-emerald-800/75">Выполнено</div>
        <div className="text-2xl font-bold font-mono-num text-emerald-700 mt-1">{money(doneSum)}</div>
      </div>
      <div className="rounded-2xl bg-gradient-to-br from-fuchsia-50 to-purple-50 border border-fuchsia-200/70 p-4">
        <div className="text-xs font-medium text-fuchsia-800/75">{viewMode === 'week' ? 'Загрузка недели' : 'Загрузка дня'}</div>
        <div className="text-2xl font-bold font-mono-num text-fuchsia-800 mt-1">{loadPct}%</div>
      </div>
    </>
  );
}

function SlotActionModal({
  slot,
  dateStr,
  onClose,
  onBookClient,
  onBlocked,
}: {
  slot: { start: string; end: string };
  dateStr: string;
  onClose: () => void;
  onBookClient: (startMin: number) => void;
  onBlocked: () => void;
}) {
  const [mode, setMode] = useState<'choose' | 'block'>('choose');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const startMin = dtToMin(slot.start);
  const endMin = dtToMin(slot.end);

  const submitBlock = async () => {
    setBusy(true);
    try {
      await api('/time-blocks', {
        method: 'POST',
        body: {
          start_at: makeDT(dateStr, startMin),
          end_at: makeDT(dateStr, endMin),
          comment: comment.trim(),
        },
      });
      toast('Время заблокировано');
      onBlocked();
      onClose();
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Ошибка', 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Слот ${minToHHMM(startMin)}–${minToHHMM(endMin)}`} onClose={onClose}>
      {mode === 'choose' ? (
        <div className="space-y-3">
          <p className="text-sm text-rose-950/65">Выберите действие для этого времени:</p>
          <button type="button" className={`${BTN_PRIMARY} w-full`} onClick={() => onBookClient(startMin)}>
            <CalendarPlus className="w-4 h-4" />
            Записать клиента
          </button>
          <button type="button" className={`${BTN_SECONDARY} w-full`} onClick={() => setMode('block')}>
            <Lock className="w-4 h-4" />
            Заблокировать время
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="Причина блокировки">
            <input
              className={INPUT_CLS}
              autoFocus
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Обед, обучение, личное время…"
            />
          </Field>
          <div className="flex items-center justify-between gap-3 pt-2">
            <button type="button" className={BTN_GHOST} onClick={() => setMode('choose')}>
              Назад
            </button>
            <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={submitBlock}>
              {busy ? 'Сохранение…' : 'Заблокировать'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ClientPicker({
  value,
  onChange,
}: {
  value: ClientItem | null;
  onChange: (c: ClientItem | null) => void;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<ClientItem[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      api<ClientItem[]>('/clients', { params: { q } })
        .then(setResults)
        .catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [q, open]);

  const createClient = async () => {
    try {
      const c = await api<ClientItem>('/clients', { method: 'POST', body: { name, phone } });
      onChange(c);
      setCreating(false);
      toast('Клиент создан');
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Ошибка создания', 'err');
    }
  };

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200">
        <div>
          <div className="text-sm font-bold text-[#241322]">{value.name}</div>
          <div className="text-xs text-rose-900/65 font-mono-num">{fmtPhone(value.phone)}</div>
        </div>
        <button
          type="button"
          className={`${BTN_SECONDARY} !py-1.5 !px-3 text-xs`}
          onClick={() => {
            onChange(null);
            setQ('');
            setOpen(true);
          }}
        >
          Изменить
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 relative">
      <input
        className={INPUT_CLS}
        placeholder="Поиск клиента по имени или телефону…"
        value={q}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
      />

      {open && !creating && (
        <div className="absolute z-20 left-0 right-0 top-12 bg-white rounded-xl border border-rose-200 shadow-xl max-h-56 overflow-y-auto divide-y divide-rose-50">
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              className="w-full text-left px-3.5 py-2.5 hover:bg-rose-50 transition-colors flex items-center justify-between gap-2 cursor-pointer"
              onMouseDown={() => {
                onChange(c);
                setOpen(false);
              }}
            >
              <span className="text-sm font-semibold text-[#241322]">{c.name}</span>
              <span className="text-xs text-rose-900/60 font-mono-num">{fmtPhone(c.phone)}</span>
            </button>
          ))}
          <button
            type="button"
            className="w-full text-left px-3.5 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
            onMouseDown={() => {
              setCreating(true);
              setOpen(false);
              setName(q);
            }}
          >
            + Новый клиент{q ? `: «${q}»` : ''}
          </button>
        </div>
      )}

      {creating && (
        <div className="p-3.5 rounded-xl bg-rose-50/70 border border-rose-200 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <input
              className={INPUT_CLS}
              placeholder="Имя клиента"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className={INPUT_CLS}
              placeholder="Телефон (+7…)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button type="button" className={BTN_GHOST} onClick={() => setCreating(false)}>
              Отмена
            </button>
            <button
              type="button"
              className={BTN_PRIMARY}
              disabled={!name.trim() || !phone.trim()}
              onClick={createClient}
            >
              Создать
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function BookingModal({
  dateStr,
  startMin,
  appt,
  presetClientId,
  onClose,
  onSaved,
}: {
  dateStr: string;
  startMin: number | null;
  appt?: AppointmentItem;
  presetClientId?: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { settings } = useSettings();
  const toast = useToast();
  const editing = Boolean(appt);

  const [services, setServices] = useState<ServiceItem[]>([]);
  const [clientObj, setClientObj] = useState<ClientItem | null>(appt ? appt.client : null);
  const [serviceId, setServiceId] = useState<number | null>(appt ? appt.service_id : null);
  const [dateLocal, setDateLocal] = useState<string>(appt ? dtToDate(appt.start_at) : dateStr);
  const [timeMin, setTimeMin] = useState<number | null>(
    appt ? dtToMin(appt.start_at) : startMin,
  );
  const [price, setPrice] = useState<string>(appt ? String(appt.price ?? '') : '');
  const [status, setStatus] = useState<AppointmentItem['status']>(appt ? appt.status : 'confirmed');
  const [comment, setComment] = useState<string>(appt ? appt.comment || '' : '');
  const [slots, setSlots] = useState<Array<{ start: string; end: string; available: boolean }> | null>(null);
  const [busy, setBusy] = useState(false);

  const salonClock = useMemo(() => getSalonNow(settings.tz), [settings.tz]);

  const isPastSlot = useCallback(
    (dStr: string, min: number) => {
      if (dStr < salonClock.dateStr) return true;
      if (dStr === salonClock.dateStr) return min < salonClock.minOfDay;
      return false;
    },
    [salonClock.dateStr, salonClock.minOfDay],
  );

  useEffect(() => {
    api<ServiceItem[]>('/services').then((list) => {
      setServices(list);
      if (!appt && list.length) {
        const firstActive = list.find((s) => s.is_active) || list[0];
        setServiceId(firstActive.id);
        setPrice(String(firstActive.price));
      }
    });
    if (presetClientId && !appt) {
      api<{ client: ClientItem }>(`/clients/${presetClientId}`)
        .then((d) => setClientObj(d.client))
        .catch(() => {});
    }
  }, [appt, presetClientId]);

  useEffect(() => {
    if (!serviceId || !dateLocal) return;
    setSlots(null);
    api<Array<{ start: string; end: string; available: boolean }>>('/slots', {
      params: { date: dateLocal, service_id: serviceId },
    })
      .then((res) => {
        setSlots(res);
        const freeMins = res
          .filter((s) => s.available && !isPastSlot(dateLocal, dtToMin(s.start)))
          .map((s) => dtToMin(s.start));
        if (editing && appt && dateLocal === dtToDate(appt.start_at)) {
          const origMin = dtToMin(appt.start_at);
          if (!freeMins.includes(origMin)) freeMins.push(origMin);
        }
        if (timeMin === null || (!editing && !freeMins.includes(timeMin))) {
          setTimeMin(freeMins[0] ?? null);
        }
      })
      .catch(() => setSlots([]));
  }, [serviceId, dateLocal, editing, appt, isPastSlot]);

  const freeOptions = useMemo(() => {
    if (!slots) return [];
    const set = new Set<number>(
      slots
        .filter((s) => s.available && !isPastSlot(dateLocal, dtToMin(s.start)))
        .map((s) => dtToMin(s.start)),
    );
    if (editing && appt && dateLocal === dtToDate(appt.start_at)) {
      set.add(dtToMin(appt.start_at));
    }
    return [...set].sort((a, b) => a - b);
  }, [slots, dateLocal, editing, appt, isPastSlot]);

  const service = services.find((s) => s.id === serviceId) || null;

  const changeService = (val: string) => {
    const id = Number(val);
    setServiceId(id);
    const svc = services.find((s) => s.id === id);
    if (svc && !editing) setPrice(String(svc.price));
  };

  const save = async () => {
    if (!clientObj || !serviceId || timeMin === null) return;
    setBusy(true);
    try {
      const startAt = makeDT(dateLocal, timeMin);
      if (editing && appt) {
        await api(`/appointments/${appt.id}`, {
          method: 'PATCH',
          body: {
            client_id: clientObj.id,
            service_id: serviceId,
            start_at: startAt,
            price: price !== '' ? Number(price) : null,
            status,
            comment,
          },
        });
        toast('Запись обновлена');
      } else {
        await api('/appointments', {
          method: 'POST',
          body: {
            client_id: clientObj.id,
            service_id: serviceId,
            start_at: startAt,
            price: price !== '' ? Number(price) : null,
            comment,
          },
        });
        toast('Запись создана');
      }
      onSaved();
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Ошибка сохранения', 'err');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!appt) return;
    if (!window.confirm('Удалить эту запись безвозвратно?')) return;
    try {
      await api(`/appointments/${appt.id}`, { method: 'DELETE' });
      toast('Запись удалена');
      onSaved();
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Ошибка удаления', 'err');
    }
  };

  return (
    <Modal title={editing ? 'Редактировать запись' : 'Новая запись'} onClose={onClose} wide>
      <div className="space-y-4">
        <Field label="Клиент">
          <ClientPicker value={clientObj} onChange={setClientObj} />
        </Field>

        <Field label="Услуга">
          <select className={INPUT_CLS} value={serviceId ?? ''} onChange={(e) => changeService(e.target.value)}>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {durationLabel(s.duration_min)} · {money(s.price)}
                {!s.is_active ? ' (скрыта)' : ''}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Дата">
            <input
              className={INPUT_CLS}
              type="date"
              value={dateLocal}
              onChange={(e) => e.target.value && setDateLocal(e.target.value)}
            />
          </Field>
          <Field label="Начало">
            <select
              className={INPUT_CLS}
              value={timeMin ?? ''}
              onChange={(e) => setTimeMin(Number(e.target.value))}
            >
              {slots === null && <option value="">Загрузка…</option>}
              {slots !== null && freeOptions.length === 0 && (
                <option value="">Нет свободного времени</option>
              )}
              {freeOptions.map((m) => (
                <option key={m} value={m}>
                  {minToHHMM(m)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {service && timeMin !== null && (
          <div className="text-xs text-rose-900/65 bg-rose-50/70 rounded-xl px-3.5 py-2 font-mono-num">
            Окончание: <b>{minToHHMM(timeMin + service.duration_min)}</b> · длительность{' '}
            {durationLabel(service.duration_min)}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Стоимость, ₽">
            <input
              className={`${INPUT_CLS} font-mono-num`}
              type="number"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </Field>
          {editing && (
            <Field label="Статус">
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(STATUS_META).map(([k, meta]) => {
                  const active = status === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setStatus(k as AppointmentItem['status'])}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer whitespace-nowrap ${
                        active
                          ? `${meta.bg} ${meta.text} ${meta.border} ring-2 ring-rose-500/20`
                          : 'bg-white text-rose-950/60 border-rose-200 hover:bg-rose-50'
                      }`}
                    >
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            </Field>
          )}
        </div>

        <Field label="Комментарий">
          <textarea
            className={INPUT_CLS}
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Дизайн, пожелания, снятие…"
          />
        </Field>

        <div className="flex items-center justify-between gap-3 pt-2 border-t border-rose-100">
          {editing ? (
            <button type="button" className={BTN_DANGER} onClick={remove}>
              Удалить
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button type="button" className={BTN_GHOST} onClick={onClose}>
              Отмена
            </button>
            <button
              type="button"
              className={BTN_PRIMARY}
              disabled={
                busy ||
                !clientObj ||
                !serviceId ||
                timeMin === null ||
                (!editing && isPastSlot(dateLocal, timeMin))
              }
              onClick={save}
            >
              {editing ? 'Сохранить' : 'Записать'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default function CalendarPage() {
  const { settings } = useSettings();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const dateParam = params.get('date');

  const salonClock = getSalonNow(settings.tz);

  // Режимы: 'week' или 'day'
  const [viewMode, setViewMode] = useState<'week' | 'day'>('week');
  const [weekStartStr, setWeekStartStr] = useState<string>(() => {
    const base = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : salonClock.dateStr;
    return getMondayStr(base);
  });
  const [dayStr, setDayStr] = useState<string>(() =>
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : salonClock.dateStr,
  );

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStartStr, i)), [weekStartStr]);
  const weekEndStr = addDays(weekStartStr, 6);

  const [appts, setAppts] = useState<AppointmentItem[] | null>(null);
  const [blocks, setBlocks] = useState<TimeBlockItem[]>([]);
  const [showCancelled, setShowCancelled] = useState(false);
  const [modal, setModal] = useState<{ startMin: number | null; appt?: AppointmentItem; presetClientId?: number } | null>(null);
  const [slotModal, setSlotModal] = useState<{ start: string; end: string } | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const liveClock = useMemo(() => {
    void tick;
    return getSalonNow(settings.tz);
  }, [settings.tz, tick]);

  // Загрузка данных: для недели — вся неделя, для дня — один день
  const loadFrom = viewMode === 'week' ? weekStartStr : dayStr;
  const loadTo = viewMode === 'week' ? weekEndStr : dayStr;

  const load = useCallback(() => {
    Promise.all([
      api<AppointmentItem[]>('/appointments', { params: { from: loadFrom, to: loadTo } }),
      api<TimeBlockItem[]>('/time-blocks', { params: { from: loadFrom, to: loadTo } }),
    ])
      .then(([a, b]) => {
        setAppts(a);
        setBlocks(b);
      })
      .catch((e: unknown) => toast(e instanceof Error ? e.message : 'Ошибка загрузки', 'err'));
  }, [loadFrom, loadTo, toast]);

  useEffect(() => {
    setAppts(null);
    load();
  }, [load]);

  useEffect(() => {
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      setWeekStartStr(getMondayStr(dateParam));
      setDayStr(dateParam);
    }
  }, [dateParam]);

  useEffect(() => {
    const cid = params.get('client');
    if (cid) {
      setModal({ presetClientId: Number(cid), startMin: null });
      const next = new URLSearchParams(params);
      next.delete('client');
      setParams(next, { replace: true });
    }
  }, [params, setParams]);

  const removeBlock = async (b: TimeBlockItem) => {
    if (!window.confirm(`Снять блокировку «${b.comment || 'без комментария'}»?`)) return;
    try {
      await api(`/time-blocks/${b.id}`, { method: 'DELETE' });
      toast('Блокировка снята');
      load();
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Ошибка', 'err');
    }
  };

  const active = (appts || []).filter((a) => a.status === 'confirmed' || a.status === 'completed');
  const done = (appts || []).filter((a) => a.status === 'completed');
  const plannedSum = active.reduce((s, a) => s + (a.price || 0), 0);
  const doneSum = done.reduce((s, a) => s + (a.price || 0), 0);

  const startMin = hhmmToMin(settings.work_start);
  const endMin = hhmmToMin(settings.work_end);
  const step = Math.max(10, Number(settings.slot_step) || 30);

  // Для недели — загрузка считается на всю неделю, для дня — на день
  const totalWorkMin = viewMode === 'week'
    ? Math.max(1, (endMin - startMin) * 7)
    : Math.max(1, endMin - startMin);
  const loadPct = Math.min(
    100,
    Math.round(
      (active.reduce((s, a) => s + (dtToMin(a.end_at) - dtToMin(a.start_at)), 0) / totalWorkMin) * 100,
    ),
  );

  const visibleAppts = (appts || []).filter((a) => showCancelled || a.status !== 'cancelled');

  const prevWeek = () => setWeekStartStr(addDays(weekStartStr, -7));
  const nextWeek = () => setWeekStartStr(addDays(weekStartStr, 7));
  const goToday = () => {
    setWeekStartStr(getMondayStr(liveClock.dateStr));
    setDayStr(liveClock.dateStr);
  };

  const openDay = (d: string) => {
    setDayStr(d);
    setViewMode('day');
  };

  const openWeek = () => {
    setViewMode('week');
  };

  const rows = Math.max(1, Math.ceil((endMin - startMin) / step));
  const ROW_H = viewMode === 'week' ? ROW_H_WEEK : ROW_H_DAY;

  return (
    <div className="flex flex-col space-y-2 w-full">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {viewMode === 'day' && (
            <button
              type="button"
              onClick={openWeek}
              className="w-10 h-10 rounded-xl bg-white border border-rose-200 flex items-center justify-center text-rose-900 hover:bg-rose-50 transition-colors cursor-pointer"
              title="Вернуться к неделе"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div>
            {viewMode === 'week' ? (
              <>
                <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#241322] leading-tight">
                  {weekDays[0].slice(8, 10)} {['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'][Number(weekDays[0].slice(5,7))-1]} — {weekDays[6].slice(8, 10)} {['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'][Number(weekDays[6].slice(5,7))-1]} {weekDays[6].slice(0, 4)}
                </h1>
                <div className="text-xs font-medium text-rose-900/60 mt-0.5 flex items-center gap-2">
                  <span>Неделя</span>
                  {weekStartStr === getMondayStr(liveClock.dateStr) && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-rose-600 font-semibold">Текущая ({liveClock.timeStr})</span>
                    </>
                  )}
                </div>
              </>
            ) : (
              <>
                <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#241322] leading-tight">
                  {ruDate(dayStr, { withYear: true })}
                </h1>
                <div className="text-xs font-medium text-rose-900/60 mt-0.5 flex items-center gap-2">
                  <span>{WEEKDAYS_FULL[weekdayIdx(dayStr)]}</span>
                  {dayStr === liveClock.dateStr && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-rose-600 font-semibold">Сегодня ({liveClock.timeStr})</span>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {viewMode === 'week' ? (
            <>
              <button
                type="button"
                className="w-10 h-10 rounded-xl bg-white border border-rose-200 flex items-center justify-center text-rose-900 hover:bg-rose-50 transition-colors cursor-pointer"
                onClick={prevWeek}
                aria-label="Предыдущая неделя"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                className="w-10 h-10 rounded-xl bg-white border border-rose-200 flex items-center justify-center text-rose-900 hover:bg-rose-50 transition-colors cursor-pointer"
                onClick={nextWeek}
                aria-label="Следующая неделя"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="w-10 h-10 rounded-xl bg-white border border-rose-200 flex items-center justify-center text-rose-900 hover:bg-rose-50 transition-colors cursor-pointer"
                onClick={() => setDayStr(addDays(dayStr, -1))}
                aria-label="Предыдущий день"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <input
                className={`${INPUT_CLS} !w-auto font-mono-num`}
                type="date"
                value={dayStr}
                onChange={(e) => e.target.value && setDayStr(e.target.value)}
              />
              <button
                type="button"
                className="w-10 h-10 rounded-xl bg-white border border-rose-200 flex items-center justify-center text-rose-900 hover:bg-rose-50 transition-colors cursor-pointer"
                onClick={() => setDayStr(addDays(dayStr, 1))}
                aria-label="Следующий день"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}

          <button
            type="button"
            className={BTN_SECONDARY}
            onClick={goToday}
          >
            Сегодня
          </button>

          <button
            type="button"
            className={BTN_PRIMARY}
            onClick={() => setModal({ startMin: null })}
          >
            <Plus className="w-4 h-4" />
            Запись
          </button>
        </div>
      </div>

      {/* Summary Metrics — десктоп: остаётся сверху (md+). На мобильных скрыт. */}
      <div className="hidden md:grid md:grid-cols-4 gap-3">
        <MetricsCards
          viewMode={viewMode}
          activeCount={active.length}
          plannedSum={plannedSum}
          doneSum={doneSum}
          loadPct={loadPct}
        />
      </div>

      {/* Calendar Grid */}
      {appts === null ? (
        <SkeletonList count={3} />
      ) : viewMode === 'week' ? (
        // ===== НЕДЕЛЬНЫЙ ВИД =====
        <div className="rounded-3xl bg-white border border-rose-100 shadow-sm overflow-hidden flex flex-col ">
          <div className="grid grid-cols-[32px_repeat(7,1fr)] md:grid-cols-[60px_repeat(7,1fr)] border-b border-rose-100 w-full">
            <div className="border-r border-rose-100 bg-rose-50/30"></div>
            {weekDays.map((d, i) => {
              const isToday = d === liveClock.dateStr;
              const dayIdx = weekdayIdx(d);
              const dayCount = visibleAppts.filter(a => dtToDate(a.start_at) === d).length;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => openDay(d)}
                  className={`p-2 sm:p-3 text-center border-r border-rose-50 last:border-r-0 transition-colors hover:bg-rose-100/60 cursor-pointer ${isToday ? 'bg-rose-50' : 'bg-rose-50/30'}`}
                  title={`Открыть день ${ruDate(d, { withYear: true })}`}
                >
                  <div className="text-[10px] sm:text-xs text-rose-900/60 font-medium uppercase tracking-wide">{WEEKDAYS[dayIdx]}</div>
                  <div className={`text-lg sm:text-xl font-bold font-mono-num mt-0.5 ${isToday ? 'text-rose-600' : 'text-[#241322]'}`}>
                    {d.slice(8, 10)}
                  </div>
                  {dayCount > 0 && (
                    <div className="text-[10px] font-semibold text-rose-700 mt-0.5">{dayCount} зап.</div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="overflow-y-auto overflow-x-hidden relative w-full" style={{ maxHeight: "calc(100vh - 340px)" }}>
            <div className="grid grid-cols-[32px_repeat(7,1fr)] md:grid-cols-[60px_repeat(7,1fr)] relative w-full">
              {/* Time Column */}
              <div className="border-r border-rose-100 relative bg-white sticky left-0 z-30">
                {Array.from({ length: rows }).map((_, i) => {
                  const m = startMin + i * step;
                  const isHour = m % 60 === 0;
                  return (
                    <div key={i} style={{ height: ROW_H }} className={`border-b ${isHour ? 'border-rose-100' : 'border-rose-50 border-dashed'} flex items-start`}>
                      <span className={`w-full text-right pr-2 pt-1.5 text-[10px] sm:text-xs font-mono-num ${isHour ? 'font-bold text-rose-950/75' : 'text-rose-900/40'}`}>
                        {isHour ? minToHHMM(m) : ''}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Day Columns */}
              {weekDays.map((dayStr, dayIdx) => {
                const isToday = dayStr === liveClock.dateStr;
                const isPastDay = dayStr < liveClock.dateStr;
                const dayAppts = visibleAppts.filter(a => dtToDate(a.start_at) === dayStr);
                const dayBlocks = blocks.filter(b => dtToDate(b.start_at) === dayStr);

                return (
                  <div key={dayIdx} className="relative border-r border-rose-50 last:border-r-0">
                    {Array.from({ length: rows }).map((_, i) => {
                      const m = startMin + i * step;
                      const isPast = isPastDay || (isToday && m < liveClock.minOfDay);
                      return (
                        <div
                          key={i}
                          style={{ height: ROW_H }}
                          onClick={() => !isPast && setSlotModal({ start: makeDT(dayStr, m), end: makeDT(dayStr, m + step) })}
                          className={`border-b border-rose-50 border-dashed ${isPast ? 'bg-slate-50/50 cursor-not-allowed' : 'hover:bg-rose-50/55 cursor-pointer'}`}
                        />
                      );
                    })}

                    {dayBlocks.map(b => {
                      const s = dtToMin(b.start_at);
                      const e = dtToMin(b.end_at);
                      const top = Math.max(0, ((s - startMin) / step) * ROW_H);
                      const h = Math.max(28, ((e - s) / step) * ROW_H - 4);
                      return (
                        <div
                          key={`b-${b.id}`}
                          onClick={(ev) => { ev.stopPropagation(); removeBlock(b); }}
                          style={{ top: top + 2, height: h }}
                          className="absolute left-1 right-1 rounded-lg bg-slate-100/95 border border-slate-300/80 px-1.5 py-1 flex items-center gap-1 cursor-pointer hover:bg-slate-200/80 transition-colors z-10 overflow-hidden truncate"
                          title={b.comment || 'Заблокировано'}
                        >
                          <Lock className="w-3 h-3 shrink-0 text-slate-500" />
                          <span className="text-[9px] sm:text-[10px] font-bold font-mono-num text-slate-700 truncate">
                            {minToHHMM(s)}-{minToHHMM(e)}
                          </span>
                        </div>
                      );
                    })}

                    {dayAppts.map(a => {
                      const s = dtToMin(a.start_at);
                      const e = dtToMin(a.end_at);
                      const top = Math.max(0, ((s - startMin) / step) * ROW_H);
                      const h = Math.max(32, ((e - s) / step) * ROW_H - 4);
                      const compact = h <= 50;
                      const svcColor = a.service?.color || '#e11d48';
                      const isCompleted = a.status === 'completed';
                      const isCancelled = a.status === 'cancelled' || a.status === 'no_show';

                      return (
                        <div
                          key={a.id}
                          onClick={(ev) => { ev.stopPropagation(); setModal({ appt: a, startMin: null }); }}
                          style={{
                            top: top + 2,
                            height: h,
                            backgroundColor: isCancelled ? '#f8fafc' : isCompleted ? 'rgba(16, 185, 129, 0.12)' : hexToRgba(svcColor, 0.13),
                            borderColor: isCancelled ? '#cbd5e1' : isCompleted ? '#10b981' : svcColor,
                          }}
                          className={`absolute left-1 right-1 rounded-lg border px-1.5 py-1 flex ${compact ? 'flex-row items-center' : 'flex-col justify-between'} gap-1 cursor-pointer hover:shadow-md transition-all z-10 overflow-hidden truncate ${isCancelled ? 'opacity-65' : ''}`}
                        >
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full shrink-0" style={{ backgroundColor: isCompleted ? '#059669' : svcColor }} />
                            <span className="text-[9px] sm:text-[10px] font-bold font-mono-num text-[#241322] shrink-0">{minToHHMM(s)}</span>
                            <span className="text-[10px] sm:text-xs font-bold text-[#241322] truncate">{a.client.name}</span>
                          </div>
                          {!compact && (
                            <div className="flex items-center justify-between gap-1 text-[9px] sm:text-[10px]">
                              <span className="text-rose-950/70 truncate">{a.service.name}</span>
                              <span className="font-bold font-mono-num text-[#241322] shrink-0">{money(a.price)}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {isToday && liveClock.minOfDay >= startMin && liveClock.minOfDay <= endMin && (
                      <div
                        style={{ top: ((liveClock.minOfDay - startMin) / step) * ROW_H }}
                        className="absolute left-0 right-0 h-0.5 bg-rose-600 z-20 pointer-events-none"
                      >
                        <span className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-rose-600" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        // ===== ДНЕВНОЙ ВИД =====
        <div className="rounded-3xl bg-white border border-rose-100 shadow-sm overflow-hidden ">
          <div className="relative select-none w-full" style={{ height: rows * ROW_H }}>
            {Array.from({ length: rows }).map((_, i) => {
              const m = startMin + i * step;
              const isPast = dayStr < liveClock.dateStr || (dayStr === liveClock.dateStr && m < liveClock.minOfDay);
              const isHour = m % 60 === 0;
              return (
                <div
                  key={i}
                  onClick={() =>
                    !isPast &&
                    setSlotModal({
                      start: makeDT(dayStr, m),
                      end: makeDT(dayStr, m + step),
                    })
                  }
                  style={{ top: i * ROW_H, height: ROW_H }}
                  title={isPast ? 'Это время уже прошло' : `Нажмите, чтобы записать или заблокировать ${minToHHMM(m)}`}
                  className={`absolute left-0 right-0 flex items-start border-b transition-colors ${
                    isHour ? 'border-rose-100' : 'border-rose-50 border-dashed'
                  } ${
                    isPast
                      ? 'bg-slate-50/75 cursor-not-allowed'
                      : 'hover:bg-rose-50/55 cursor-pointer'
                  }`}
                >
                  <span
                    className={`w-16 sm:w-20 shrink-0 px-3 pt-1.5 text-xs font-mono-num ${
                      isHour ? 'font-bold text-rose-950/75' : 'text-rose-900/40'
                    }`}
                  >
                    {minToHHMM(m)}
                  </span>
                </div>
              );
            })}

            {blocks.map((b) => {
              const s = dtToMin(b.start_at);
              const e = dtToMin(b.end_at);
              const top = Math.max(0, ((s - startMin) / step) * ROW_H);
              const h = Math.max(30, ((e - s) / step) * ROW_H - 4);
              return (
                <div
                  key={`b-${b.id}`}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    removeBlock(b);
                  }}
                  style={{ top: top + 2, height: h }}
                  className="absolute left-16 sm:left-20 right-3 rounded-xl bg-slate-100/95 border border-slate-300/80 px-3.5 py-1.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-200/80 transition-colors z-10"
                  title="Нажмите, чтобы снять блокировку"
                >
                  <div className="flex items-center gap-2 min-w-0 text-xs font-semibold text-slate-700">
                    <Lock className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                    <span className="font-mono-num shrink-0">
                      {minToHHMM(s)}–{minToHHMM(e)}
                    </span>
                    <span className="truncate">{b.comment || 'Заблокировано'}</span>
                  </div>
                </div>
              );
            })}

            {visibleAppts.map((a) => {
              const s = dtToMin(a.start_at);
              const e = dtToMin(a.end_at);
              const top = Math.max(0, ((s - startMin) / step) * ROW_H);
              const h = Math.max(34, ((e - s) / step) * ROW_H - 4);
              const compact = h <= 54;
              const svcColor = a.service?.color || '#e11d48';
              const isCompleted = a.status === 'completed';
              const isCancelled = a.status === 'cancelled' || a.status === 'no_show';

              return (
                <div
                  key={a.id}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setModal({ appt: a, startMin: null });
                  }}
                  style={{
                    top: top + 2,
                    height: h,
                    backgroundColor: isCancelled
                      ? '#f8fafc'
                      : isCompleted
                        ? 'rgba(16, 185, 129, 0.12)'
                        : hexToRgba(svcColor, 0.13),
                    borderColor: isCancelled
                      ? '#cbd5e1'
                      : isCompleted
                        ? '#10b981'
                        : svcColor,
                  }}
                  className={`absolute left-16 sm:left-20 right-3 rounded-xl border px-3.5 py-2 flex ${
                    compact ? 'flex-row items-center' : 'flex-col justify-between'
                  } gap-2 cursor-pointer hover:shadow-md transition-all z-10 overflow-hidden ${
                    isCancelled ? 'opacity-65' : ''
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: isCompleted ? '#059669' : svcColor }}
                    />
                    <span className="text-xs font-bold font-mono-num text-[#241322] shrink-0">
                      {minToHHMM(s)}–{minToHHMM(e)}
                    </span>
                    <span className="text-sm font-bold text-[#241322] truncate">
                      {a.client.name}
                    </span>
                    {!compact && (
                      <span className="text-xs text-rose-950/70 truncate">
                        · {a.service.name}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0 text-xs">
                    {compact && (
                      <span className="hidden md:inline text-rose-950/70 truncate max-w-[180px]">
                        {a.service.name}
                      </span>
                    )}
                    {a.source === 'online' && (
                      <span title="Онлайн-запись" className="text-fuchsia-700 inline-flex items-center gap-1 font-medium">
                        <Globe className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Онлайн</span>
                      </span>
                    )}
                    {a.client_confirmed && (
                      <span title="Подтверждено клиентом" className="text-emerald-700 inline-flex items-center">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </span>
                    )}
                    <span className="font-bold font-mono-num text-[#241322]">
                      {money(a.price)}
                    </span>
                  </div>
                </div>
              );
            })}

            {dayStr === liveClock.dateStr && liveClock.minOfDay >= startMin && liveClock.minOfDay <= endMin && (
              <div
                style={{ top: ((liveClock.minOfDay - startMin) / step) * ROW_H }}
                className="absolute left-14 sm:left-16 right-0 h-0.5 bg-rose-600 z-20 pointer-events-none flex items-center"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-rose-600 -ml-1 shadow-sm" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Legend & Filter */}
      <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-rose-950/70 px-1">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-rose-600" />
            Цвет блока соответствует услуге
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Зелёный — выполнена
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-fuchsia-600" />
            Онлайн-запись
          </span>
        </div>

        <label className="inline-flex items-center gap-2 cursor-pointer font-medium">
          <input
            type="checkbox"
            checked={showCancelled}
            onChange={(e) => setShowCancelled(e.target.checked)}
            className="rounded border-rose-300 text-rose-600 focus:ring-rose-500"
          />
          Показывать отменённые
        </label>
      </div>

      {/* Summary Metrics — мобильные: отображается снизу под календарём */}
      <div className="grid grid-cols-2 md:hidden gap-3 mt-4">
        <MetricsCards
          viewMode={viewMode}
          activeCount={active.length}
          plannedSum={plannedSum}
          doneSum={doneSum}
          loadPct={loadPct}
        />
      </div>

      {modal && (
        <BookingModal
          dateStr={viewMode === 'day' ? dayStr : liveClock.dateStr}
          startMin={modal.startMin}
          appt={modal.appt}
          presetClientId={modal.presetClientId}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}

      {slotModal && !modal && (
        <SlotActionModal
          slot={slotModal}
          dateStr={dtToDate(slotModal.start)}
          onClose={() => setSlotModal(null)}
          onBookClient={(m) => {
            setSlotModal(null);
            setModal({ startMin: m });
          }}
          onBlocked={load}
        />
      )}
    </div>
  );
}
// trigger rebuild
