import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Check, Clock, MapPin, Phone, Sparkles, User, ArrowRight } from 'lucide-react';
import { api } from '../lib/api';
import { BTN_PRIMARY, BTN_SECONDARY, Field, INPUT_CLS, SkeletonList, Spinner, useToast } from '../components/UI';
import {
  addDays,
  addMinutesISO,
  durationLabel,
  getSalonNow,
  hexToRgba,
  money,
  ruDate,
  ruDateTime,
  ServiceItem,
  WEEKDAYS,
  weekdayIdx,
} from '../lib/utils';

interface PublicConfig {
  salon_name: string;
  salon_address: string;
  work_days: string;
  work_start: string;
  work_end: string;
  booking_horizon_days: number;
  min_lead_minutes: number;
  tz: string;
  salon_now: string;
  salon_today: string;
  demo?: boolean;
}

interface SlotOption {
  start: string;
  end: string;
  available: boolean;
}

interface BookConfirmation {
  ok: boolean;
  appointment: {
    start_at: string;
    end_at: string;
    service: string;
    price: number;
  };
  salon_name: string;
  salon_address: string;
}

export default function BookPage() {
  const toast = useToast();
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [serviceId, setServiceId] = useState<number | null>(null);
  const [dateStr, setDateStr] = useState<string | null>(null);
  const [slots, setSlots] = useState<SlotOption[] | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<BookConfirmation | null>(null);
  const [clockTick, setClockTick] = useState(0);

  useEffect(() => {
    api<PublicConfig>('/public/config')
      .then(setConfig)
      .catch((e) => toast(e.message, 'err'));
    api<ServiceItem[]>('/public/services')
      .then(setServices)
      .catch(() => {});
  }, [toast]);

  // Keep salon wall-clock fresh every 20s so slots that pass while the page is open are immediately hidden
  useEffect(() => {
    const timer = setInterval(() => setClockTick((t) => t + 1), 20000);
    return () => clearInterval(timer);
  }, []);

  const salonClock = useMemo(() => {
    void clockTick;
    return getSalonNow(config?.tz);
  }, [config?.tz, clockTick]);

  const dates = useMemo(() => {
    if (!config) return [];
    const workDays = (config.work_days || '').split(',').filter(Boolean);
    const out: string[] = [];
    const baseDate = salonClock.dateStr;
    const limit = Math.min(config.booking_horizon_days || 14, 30);
    for (let i = 0; i < limit; i++) {
      const d = addDays(baseDate, i);
      if (workDays.includes(String(weekdayIdx(d)))) out.push(d);
      if (out.length >= 14) break;
    }
    return out;
  }, [config, salonClock.dateStr]);

  useEffect(() => {
    if (!serviceId || !dateStr) return;
    setSlots(null);
    setSlot(null);
    api<SlotOption[]>('/public/slots', { params: { date: dateStr, service_id: serviceId } })
      .then(setSlots)
      .catch((e) => toast(e.message, 'err'));
  }, [serviceId, dateStr, toast]);

  // Client-side defense-in-depth guard: never display or keep selected a past slot
  const validSlots = useMemo(() => {
    if (!slots || !config) return slots;
    const minLead = Math.max(0, Number(config.min_lead_minutes ?? 0));
    const cutoffISO = addMinutesISO(salonClock.iso, minLead);
    return slots.filter((s) => s.start > salonClock.iso && s.start >= cutoffISO);
  }, [slots, config, salonClock.iso]);

  useEffect(() => {
    if (slot && validSlots && !validSlots.some((s) => s.start === slot)) {
      setSlot(null);
    }
  }, [slot, validSlots]);

  const pickService = (id: number) => {
    setServiceId(id);
    if (!dateStr && dates.length) setDateStr(dates[0]);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceId || !slot || !config) return;
    const minLead = Math.max(0, Number(config.min_lead_minutes ?? 0));
    const cutoffISO = addMinutesISO(salonClock.iso, minLead);
    if (slot <= salonClock.iso || slot < cutoffISO) {
      toast('Это время уже прошло — выберите более поздний слот', 'err');
      api<SlotOption[]>('/public/slots', { params: { date: dateStr, service_id: serviceId } })
        .then(setSlots)
        .catch(() => {});
      setSlot(null);
      return;
    }

    setBusy(true);
    try {
      const res = await api<BookConfirmation>('/public/book', {
        method: 'POST',
        body: { name, phone, service_id: serviceId, start_at: slot, comment },
      });
      setDone(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка записи';
      toast(msg, 'err');
      if (serviceId && dateStr) {
        api<SlotOption[]>('/public/slots', { params: { date: dateStr, service_id: serviceId } })
          .then(setSlots)
          .catch(() => {});
        setSlot(null);
      }
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setDone(null);
    setServiceId(null);
    setDateStr(null);
    setSlots(null);
    setSlot(null);
    setName('');
    setPhone('');
    setComment('');
  };

  if (!config) {
    return (
      <div className="min-h-screen studio-mesh flex items-center justify-center p-6">
        <SkeletonList count={3} />
      </div>
    );
  }

  const selectedService = services.find((s) => s.id === serviceId) || null;
  const nextDateOption = dates.find((d) => d !== dateStr) || null;

  return (
    <div className="min-h-screen studio-mesh text-[#241322]">
      {/* 3-Zone Top Bar */}
      <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-md border-b border-rose-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="font-display text-2xl font-bold tracking-tight text-[#241322] whitespace-nowrap shrink-0"
          >
            {config.salon_name}
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-rose-950/70">
            <a href="#services" className="hover:text-rose-700 transition-colors whitespace-nowrap shrink-0">
              Услуги
            </a>
            <a href="#schedule" className="hover:text-rose-700 transition-colors whitespace-nowrap shrink-0">
              Дата и время
            </a>
            <a href="#studio" className="hover:text-rose-700 transition-colors whitespace-nowrap shrink-0">
              О студии
            </a>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <Link to="/login" className={`${BTN_SECONDARY} !py-2 !px-3.5 text-xs`}>
              Кабинет мастера
            </Link>
          </div>
        </div>
      </header>

      <main id="top" className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-10">
        {/* Editorial Split Hero */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch rounded-3xl overflow-hidden bg-white border border-rose-100 shadow-[0_14px_40px_rgba(157,23,77,0.08)]">
          <div className="lg:col-span-6 p-7 sm:p-10 flex flex-col justify-between bg-gradient-to-br from-white via-rose-50/40 to-amber-50/30">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-rose-800/75">
                <span>Онлайн-запись 24/7</span>
                <span aria-hidden="true">·</span>
                <span>{config.work_start}–{config.work_end}</span>
                {config.salon_address && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{config.salon_address}</span>
                  </>
                )}
              </div>

              <h1
                className="font-display text-4xl sm:text-5xl font-bold leading-[1.06] text-[#241322]"
                style={{ textWrap: 'balance' }}
              >
                Безупречный маникюр и цвет вашего настроения
              </h1>

              <p className="text-sm sm:text-base text-rose-950/70 leading-relaxed max-w-lg">
                Выберите процедуру, удобный день и свободное окошко — запись сразу попадёт в расписание мастера.
              </p>
            </div>

            <div className="pt-6 flex flex-wrap items-center gap-4">
              <a href="#services" className={BTN_PRIMARY}>
                Записаться онлайн
                <ArrowRight className="w-4 h-4" />
              </a>
              <div className="flex items-center gap-2 text-xs font-medium text-rose-950/65 font-mono-num">
                <Clock className="w-3.5 h-3.5 text-rose-600" />
                <span>Сейчас в салоне: {salonClock.timeStr} ({config.tz})</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 relative min-h-[260px] lg:min-h-[380px] bg-gradient-to-br from-rose-100 to-fuchsia-100">
            <img
              src="/src/assets/images/salon_hero_manicure_1795531097987.jpg"
              alt={config.salon_name}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover lg:absolute lg:inset-0"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#241322]/40 via-transparent to-transparent pointer-events-none" />
          </div>
        </section>

        {/* Booking Flow or Confirmation */}
        {done ? (
          <section className="max-w-2xl mx-auto rounded-3xl bg-white border border-rose-200 shadow-xl p-8 sm:p-10 text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg">
              <Check className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-[#241322]">
                Вы успешно записаны!
              </h2>
              <p className="text-sm text-rose-950/65">
                Окошко закреплено за вами в расписании студии «{done.salon_name}».
              </p>
            </div>

            <div className="rounded-2xl bg-gradient-to-br from-rose-50 via-pink-50/60 to-amber-50/40 border border-rose-100 p-5 text-left space-y-3">
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs font-semibold text-rose-900/60">Услуга</span>
                <span className="text-sm font-bold text-[#241322]">{done.appointment.service}</span>
              </div>
              <div className="flex items-center justify-between gap-4 border-t border-rose-100 pt-2.5">
                <span className="text-xs font-semibold text-rose-900/60">Дата и время</span>
                <span className="text-sm font-bold font-mono-num text-rose-700">
                  {ruDateTime(done.appointment.start_at)} – {done.appointment.end_at.slice(11, 16)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 border-t border-rose-100 pt-2.5">
                <span className="text-xs font-semibold text-rose-900/60">Стоимость</span>
                <span className="text-sm font-bold font-mono-num text-[#241322]">
                  {money(done.appointment.price)}
                </span>
              </div>
              {done.salon_address && (
                <div className="flex items-center justify-between gap-4 border-t border-rose-100 pt-2.5">
                  <span className="text-xs font-semibold text-rose-900/60">Адрес</span>
                  <span className="text-xs font-medium text-rose-950/80">{done.salon_address}</span>
                </div>
              )}
            </div>

            <button type="button" onClick={reset} className={BTN_SECONDARY}>
              Записаться на ещё одну услугу
            </button>
          </section>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left/Main Steps */}
            <div className="lg:col-span-8 space-y-8">
              {/* Step 1: Services */}
              <section id="services" className="space-y-4">
                <div className="flex items-baseline justify-between gap-4">
                  <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#241322]">
                    01. Выберите услугу
                  </h2>
                  <span className="text-xs font-medium text-rose-900/55">
                    {services.length} доступно
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {services.map((s) => {
                    const active = serviceId === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => pickService(s.id)}
                        style={{
                          backgroundColor: active ? hexToRgba(s.color, 0.08) : undefined,
                          borderColor: active ? s.color : undefined,
                        }}
                        className={`group text-left rounded-2xl p-4 border transition-all cursor-pointer flex items-center justify-between gap-4 ${
                          active
                            ? 'shadow-md ring-2 ring-rose-500/20'
                            : 'bg-white border-rose-100 hover:border-rose-300 hover:shadow-sm'
                        }`}
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <span
                            className="w-4 h-10 rounded-full shrink-0 shadow-inner"
                            style={{ backgroundColor: s.color }}
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-[#241322] truncate">
                              {s.name}
                            </div>
                            <div className="text-xs text-rose-950/60 mt-0.5 flex items-center gap-1.5">
                              <span>{durationLabel(s.duration_min)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-base font-bold font-mono-num text-[#241322]">
                            {money(s.price)}
                          </div>
                          {active && (
                            <div className="text-[11px] font-semibold text-rose-600 mt-0.5">
                              Выбрано
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Step 2: Date & Time */}
              {serviceId && (
                <section id="schedule" className="space-y-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#241322]">
                      02. Дата и время
                    </h2>
                    <span className="text-xs font-medium text-rose-900/60 font-mono-num">
                      Часовой пояс салона: {config.tz} · сейчас {salonClock.timeStr}
                    </span>
                  </div>

                  {/* Date strip */}
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {dates.map((d) => {
                      const active = dateStr === d;
                      const isToday = d === salonClock.dateStr;
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setDateStr(d)}
                          className={`shrink-0 min-w-[82px] px-3 py-2.5 rounded-2xl border text-center transition-all cursor-pointer ${
                            active
                              ? 'bg-gradient-to-br from-rose-600 to-fuchsia-600 text-white border-transparent shadow-md'
                              : 'bg-white border-rose-100 text-[#241322] hover:border-rose-300'
                          }`}
                        >
                          <div
                            className={`text-[11px] font-semibold ${
                              active ? 'text-rose-100' : 'text-rose-900/55'
                            }`}
                          >
                            {isToday ? 'Сегодня' : WEEKDAYS[weekdayIdx(d)]}
                          </div>
                          <div className="text-sm font-bold mt-0.5 whitespace-nowrap">
                            {ruDate(d, { short: true })}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Time Slots */}
                  <div className="rounded-2xl bg-white border border-rose-100 p-5">
                    {validSlots === null ? (
                      <Spinner />
                    ) : validSlots.length === 0 ? (
                      <div className="text-center py-6 space-y-3">
                        <p className="text-sm text-rose-950/70">
                          {dateStr === salonClock.dateStr
                            ? 'На сегодня свободных окошек впереди уже нет.'
                            : 'На этот день свободных окон нет — выберите другую дату.'}
                        </p>
                        {nextDateOption && (
                          <button
                            type="button"
                            onClick={() => setDateStr(nextDateOption)}
                            className={BTN_SECONDARY}
                          >
                            Посмотреть {ruDate(nextDateOption, { short: true })}
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="text-xs font-medium text-rose-900/60">
                          Показаны только актуальные свободные окна:
                        </div>
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
                          {validSlots.map((s) => {
                            const t = s.start.slice(11, 16);
                            const active = slot === s.start;
                            return (
                              <button
                                key={s.start}
                                type="button"
                                onClick={() => setSlot(s.start)}
                                className={`py-2.5 px-3 rounded-xl font-mono-num text-sm font-semibold border transition-all cursor-pointer whitespace-nowrap ${
                                  active
                                    ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white border-transparent shadow-md scale-[1.02]'
                                    : 'bg-rose-50/50 hover:bg-rose-100/80 text-[#241322] border-rose-200/70'
                                }`}
                              >
                                {t}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              )}
            </div>

            {/* Right Sticky Contiguous Summary & Form */}
            <aside className="lg:col-span-4 lg:sticky lg:top-24 space-y-5">
              <div className="rounded-3xl bg-white border border-rose-100 shadow-[0_10px_32px_rgba(157,23,77,0.08)] p-6 space-y-5">
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-rose-100">
                  <h3 className="font-display text-2xl font-bold text-[#241322]">
                    03. Ваша запись
                  </h3>
                  <Sparkles className="w-5 h-5 text-rose-500" />
                </div>

                {!selectedService ? (
                  <p className="text-sm text-rose-950/60">
                    Начните с выбора услуги слева — затем выберите удобную дату и время.
                  </p>
                ) : (
                  <div className="space-y-2.5 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-rose-950/60">Услуга</span>
                      <span className="font-semibold text-right">{selectedService.name}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-rose-950/60">Длительность</span>
                      <span className="font-mono-num font-medium">
                        {durationLabel(selectedService.duration_min)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-rose-950/60">Время</span>
                      <span className="font-mono-num font-semibold text-rose-700">
                        {slot ? ruDateTime(slot) : 'Не выбрано'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 pt-2 border-t border-rose-100">
                      <span className="font-semibold text-rose-950/75">Итого</span>
                      <span className="text-lg font-bold font-mono-num text-[#241322]">
                        {money(selectedService.price)}
                      </span>
                    </div>
                  </div>
                )}

                {slot && (
                  <form onSubmit={submit} className="space-y-4 pt-2 border-t border-rose-100">
                    <Field label="Ваше имя">
                      <div className="relative">
                        <User className="w-4 h-4 text-rose-900/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          className={`${INPUT_CLS} pl-10`}
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Как к вам обращаться?"
                          required
                        />
                      </div>
                    </Field>

                    <Field label="Телефон">
                      <div className="relative">
                        <Phone className="w-4 h-4 text-rose-900/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          className={`${INPUT_CLS} pl-10`}
                          type="tel"
                          inputMode="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="+7 900 000-00-00"
                          required
                        />
                      </div>
                    </Field>

                    <Field label="Пожелания (необязательно)">
                      <textarea
                        className={INPUT_CLS}
                        rows={2}
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Оттенок, дизайн, снятие…"
                      />
                    </Field>

                    <button
                      type="submit"
                      disabled={busy || name.trim().length < 2 || phone.replace(/\D/g, '').length < 10}
                      className={`${BTN_PRIMARY} w-full`}
                    >
                      {busy ? 'Оформляем запись…' : 'Подтвердить запись'}
                    </button>
                  </form>
                )}
              </div>
            </aside>
          </div>
        )}

        {/* Studio Atmosphere Visual Section */}
        <section id="studio" className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
          <div className="rounded-3xl overflow-hidden bg-white border border-rose-100 shadow-sm grid grid-cols-1 sm:grid-cols-2">
            <div className="relative min-h-[200px] bg-rose-50">
              <img
                src="/src/assets/images/salon_studio_interior_1795531098912.jpg"
                alt="Интерьер студии"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-6 flex flex-col justify-center space-y-2">
              <h3 className="font-display text-2xl font-bold text-[#241322]">Уютная атмосфера</h3>
              <p className="text-xs sm:text-sm text-rose-950/65 leading-relaxed">
                Комфортные кресла, стерильные инструменты по СанПиН и тёплый приём для каждого гостя.
              </p>
              {config.salon_address && (
                <div className="pt-2 flex items-center gap-1.5 text-xs font-semibold text-rose-700">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{config.salon_address}</span>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl overflow-hidden bg-white border border-rose-100 shadow-sm grid grid-cols-1 sm:grid-cols-2">
            <div className="relative min-h-[200px] bg-amber-50">
              <img
                src="/src/assets/images/salon_nail_palette_1795531098595.jpg"
                alt="Палитра оттенков"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-6 flex flex-col justify-center space-y-2">
              <h3 className="font-display text-2xl font-bold text-[#241322]">Богатая палитра</h3>
              <p className="text-xs sm:text-sm text-rose-950/65 leading-relaxed">
                Сотни оттенков от нежного нюда и жемчужной втирки до глубокого ягодного и изумрудного.
              </p>
              <div className="pt-2 flex items-center gap-1.5 text-xs font-semibold text-fuchsia-700">
                <Calendar className="w-3.5 h-3.5" />
                <span>Запись открыта на {config.booking_horizon_days} дней вперёд</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="max-w-6xl mx-auto px-4 sm:px-6 py-8 border-t border-rose-100 flex flex-wrap items-center justify-between gap-4 text-xs text-rose-900/55">
        <span>{config.salon_name} · Онлайн-запись клиентов</span>
        <Link to="/login" className="hover:text-rose-700 transition-colors">
          Вход для мастера
        </Link>
      </footer>
    </div>
  );
}
