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

// ==================== Skeleton Loaders ====================

/**
 * Общий скелетон для загрузки списков
 * @param count - количество элементов для отображения
 * @param className - дополнительные классы
 */
export function SkeletonList({ count = 3, className = '' }: { count?: number; className?: string }) {
  return (
    <div className={`space-y-4 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="animate-pulse">
          <div className="h-4 bg-rose-200/60 rounded w-3/4 mb-2" />
          <div className="h-3 bg-rose-200/60 rounded w-1/2" />
        </div>
      ))}
    </div>
  );
}

/**
 * Скелетон для карточек клиентов
 */
export function SkeletonClientList({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="animate-pulse">
          <div className="flex items-center gap-3 p-4 bg-rose-50/50 rounded-2xl border border-rose-100">
            <div className="w-10 h-10 rounded-xl bg-rose-200/60" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 bg-rose-200/60 rounded w-2/3" />
              <div className="h-3 bg-rose-200/60 rounded w-1/3" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Скелетон для графиков и статистики
 */
export function SkeletonChart({ rows = 5 }: { rows?: number }) {
  return (
    <div className="rounded-3xl bg-white border border-rose-100 p-6">
      <div className="h-5 bg-rose-200/60 rounded w-1/3 mb-4" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-24 h-3 bg-rose-200/60 rounded" />
            <div className="flex-1 h-3 bg-rose-200/60 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Скелетон для таблицы аналитики
 */
export function SkeletonAnalyticsTable({ rows = 7 }: { rows?: number }) {
  return (
    <div className="rounded-3xl bg-white border border-rose-100 p-6">
      <div className="h-4 bg-rose-200/60 rounded w-1/4 mb-4" />
      <div className="divide-y divide-rose-100">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="py-3 flex items-center justify-between gap-4 animate-pulse">
            <div className="space-y-1">
              <div className="h-4 bg-rose-200/60 rounded w-32" />
              <div className="h-3 bg-rose-200/60 rounded w-20" />
            </div>
            <div className="w-16 h-4 bg-rose-200/60 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ==================== Lazy Image Component ====================

interface LazyImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  /** Альтернативный текст */
  alt: string;
  /** Загружаемый src */
  src: string;
  /** Placeholder изображения (опционально) */
  placeholderSrc?: string;
  /** Классы стейджа загрузки */
  loadingClassName?: string;
  /** Классы загруженного изображения */
  loadedClassName?: string;
  /** Callback при загрузке изображения */
  onLoad?: () => void;
}

export function LazyImage({
  src,
  alt,
  placeholderSrc,
  className = '',
  loadingClassName = 'bg-rose-100 animate-pulse',
  loadedClassName = '',
  onLoad,
  ...props
}: LazyImageProps) {
  const [loaded, setLoaded] = useState(false);
  const defaultPlaceholder = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" fill="%23f3f4f6"%3E%3C/svg%3E';
  const [currentSrc, setCurrentSrc] = useState(placeholderSrc || defaultPlaceholder);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setCurrentSrc(src);
      setLoaded(true);
      onLoad?.();
    };
    img.onerror = () => {
      // Если основное изображение не загрузилось, оставляем placeholder
      console.error(`Failed to load image: ${src}`);
    };
    img.src = src;
  }, [src, onLoad]);

  return (
    <img
      {...props}
      src={currentSrc}
      alt={alt}
      className={`transition-all duration-300 ${
        loaded ? loadedClassName : loadingClassName
      } ${className}`}
    />
  );
}

/**
 * Компонент для ленивой загрузки изображений в списке
 */
export function LazyImageSkeleton({
  src,
  alt,
  aspectRatio = 16 / 9,
  className = '',
}: {
  src: string;
  alt: string;
  aspectRatio?: number;
  className?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [currentSrc, setCurrentSrc] = useState('');

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setCurrentSrc(src);
      setLoaded(true);
    };
    img.src = src;
  }, [src]);

  const placeholderSrc = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 225" fill="%23f3f4f6"%3E%3C/svg%3E';

  return (
    <div
      className={`overflow-hidden rounded-xl ${className}`}
      style={{ aspectRatio }}
    >
      <img
        src={currentSrc || placeholderSrc}
        alt={alt}
        className={`w-full h-full object-cover transition-all duration-300 ${
          loaded ? 'opacity-100' : 'opacity-70'
        }`}
        onLoad={() => setLoaded(true)}
      />
      {!loaded && <div className="absolute inset-0 bg-rose-100 animate-pulse" />}
    </div>
  );
}
