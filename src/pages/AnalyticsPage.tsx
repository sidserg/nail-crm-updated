import React, { useCallback, useEffect, useState } from 'react';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { api, copyText } from '../lib/api';
import {
  BTN_DANGER,
  BTN_PRIMARY,
  BTN_SECONDARY,
  Empty,
  Field,
  INPUT_CLS,
  SkeletonChart,
  SkeletonList,
  useToast,
} from '../components/UI';
import { addDays, fmtPhone, money, ruDate, todayStr } from '../lib/utils';

interface SummaryData {
  revenue: number;
  completed_count: number;
  avg_check: number;
  expenses: number;
  net_profit: number;
  revenue_by_day: Array<{ date: string; revenue: number }>;
  top_services: Array<{ name: string; color?: string; count: number; revenue: number }>;
  status_counts: {
    confirmed: number;
    completed: number;
    cancelled: number;
    no_show: number;
  };
}

interface ExpenseItem {
  id: number;
  date: string;
  category: string;
  amount: number;
  comment: string;
}

interface InactiveClient {
  id: number;
  name: string;
  phone: string;
  last_visit: string;
  days_ago: number;
  visits: number;
  total_spent: number;
}

const PRESETS: Record<string, () => [string, string]> = {
  today: () => [todayStr(), todayStr()],
  week: () => [addDays(todayStr(), -6), todayStr()],
  month: () => [addDays(todayStr(), -29), todayStr()],
};

function RevenueChart({ data }: { data: Array<{ date: string; revenue: number }> }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  if (data.length === 0) return <Empty>Нет данных за выбранный период</Empty>;

  const maxRev = Math.max(...data.map((d) => d.revenue), 1);

  return (
    <div className="space-y-2 pt-2">
      <div className="h-44 flex items-end gap-1 sm:gap-1.5 border-b border-rose-100 pb-1">
        {data.map((d, i) => {
          const pct = Math.max(d.revenue > 0 ? 6 : 2, Math.round((d.revenue / maxRev) * 100));
          const isHovered = hoverIdx === i;
          return (
            <div
              key={d.date}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              className="flex-1 h-full flex flex-col justify-end items-center relative group cursor-pointer"
              title={`${ruDate(d.date, { short: true })}: ${money(d.revenue)}`}
            >
              {isHovered && (
                <div className="absolute -top-8 z-10 px-2 py-1 rounded-lg bg-[#2d122b] text-white text-[11px] font-mono-num whitespace-nowrap shadow-md">
                  {ruDate(d.date, { short: true })}: {money(d.revenue)}
                </div>
              )}
              <div
                style={{ height: `${pct}%` }}
                className={`w-full max-w-[26px] rounded-t-lg transition-all ${
                  d.revenue > 0
                    ? 'bg-gradient-to-t from-rose-600 via-pink-500 to-amber-400 group-hover:brightness-110'
                    : 'bg-rose-100/70'
                }`}
              />
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-[11px] font-mono-num text-rose-900/55">
        <span>{ruDate(data[0].date, { short: true })}</span>
        {data.length > 2 && (
          <span>{ruDate(data[Math.floor(data.length / 2)].date, { short: true })}</span>
        )}
        <span>{ruDate(data[data.length - 1].date, { short: true })}</span>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const toast = useToast();
  const [period, setPeriod] = useState('month');
  const [from, setFrom] = useState(() => addDays(todayStr(), -29));
  const [to, setTo] = useState(() => todayStr());
  const [data, setData] = useState<SummaryData | null>(null);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [inactive, setInactive] = useState<InactiveClient[] | null>(null);
  const [inactiveDays, setInactiveDays] = useState(60);
  const [expForm, setExpForm] = useState({
    date: todayStr(),
    category: 'Материалы',
    amount: '',
    comment: '',
  });

  const loadFinance = useCallback(() => {
    Promise.all([
      api<SummaryData>('/analytics/summary', { params: { from, to } }),
      api<ExpenseItem[]>('/expenses', { params: { from, to } }),
    ])
      .then(([summary, exps]) => {
        setData(summary);
        setExpenses(exps);
      })
      .catch((e: unknown) => toast(e instanceof Error ? e.message : 'Ошибка загрузки', 'err'));
  }, [from, to, toast]);

  useEffect(() => {
    setData(null);
    loadFinance();
  }, [loadFinance]);

  useEffect(() => {
    api<InactiveClient[]>('/analytics/inactive', { params: { days: inactiveDays } })
      .then(setInactive)
      .catch(() => {});
  }, [inactiveDays]);

  const applyPreset = (p: 'today' | 'week' | 'month') => {
    setPeriod(p);
    const [f, t] = PRESETS[p]();
    setFrom(f);
    setTo(t);
  };

  const addExpense = async () => {
    try {
      await api('/expenses', {
        method: 'POST',
        body: { ...expForm, amount: Number(expForm.amount) },
      });
      setExpForm({ ...expForm, amount: '', comment: '' });
      toast('Расход добавлен');
      loadFinance();
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Ошибка', 'err');
    }
  };

  const removeExpense = async (id: number) => {
    if (!window.confirm('Удалить запись о расходе?')) return;
    try {
      await api(`/expenses/${id}`, { method: 'DELETE' });
      loadFinance();
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Ошибка', 'err');
    }
  };

  const invite = async (c: InactiveClient) => {
    const text = `Здравствуйте, ${c.name}! Вы были у нас ${ruDate(
      c.last_visit.slice(0, 10),
    )} — самое время обновить маникюр! Свободные окошки и запись онлайн: ${window.location.origin}/book`;
    const ok = await copyText(text);
    toast(ok ? 'Приглашение скопировано' : 'Не удалось скопировать', ok ? 'ok' : 'err');
  };

  const maxSvc = data ? Math.max(...data.top_services.map((s) => s.count), 1) : 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-[#241322]">Финансы и аналитика</h1>
          <p className="text-xs text-rose-900/60 mt-0.5">
            Выручка, популярные услуги, расходы и возврат постоянных клиентов
          </p>
        </div>

        <div className="inline-flex items-center gap-1 p-1 rounded-2xl bg-white border border-rose-200">
          {([
            ['today', 'Сегодня'],
            ['week', '7 дней'],
            ['month', '30 дней'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => applyPreset(key)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                period === key
                  ? 'bg-gradient-to-r from-rose-600 to-fuchsia-600 text-white shadow-xs'
                  : 'text-rose-950/70 hover:text-rose-950 hover:bg-rose-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-md">
        <Field label="С">
          <input
            className={`${INPUT_CLS} font-mono-num`}
            type="date"
            value={from}
            onChange={(e) => {
              setPeriod('custom');
              setFrom(e.target.value);
            }}
          />
        </Field>
        <Field label="По">
          <input
            className={`${INPUT_CLS} font-mono-num`}
            type="date"
            value={to}
            onChange={(e) => {
              setPeriod('custom');
              setTo(e.target.value);
            }}
          />
        </Field>
      </div>

      {data === null ? (
        <SkeletonChart rows={5} />
      ) : (
        <div className="space-y-6">
          {/* KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
            <div className="rounded-2xl bg-gradient-to-br from-rose-600 to-pink-600 text-white p-4 shadow-sm">
              <div className="text-xs font-medium text-rose-100">Выручка</div>
              <div className="text-2xl font-bold font-mono-num mt-1">{money(data.revenue)}</div>
            </div>
            <div className="rounded-2xl bg-white border border-rose-100 p-4">
              <div className="text-xs font-medium text-rose-900/60">Выполнено</div>
              <div className="text-2xl font-bold font-mono-num text-[#241322] mt-1">
                {data.completed_count}
              </div>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200/70 p-4">
              <div className="text-xs font-medium text-amber-800/80">Средний чек</div>
              <div className="text-2xl font-bold font-mono-num text-amber-900 mt-1">
                {money(data.avg_check)}
              </div>
            </div>
            <div className="rounded-2xl bg-white border border-rose-100 p-4">
              <div className="text-xs font-medium text-rose-900/60">Расходы</div>
              <div className="text-2xl font-bold font-mono-num text-rose-700 mt-1">
                {money(data.expenses)}
              </div>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white p-4 shadow-sm col-span-2 sm:col-span-1">
              <div className="text-xs font-medium text-emerald-50">Чистая прибыль</div>
              <div className="text-2xl font-bold font-mono-num mt-1">{money(data.net_profit)}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Revenue Chart */}
            <div className="lg:col-span-7 rounded-3xl bg-white border border-rose-100 p-6 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-bold text-[#241322]">Выручка по дням</h2>
                <span className="text-xs text-rose-900/55 font-mono-num">
                  Отмены: {data.status_counts.cancelled} · Неявки: {data.status_counts.no_show}
                </span>
              </div>
              <RevenueChart data={data.revenue_by_day} />
            </div>

            {/* Top Services */}
            <div className="lg:col-span-5 rounded-3xl bg-white border border-rose-100 p-6 space-y-4">
              <h2 className="text-base font-bold text-[#241322]">Популярные услуги</h2>
              {data.top_services.length === 0 ? (
                <Empty>Пока нет выполненных записей за этот период</Empty>
              ) : (
                <div className="space-y-3.5">
                  {data.top_services.map((s, i) => (
                    <div key={s.name} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-[#241322] truncate">
                          {i + 1}. {s.name}
                        </span>
                        <span className="font-mono-num text-rose-900/70 shrink-0">
                          <b>{s.count}</b> × · {money(s.revenue)}
                        </span>
                      </div>
                      <div className="h-2.5 rounded-full bg-rose-50 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${(s.count / maxSvc) * 100}%`,
                            backgroundColor: s.color || '#e11d48',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Expenses */}
          <div className="rounded-3xl bg-white border border-rose-100 p-6 space-y-4">
            <h2 className="text-base font-bold text-[#241322]">Расходы за период</h2>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-2">
                <Field label="Дата">
                  <input
                    className={`${INPUT_CLS} font-mono-num`}
                    type="date"
                    value={expForm.date}
                    onChange={(e) => setExpForm({ ...expForm, date: e.target.value })}
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Сумма, ₽">
                  <input
                    className={`${INPUT_CLS} font-mono-num`}
                    type="number"
                    min="0"
                    placeholder="1500"
                    value={expForm.amount}
                    onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })}
                  />
                </Field>
              </div>
              <div className="sm:col-span-3">
                <Field label="Категория">
                  <select
                    className={INPUT_CLS}
                    value={expForm.category}
                    onChange={(e) => setExpForm({ ...expForm, category: e.target.value })}
                  >
                    {['Материалы', 'Аренда', 'Инструменты', 'Реклама', 'Обучение', 'Прочее'].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="sm:col-span-3">
                <Field label="Комментарий">
                  <input
                    className={INPUT_CLS}
                    placeholder="Необязательно"
                    value={expForm.comment}
                    onChange={(e) => setExpForm({ ...expForm, comment: e.target.value })}
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <button
                  type="button"
                  className={`${BTN_PRIMARY} w-full`}
                  disabled={!expForm.amount || Number(expForm.amount) <= 0}
                  onClick={addExpense}
                >
                  <Plus className="w-4 h-4" />
                  Добавить
                </button>
              </div>
            </div>

            {expenses.length === 0 ? (
              <p className="text-xs text-rose-900/55">Расходов за выбранный период нет</p>
            ) : (
              <div className="divide-y divide-rose-50">
                {expenses.map((e) => (
                  <div key={e.id} className="py-2.5 flex items-center justify-between gap-4 text-sm">
                    <div className="min-w-0">
                      <span className="font-mono-num font-bold text-[#241322]">
                        {ruDate(e.date, { short: true })}
                      </span>
                      <span className="text-rose-950/75"> · {e.category}</span>
                      {e.comment && <span className="text-rose-900/55"> — {e.comment}</span>}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono-num font-bold text-[#241322]">{money(e.amount)}</span>
                      <button
                        type="button"
                        className={`${BTN_DANGER} !p-2`}
                        onClick={() => removeExpense(e.id)}
                        aria-label="Удалить расход"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Inactive Clients Win-back */}
          <div className="rounded-3xl bg-white border border-rose-100 p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-[#241322]">Пора обновить маникюр</h2>
                <p className="text-xs text-rose-900/60 mt-0.5">
                  Клиенты, которые давно не записывались — кнопка копирует готовое приглашение со ссылкой
                </p>
              </div>
              <select
                className={`${INPUT_CLS} !w-auto`}
                value={inactiveDays}
                onChange={(e) => setInactiveDays(Number(e.target.value))}
              >
                <option value={30}>Не были 30+ дней</option>
                <option value={60}>Не были 60+ дней</option>
                <option value={90}>Не были 90+ дней</option>
              </select>
            </div>

            {inactive === null ? (
              <SkeletonList count={3} />
            ) : inactive.length === 0 ? (
              <Empty>Все клиенты были недавно — никто не пропал</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-rose-100 text-left text-xs font-semibold text-rose-900/60">
                      <th className="py-2.5 pr-4">Клиент</th>
                      <th className="py-2.5 pr-4">Последний визит</th>
                      <th className="py-2.5 pr-4 text-right">Потрачено</th>
                      <th className="py-2.5 text-right">Действие</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rose-50">
                    {inactive.map((c) => (
                      <tr key={c.id} className="hover:bg-rose-50/40">
                        <td className="py-3 pr-4">
                          <div className="font-bold text-[#241322]">{c.name}</div>
                          <div className="text-xs font-mono-num text-rose-900/55">
                            {fmtPhone(c.phone)}
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-xs">
                          <span className="font-mono-num font-semibold">
                            {ruDate(c.last_visit.slice(0, 10), { short: true })}
                          </span>
                          <span className="text-rose-900/55"> ({c.days_ago} дн. назад)</span>
                        </td>
                        <td className="py-3 pr-4 text-right font-mono-num font-bold">
                          {money(c.total_spent)}
                        </td>
                        <td className="py-3 text-right">
                          <button
                            type="button"
                            className={`${BTN_SECONDARY} !py-1.5 !px-3 text-xs`}
                            onClick={() => invite(c)}
                          >
                            <Copy className="w-3.5 h-3.5" />
                            Пригласить
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
