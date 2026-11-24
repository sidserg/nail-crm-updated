import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { X, CheckCircle2, AlertCircle } from 'lucide-react';
import { STATUS_META } from '../lib/utils';

type ToastType = 'ok' | 'err';

interface ToastItem {
  id: string;
  text: string;
  type: ToastType;
}

const ToastCtx = createContext<(text: string, type?: ToastType) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((text: string, type: ToastType = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, 3600);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all ${
              t.type === 'err'
                ? 'bg-rose-950 text-rose-50 border-rose-800'
                : 'bg-[#2d122b] text-rose-50 border-rose-500/30'
            }`}
          >
            {t.type === 'err' ? (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#241322]/45 backdrop-blur-xs p-0 sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`bg-white w-full ${
          wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'
        } rounded-t-2xl sm:rounded-2xl shadow-2xl border border-rose-100 max-h-[90vh] overflow-y-auto p-5 sm:p-6`}
      >
        <div className="flex items-center justify-between gap-4 pb-4 mb-4 border-b border-rose-100">
          <h3 className="text-lg font-bold text-[#241322]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="w-9 h-9 rounded-xl flex items-center justify-center text-rose-900/60 hover:text-rose-900 hover:bg-rose-50 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="w-7 h-7 rounded-full border-3 border-rose-200 border-t-rose-600 animate-spin" />
    </div>
  );
}

export function PageLoading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[260px] gap-3">
      <div className="w-8 h-8 rounded-full border-3 border-rose-200 border-t-rose-600 animate-spin" />
      <span className="text-xs font-medium text-rose-900/50">Загрузка данных…</span>
    </div>
  );
}

export function Empty({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-6 rounded-2xl bg-rose-50/50 border border-dashed border-rose-200">
      <p className="text-sm text-rose-950/70 max-w-md">{children}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      <label className="text-xs font-semibold text-rose-950/70">{label}</label>
      {children}
      {hint && <span className="text-xs text-rose-900/50">{hint}</span>}
    </div>
  );
}

export function StatusLabel({ status }: { status: string }) {
  const meta = STATUS_META[status] || {
    label: status,
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'border-slate-200',
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold border whitespace-nowrap ${meta.bg} ${meta.text} ${meta.border}`}
    >
      {meta.label}
    </span>
  );
}

export const INPUT_CLS =
  'w-full px-3.5 py-2.5 rounded-xl bg-white border border-rose-200/80 text-sm text-[#241322] placeholder:text-rose-900/35 focus:outline-none focus:ring-2 focus:ring-rose-500/25 focus:border-rose-500 transition-colors';

export const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 via-pink-600 to-fuchsia-600 hover:from-rose-700 hover:via-pink-700 hover:to-fuchsia-700 text-white text-sm font-semibold shadow-sm hover:shadow-md active:scale-[0.99] disabled:opacity-45 disabled:pointer-events-none transition-all whitespace-nowrap shrink-0 cursor-pointer';

export const BTN_SECONDARY =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200/80 text-sm font-semibold active:scale-[0.99] disabled:opacity-45 disabled:pointer-events-none transition-all whitespace-nowrap shrink-0 cursor-pointer';

export const BTN_GHOST =
  'inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-rose-900/70 hover:text-rose-950 hover:bg-rose-100/60 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer';

export const BTN_DANGER =
  'inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer';
