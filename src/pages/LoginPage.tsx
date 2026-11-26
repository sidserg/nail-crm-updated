import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock, User } from 'lucide-react';
import { api, setToken } from '../lib/api';
import { BTN_PRIMARY, BTN_SECONDARY, Field, INPUT_CLS, useToast } from '../components/UI';
import salonInterior from '../assets/images/salon_studio_interior_1795531098912.jpg';

export default function LoginPage() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [config, setConfig] = useState<{ salon_name: string; demo?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const toast = useToast();

  useEffect(() => {
    api<{ salon_name: string; demo?: boolean }>('/public/config')
      .then(setConfig)
      .catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api<{ token: string; login: string }>('/auth/login', {
        method: 'POST',
        body: { login, password },
      });
      setToken(res.token);
      nav('/', { replace: true });
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Ошибка входа', 'err');
    } finally {
      setBusy(false);
    }
  };

  const fillDemo = () => {
    setLogin('admin');
    setPassword('admin123');
  };

  return (
    <div className="min-h-screen studio-mesh flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-12 rounded-3xl overflow-hidden bg-white border border-rose-100 shadow-[0_20px_60px_rgba(157,23,77,0.12)]">
        {/* Visual Editorial Left Column */}
        <div className="md:col-span-6 relative min-h-[220px] md:min-h-[500px] bg-gradient-to-br from-[#3d1638] to-[#be185d]">
          <img
            src={salonInterior}
            alt={config?.salon_name || 'Nail Studio'}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover md:absolute md:inset-0"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#241322]/90 via-[#241322]/35 to-transparent flex flex-col justify-end p-7 text-white">
            <div className="text-xs font-medium text-rose-200 mb-1">
              CRM-кабинет мастера
            </div>
            <h2 className="font-display text-3xl font-bold leading-tight">
              {config?.salon_name || 'Atelier Velvet Nails'}
            </h2>
            <p className="text-xs text-rose-100/80 mt-2">
              Управляйте расписанием, базой клиентов и финансами в едином пространстве.
            </p>
          </div>
        </div>

        {/* Form Right Column */}
        <div className="md:col-span-6 p-7 sm:p-10 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-6">
            <Link
              to="/book"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 hover:text-rose-900 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Онлайн-запись для клиентов
            </Link>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1 mb-5">
              <h1 className="font-display text-3xl font-bold text-[#241322]">Вход в кабинет</h1>
              <p className="text-xs text-rose-950/60">
                Введите логин и пароль мастера или администратора
              </p>
            </div>

            <Field label="Логин">
              <div className="relative">
                <User className="w-4 h-4 text-rose-900/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  className={`${INPUT_CLS} pl-10`}
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  autoFocus
                  autoComplete="username"
                  placeholder="admin"
                />
              </div>
            </Field>

            <Field label="Пароль">
              <div className="relative">
                <Lock className="w-4 h-4 text-rose-900/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  className={`${INPUT_CLS} pl-10`}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••"
                />
              </div>
            </Field>

            <button
              type="submit"
              disabled={busy || !login || !password}
              className={`${BTN_PRIMARY} w-full mt-2`}
            >
              {busy ? 'Входим…' : 'Войти в CRM'}
            </button>
          </form>

          {config?.demo && (
            <div className="mt-6 pt-5 border-t border-rose-100 flex items-center justify-between gap-3">
              <div className="text-xs text-rose-950/65">
                Демо: <span className="font-mono-num font-semibold text-[#241322]">admin / admin123</span>
              </div>
              <button type="button" onClick={fillDemo} className={`${BTN_SECONDARY} !py-1.5 !px-3 text-xs`}>
                Подставить
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
