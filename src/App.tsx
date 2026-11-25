import React, { useCallback, useEffect, useState } from 'react';
import {
  BrowserRouter,
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useNavigate,
} from 'react-router-dom';
import {
  BarChart3,
  Calendar,
  ExternalLink,
  Grid2x2,
  LogOut,
  Palette,
  Settings,
  Users,
} from 'lucide-react';
import { api, getToken, setToken } from './lib/api';
import { PageLoading, ToastProvider } from './components/UI';
import { SettingsContext, useSettings } from './context/SettingsContext';
import type { SalonSettings } from './lib/utils';
import BookPage from './pages/BookPage';
import LoginPage from './pages/LoginPage';
import CalendarPage from './pages/CalendarPage';
import OverviewPage from './pages/OverviewPage';
import ClientsPage from './pages/ClientsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import ServicesPage from './pages/ServicesPage';
import SettingsPage from './pages/SettingsPage';

const NAV = [
  { to: '/', label: 'Календарь', Icon: Calendar },
  { to: '/overview', label: 'Обзор', Icon: Grid2x2 },
  { to: '/clients', label: 'Клиенты', Icon: Users },
  { to: '/analytics', label: 'Финансы', Icon: BarChart3 },
  { to: '/services', label: 'Услуги', Icon: Palette },
  { to: '/settings', label: 'Настройки', Icon: Settings },
];

function CrmLayout({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();
  const nav = useNavigate();

  const logout = () => {
    setToken(null);
    nav('/login');
  };

  return (
    <div className="h-screen studio-mesh flex overflow-hidden">
      {/* Rich Plum-Berry Sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 sticky top-0 h-screen sidebar-gradient text-rose-50 flex-col p-4 border-r border-fuchsia-950/50">
        <div className="px-2 pt-2 pb-5 border-b border-white/10">
          <div className="font-display text-2xl font-bold leading-tight text-white">
            {settings.salon_name}
          </div>
          <div className="text-xs text-rose-200/70 mt-1">Кабинет мастера</div>
        </div>

        <nav className="flex-1 py-4 space-y-1">
          {NAV.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-gradient-to-r from-rose-500 to-fuchsia-600 text-white shadow-md'
                    : 'text-rose-100/80 hover:text-white hover:bg-white/10'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="space-y-2 pt-3 border-t border-white/10">
          <Link
            to="/book"
            className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-rose-50 transition-colors"
          >
            <span>Онлайн-запись</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-rose-200/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Выйти</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Compact Mobile Top Header */}
        <header className="lg:hidden sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-rose-100 px-4 h-14 flex items-center justify-between gap-4">
          <span className="font-display text-xl font-bold text-[#241322] truncate">
            {settings.salon_name}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              to="/book"
              className="text-xs font-semibold text-rose-700 px-2.5 py-1.5 rounded-lg bg-rose-50 whitespace-nowrap"
            >
              Запись
            </Link>
            <button
              type="button"
              onClick={logout}
              className="p-2 rounded-lg text-rose-900/70 hover:bg-rose-50 cursor-pointer"
              aria-label="Выйти"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-10 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* Compact Mobile Bottom Nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-rose-100 px-1 py-1.5 flex items-center justify-around">
        {NAV.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl text-[10px] font-semibold transition-colors ${
                isActive ? 'text-rose-600 bg-rose-50' : 'text-rose-900/55'
              }`
            }
          >
            <Icon className="w-4 h-4" />
            <span className="truncate max-w-[56px]">{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function PrivateRoutes() {
  const [settings, setSettings] = useState<SalonSettings | null>(null);
  const nav = useNavigate();
  const token = getToken();

  const refresh = useCallback(async () => {
    try {
      const data = await api<SalonSettings>('/settings');
      setSettings(data);
    } catch {
      // Handled by api() 401 redirect
    }
  }, []);

  useEffect(() => {
    if (!token) {
      nav('/login', { replace: true });
      return;
    }
    refresh();
  }, [token, nav, refresh]);

  if (!token) return null;
  if (!settings) {
    return (
      <div className="min-h-screen studio-mesh flex items-center justify-center">
        <PageLoading />
      </div>
    );
  }

  return (
    <SettingsContext.Provider value={{ settings, refresh }}>
      <CrmLayout>
        <Routes>
          <Route path="/" element={<CalendarPage />} />
          <Route path="/overview" element={<OverviewPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/services" element={<ServicesPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </CrmLayout>
    </SettingsContext.Provider>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/book" element={<BookPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/*" element={<PrivateRoutes />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
