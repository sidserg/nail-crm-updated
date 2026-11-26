import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import { Empty, SkeletonChart, useToast } from '../components/UI';
import { pad, WEEKDAYS } from '../lib/utils';

const MONTHS_NOM = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

function heatClasses(count: number): string {
  if (count <= 0) return 'bg-rose-50/40 text-rose-900/40';
  if (count === 1) return 'bg-rose-100 text-rose-900 border-rose-200 hover:border-rose-400';
  if (count === 2) return 'bg-pink-200 text-rose-950 border-pink-300 hover:border-pink-500';
  if (count === 3) return 'bg-rose-400 text-white border-rose-500 hover:bg-rose-500';
  if (count === 4) return 'bg-fuchsia-600 text-white border-fuchsia-700 hover:bg-fuchsia-700';
  return 'bg-gradient-to-br from-rose-700 to-purple-800 text-white border-purple-900 shadow-sm';
}

export default function OverviewPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { year, month } = cursor;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api<Record<string, number>>('/overview/stats', { params: { year, month } })
      .then((data) => {
        if (!alive) return;
        setStats(data);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        const msg = e instanceof Error ? e.message : 'Ошибка загрузки';
        setError(msg);
        setLoading(false);
        toast(msg, 'err');
      });
    return () => {
      alive = false;
    };
  }, [year, month, toast]);

  const shiftMonth = (delta: number) => {
    setCursor((c) => {
      const d = new Date(c.year, c.month - 1 + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    });
  };

  const cells = useMemo(() => {
    const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month, 0).getDate();
    const list: Array<number | null> = [
      ...Array.from({ length: firstWeekday }, () => null),
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    while (list.length % 7 !== 0) list.push(null);
    return list;
  }, [year, month]);

  // Текущий день для выделения
  const today = new Date();
  const isToday = (day: number) => 
    day === today.getDate() && 
    year === today.getFullYear() && 
    month === today.getMonth() + 1;

  const total = stats ? Object.values(stats).reduce((sum, n) => sum + Number(n || 0), 0) : 0;
  const busyDays = stats ? Object.values(stats).filter((n) => Number(n) > 0).length : 0;
  const peakEntry = stats
    ? Object.entries(stats).sort((a, b) => Number(b[1]) - Number(a[1]))[0]
    : null;

  const openDay = (day: number) => {
    const count = Number(stats?.[String(day)] || 0);
    if (count <= 0) return;
    navigate(`/?date=${year}-${pad(month)}-${pad(day)}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-[#241322]">Обзор месяца</h1>
          <p className="text-xs text-rose-900/60 mt-0.5">
            Тепловая карта загрузки — нажмите на любой день с записями, чтобы открыть расписание
          </p>
        </div>

        <div className="flex items-center gap-2 bg-white border border-rose-200 rounded-2xl p-1.5 shadow-xs">
          <button
            type="button"
            className="w-9 h-9 rounded-xl flex items-center justify-center text-rose-900 hover:bg-rose-50 transition-colors cursor-pointer"
            onClick={() => shiftMonth(-1)}
            aria-label="Предыдущий месяц"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="px-3 text-sm font-bold text-[#241322] min-w-[130px] text-center">
            {MONTHS_NOM[month - 1]} {year}
          </div>
          <button
            type="button"
            className="w-9 h-9 rounded-xl flex items-center justify-center text-rose-900 hover:bg-rose-50 transition-colors cursor-pointer"
            onClick={() => shiftMonth(1)}
            aria-label="Следующий месяц"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Month KPIs — скрыты на мобильных, видны на md+ */}
      <div className="hidden md:grid md:grid-cols-3 gap-3.5">
        <div className="rounded-2xl bg-gradient-to-br from-rose-50 to-pink-50 border border-rose-200/70 p-4">
          <div className="text-xs font-medium text-rose-800/75">Активных записей</div>
          <div className="text-2xl font-bold font-mono-num text-rose-700 mt-1">{total}</div>
        </div>
        <div className="rounded-2xl bg-white border border-rose-100 p-4">
          <div className="text-xs font-medium text-rose-900/60">Рабочих дней с записями</div>
          <div className="text-2xl font-bold font-mono-num text-[#241322] mt-1">{busyDays}</div>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-fuchsia-50 to-purple-50 border border-fuchsia-200/70 p-4">
          <div className="text-xs font-medium text-fuchsia-800/75">Самый плотный день</div>
          <div className="text-2xl font-bold font-mono-num text-fuchsia-800 mt-1">
            {peakEntry && Number(peakEntry[1]) > 0
              ? `${peakEntry[0]}.${pad(month)} • ${peakEntry[1]} зап.`
              : '—'}
          </div>
        </div>
      </div>

      <div className="rounded-3xl bg-white border border-rose-100 shadow-sm p-5 sm:p-6">
        {loading ? (
          <SkeletonChart rows={5} />
        ) : error ? (
          <Empty>{error}</Empty>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-7 gap-2">
              {WEEKDAYS.map((wd) => (
                <div key={wd} className="text-center text-xs font-bold text-rose-900/55 pb-1">
                  {wd}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-2">
              {cells.map((day, idx) => {
                if (day === null) {
                  return <div key={`empty-${idx}`} className="h-16 sm:h-20 rounded-2xl" aria-hidden="true" />;
                }
                const count = Number(stats?.[String(day)] || 0);
                const clickable = count > 0;
                return (
                  <button
                    key={day}
                    type="button"
                    disabled={!clickable}
                    onClick={() => openDay(day)}
                    title={clickable ? `Записей: ${count}. Открыть день в календаре` : 'Нет записей'}
                    className={`h-16 sm:h-20 rounded-2xl border-2 p-2 sm:p-2.5 flex flex-col items-start justify-between transition-all ${heatClasses(count)} ${isToday(day) ? 'border-4 border-black shadow-xl' : ''} ${clickable ? 'cursor-pointer hover:-translate-y-0.5' : 'cursor-default'}`}
                  >
                    <span className="text-xs sm:text-sm font-bold font-mono-num">{day}</span>
                    {clickable && (
                      <span className="self-end text-[11px] sm:text-xs font-bold font-mono-num">
                        {count} зап.
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-rose-100 text-xs text-rose-900/65">
              <div className="flex items-center gap-2">
                <span>Нагрузка:</span>
                {[0, 1, 2, 3, 4, 5].map((lvl) => (
                  <span
                    key={lvl}
                    className={`w-6 h-6 rounded-lg border inline-flex items-center justify-center text-[11px] font-mono-num font-bold ${heatClasses(
                      lvl,
                    )}`}
                  >
                    {lvl === 5 ? '5+' : lvl}
                  </span>
                ))}
              </div>
              <span>Всего записей за месяц: {total}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}