import React, { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import {
  BTN_DANGER,
  BTN_PRIMARY,
  BTN_SECONDARY,
  Empty,
  Field,
  INPUT_CLS,
  Modal,
  PageLoading,
  useToast,
} from '../components/UI';
import { durationLabel, hexToRgba, money, ServiceItem } from '../lib/utils';

const POLISH_SWATCHES = [
  '#e11d48',
  '#db2777',
  '#a21caf',
  '#7c3aed',
  '#2563eb',
  '#0891b2',
  '#059669',
  '#d97706',
  '#dc2626',
  '#475569',
];

function ServiceModal({
  service,
  onClose,
  onSaved,
}: {
  service?: ServiceItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = Boolean(service?.id);
  const toast = useToast();
  const [form, setForm] = useState({
    name: service?.name || '',
    duration_min: service?.duration_min ?? 60,
    price: service?.price ?? 1500,
    color: service?.color || '#e11d48',
    is_active: service?.is_active ?? true,
  });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        ...form,
        duration_min: Number(form.duration_min),
        price: Number(form.price),
      };
      if (editing && service) {
        await api(`/services/${service.id}`, { method: 'PATCH', body });
      } else {
        await api('/services', { method: 'POST', body });
      }
      toast(editing ? 'Услуга обновлена' : 'Услуга добавлена');
      onSaved();
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Ошибка сохранения', 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={editing ? 'Редактировать услугу' : 'Новая услуга'} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Название услуги">
          <input
            className={INPUT_CLS}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            autoFocus
            placeholder="Например, Маникюр + гель-лак"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Длительность, мин">
            <input
              className={`${INPUT_CLS} font-mono-num`}
              type="number"
              min="5"
              step="5"
              value={form.duration_min}
              onChange={(e) => setForm({ ...form, duration_min: Number(e.target.value) })}
            />
          </Field>
          <Field label="Стоимость, ₽">
            <input
              className={`${INPUT_CLS} font-mono-num`}
              type="number"
              min="0"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
            />
          </Field>
        </div>

        <Field label="Цвет в расписании и онлайн-записи">
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {POLISH_SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setForm({ ...form, color: c })}
                style={{ backgroundColor: c }}
                className={`w-8 h-8 rounded-xl transition-transform cursor-pointer ${
                  form.color.toLowerCase() === c
                    ? 'scale-110 ring-2 ring-offset-2 ring-[#241322]'
                    : 'hover:scale-105'
                }`}
                aria-label={`Выбрать цвет ${c}`}
              />
            ))}
            <input
              type="color"
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
              className="w-8 h-8 rounded-xl border border-rose-200 cursor-pointer p-0.5 bg-white"
              title="Произвольный цвет"
            />
          </div>
        </Field>

        <label className="flex items-center gap-2.5 text-sm font-semibold text-[#241322] cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            className="rounded border-rose-300 text-rose-600 focus:ring-rose-500"
          />
          Активна (доступна для онлайн-записи)
        </label>

        <div className="flex items-center justify-between gap-3 pt-3 border-t border-rose-100">
          <span className="text-xs text-rose-900/60 font-mono-num">
            Длительность: {durationLabel(Number(form.duration_min) || 0)}
          </span>
          <button
            type="button"
            className={BTN_PRIMARY}
            disabled={busy || !form.name.trim()}
            onClick={save}
          >
            Сохранить
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function ServicesPage() {
  const [list, setList] = useState<ServiceItem[] | null>(null);
  const [sel, setSel] = useState<{ service?: ServiceItem } | null>(null);
  const toast = useToast();

  const load = useCallback(() => {
    api<ServiceItem[]>('/services')
      .then(setList)
      .catch((e: unknown) => toast(e instanceof Error ? e.message : 'Ошибка загрузки', 'err'));
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (s: ServiceItem) => {
    if (!window.confirm(`Удалить услугу «${s.name}»?`)) return;
    try {
      await api(`/services/${s.id}`, { method: 'DELETE' });
      toast('Услуга удалена');
      load();
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Ошибка удаления', 'err');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-[#241322]">Услуги и прайс</h1>
          <p className="text-xs text-rose-900/60 mt-0.5">
            Цветовая кодировка, длительность процедур и прайс для онлайн-записи
          </p>
        </div>

        <button type="button" className={BTN_PRIMARY} onClick={() => setSel({})}>
          <Plus className="w-4 h-4" />
          Услуга
        </button>
      </div>

      {list === null ? (
        <PageLoading />
      ) : list.length === 0 ? (
        <Empty>Добавьте услуги — от их длительности зависит сетка календаря</Empty>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {list.map((s) => (
            <div
              key={s.id}
              style={{ backgroundColor: s.is_active ? hexToRgba(s.color, 0.05) : '#f8fafc' }}
              className={`rounded-2xl border p-4 flex items-center justify-between gap-4 transition-all ${
                s.is_active ? 'border-rose-100 bg-white' : 'border-slate-200 opacity-70'
              }`}
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <span
                  className="w-4 h-12 rounded-full shrink-0 shadow-xs"
                  style={{ backgroundColor: s.color }}
                />
                <div className="min-w-0">
                  <div className="text-sm font-bold text-[#241322] truncate">{s.name}</div>
                  <div className="text-xs text-rose-900/65 mt-0.5 flex items-center gap-2 font-mono-num">
                    <span>{durationLabel(s.duration_min)}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-bold text-[#241322]">{money(s.price)}</span>
                    <span aria-hidden="true">·</span>
                    <span className={s.is_active ? 'text-emerald-700 font-semibold' : 'text-slate-500'}>
                      {s.is_active ? 'Активна' : 'Скрыта'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  className={`${BTN_SECONDARY} !p-2`}
                  onClick={() => setSel({ service: s })}
                  aria-label="Изменить"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  className={`${BTN_DANGER} !p-2`}
                  onClick={() => remove(s)}
                  aria-label="Удалить"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {sel && (
        <ServiceModal
          service={sel.service}
          onClose={() => setSel(null)}
          onSaved={() => {
            setSel(null);
            load();
          }}
        />
      )}
    </div>
  );
}
