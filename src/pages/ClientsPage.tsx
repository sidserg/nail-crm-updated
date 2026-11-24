import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, ChevronRight, Plus, Search } from 'lucide-react';
import { api, copyText } from '../lib/api';
import { useSettings } from '../context/SettingsContext';
import {
  BTN_DANGER,
  BTN_PRIMARY,
  BTN_SECONDARY,
  Empty,
  Field,
  INPUT_CLS,
  Modal,
  PageLoading,
  StatusLabel,
  useToast,
} from '../components/UI';
import { AppointmentItem, ClientItem, fmtPhone, money, ruDateTime } from '../lib/utils';

const AVATAR_GRADIENTS = [
  'from-rose-500 to-pink-600',
  'from-fuchsia-500 to-purple-600',
  'from-amber-500 to-orange-600',
  'from-emerald-500 to-teal-600',
  'from-cyan-500 to-blue-600',
];

function avatarGradient(id: number): string {
  return AVATAR_GRADIENTS[id % AVATAR_GRADIENTS.length];
}

interface ClientDetailResponse {
  client: ClientItem;
  stats: { visits: number; total_spent: number; last_visit: string | null };
  appointments: AppointmentItem[];
}

function ClientModal({
  clientId,
  onClose,
  onChanged,
}: {
  clientId?: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const isNew = !clientId;
  const { settings } = useSettings();
  const toast = useToast();
  const nav = useNavigate();

  const [detail, setDetail] = useState<ClientDetailResponse | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', birth_date: '', notes: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!clientId) return;
    api<ClientDetailResponse>(`/clients/${clientId}`)
      .then((d) => {
        setDetail(d);
        setForm({
          name: d.client.name,
          phone: fmtPhone(d.client.phone),
          birth_date: d.client.birth_date || '',
          notes: d.client.notes || '',
        });
      })
      .catch((e: unknown) => toast(e instanceof Error ? e.message : 'Ошибка загрузки', 'err'));
  }, [clientId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        name: form.name,
        phone: form.phone,
        birth_date: form.birth_date || null,
        notes: form.notes,
      };
      if (isNew) {
        await api('/clients', { method: 'POST', body });
        toast('Клиент добавлен');
        onChanged();
        onClose();
      } else {
        await api(`/clients/${clientId}`, { method: 'PATCH', body });
        toast('Карточка обновлена');
        onChanged();
        load();
      }
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Ошибка сохранения', 'err');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!clientId) return;
    if (!window.confirm(`Удалить клиента «${form.name}»?`)) return;
    try {
      await api(`/clients/${clientId}`, { method: 'DELETE' });
    } catch (e: unknown) {
      const status = (e as { status?: number })?.status;
      const msg = e instanceof Error ? e.message : 'Ошибка';
      if (status === 409) {
        if (!window.confirm(msg + '\n\nУдалить клиента ВМЕСТЕ со всеми записями?')) return;
        try {
          await api(`/clients/${clientId}`, { method: 'DELETE', params: { force: true } });
        } catch (e2: unknown) {
          toast(e2 instanceof Error ? e2.message : 'Ошибка', 'err');
          return;
        }
      } else {
        toast(msg, 'err');
        return;
      }
    }
    toast('Клиент удалён');
    onChanged();
    onClose();
  };

  const tgLink =
    detail && settings.bot_username
      ? `https://t.me/${settings.bot_username}?start=c_${detail.client.tg_token}`
      : null;

  const copyTg = async () => {
    if (!tgLink) return;
    const ok = await copyText(tgLink);
    toast(ok ? 'Ссылка скопирована' : 'Не удалось скопировать', ok ? 'ok' : 'err');
  };

  return (
    <Modal title={isNew ? 'Новый клиент' : 'Карточка клиента'} onClose={onClose} wide>
      {detail === null && !isNew ? (
        <PageLoading />
      ) : (
        <div className="space-y-4">
          {detail && (
            <div className="grid grid-cols-3 gap-2.5">
              <div className="rounded-xl bg-rose-50/70 border border-rose-100 p-3">
                <div className="text-[11px] font-medium text-rose-900/60">Визитов</div>
                <div className="text-lg font-bold font-mono-num text-[#241322]">{detail.stats.visits}</div>
              </div>
              <div className="rounded-xl bg-emerald-50/70 border border-emerald-100 p-3">
                <div className="text-[11px] font-medium text-emerald-800/70">Потрачено</div>
                <div className="text-lg font-bold font-mono-num text-emerald-700">
                  {money(detail.stats.total_spent)}
                </div>
              </div>
              <div className="rounded-xl bg-fuchsia-50/70 border border-fuchsia-100 p-3">
                <div className="text-[11px] font-medium text-fuchsia-800/70">Последний визит</div>
                <div className="text-xs font-bold font-mono-num text-fuchsia-900 mt-1">
                  {detail.stats.last_visit ? ruDateTime(detail.stats.last_visit) : '—'}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Имя">
              <input
                className={INPUT_CLS}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Телефон">
              <input
                className={`${INPUT_CLS} font-mono-num`}
                inputMode="tel"
                placeholder="+7 …"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Дата рождения">
            <input
              className={INPUT_CLS}
              type="date"
              value={form.birth_date}
              onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
            />
          </Field>

          <Field label="Заметки (аллергии, форма, любимые оттенки)">
            <textarea
              className={INPUT_CLS}
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>

          {detail && settings.telegram_enabled && tgLink && (
            <Field label="Напоминания в Telegram">
              <div className="flex gap-2">
                <input className={INPUT_CLS} readOnly value={tgLink} />
                <button type="button" className={BTN_SECONDARY} onClick={copyTg}>
                  Копировать
                </button>
              </div>
            </Field>
          )}

          <div className="flex items-center justify-between gap-3 pt-2 border-t border-rose-100">
            {!isNew ? (
              <button type="button" className={BTN_DANGER} onClick={remove}>
                Удалить
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              {!isNew && (
                <button
                  type="button"
                  className={BTN_SECONDARY}
                  onClick={() => nav(`/?client=${clientId}`)}
                >
                  <Calendar className="w-4 h-4" />
                  Записать
                </button>
              )}
              <button
                type="button"
                className={BTN_PRIMARY}
                disabled={busy || !form.name.trim() || !form.phone.trim()}
                onClick={save}
              >
                Сохранить
              </button>
            </div>
          </div>

          {detail && detail.appointments.length > 0 && (
            <div className="pt-3 border-t border-rose-100 space-y-2">
              <h4 className="text-xs font-bold text-rose-900/65">История посещений</h4>
              <div className="divide-y divide-rose-50 max-h-56 overflow-y-auto">
                {detail.appointments.slice(0, 20).map((a) => (
                  <div key={a.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <span className="font-mono-num font-bold text-[#241322]">
                        {ruDateTime(a.start_at)}
                      </span>
                      <span className="text-rose-950/70"> · {a.service.name}</span>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <span className="font-mono-num font-semibold">{money(a.price)}</span>
                      <StatusLabel status={a.status} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function ClientsPage() {
  const [q, setQ] = useState('');
  const [list, setList] = useState<ClientItem[] | null>(null);
  const [sel, setSel] = useState<{ id?: number; isNew?: boolean } | null>(null);
  const toast = useToast();

  const reload = useCallback(() => {
    api<ClientItem[]>('/clients', { params: { q } })
      .then(setList)
      .catch((e: unknown) => toast(e instanceof Error ? e.message : 'Ошибка загрузки', 'err'));
  }, [q, toast]);

  useEffect(() => {
    const t = setTimeout(reload, 200);
    return () => clearTimeout(t);
  }, [reload]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-[#241322]">Клиенты</h1>
          <p className="text-xs text-rose-900/60 mt-0.5">
            База постоянных гостей, предпочтения по дизайну и история визитов
          </p>
        </div>

        <button type="button" className={BTN_PRIMARY} onClick={() => setSel({ isNew: true })}>
          <Plus className="w-4 h-4" />
          Клиент
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-rose-900/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          className={`${INPUT_CLS} pl-10`}
          placeholder="Быстрый поиск по имени или телефону…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="rounded-3xl bg-white border border-rose-100 shadow-sm overflow-hidden">
        {list === null ? (
          <PageLoading />
        ) : list.length === 0 ? (
          <div className="p-6">
            <Empty>
              Клиентов пока нет. Добавьте первого вручную — или они появятся сами после онлайн-записи.
            </Empty>
          </div>
        ) : (
          <div className="divide-y divide-rose-50">
            {list.map((c) => {
              const initials = c.name
                .split(' ')
                .slice(0, 2)
                .map((p) => p[0] || '')
                .join('')
                .toUpperCase();
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSel({ id: c.id })}
                  className="w-full text-left px-5 py-3.5 hover:bg-rose-50/55 transition-colors flex items-center justify-between gap-4 cursor-pointer"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl bg-gradient-to-br ${avatarGradient(
                        c.id,
                      )} text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs`}
                    >
                      {initials || 'К'}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-[#241322] truncate">{c.name}</div>
                      <div className="text-xs text-rose-900/60 truncate mt-0.5">
                        <span className="font-mono-num">{fmtPhone(c.phone)}</span>
                        {c.notes ? ` · ${c.notes}` : ''}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-rose-900/40 shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {sel && (
        <ClientModal
          clientId={sel.id}
          onClose={() => setSel(null)}
          onChanged={reload}
        />
      )}
    </div>
  );
}
