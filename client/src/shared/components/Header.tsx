import { useState, useEffect, useRef, useMemo, type ReactNode } from 'react';
import {
  Bell,
  Search,
  Settings,
  MessageSquare,
  Check,
  Info,
  AlertTriangle,
  TrendingUp,
  Inbox,
  Clock,
  CheckCircle2,
  PauseCircle,
} from 'lucide-react';
import { useLocation, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../../store/game';
import { useAuthStore } from '../../store/auth';
import CommunityShortcuts from './CommunityShortcuts';
import { usePtcSessionStore } from '../../store/ptcSession';
import { useOfferwallTimerStore } from '../../store/offerwallTimer';

function fmtPtcTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function PtcGlobalTimer() {
  const session = usePtcSessionStore((s) => s.session);
  const status = usePtcSessionStore((s) => s.status);
  const accumulatedMs = usePtcSessionStore((s) => s.accumulatedMs);
  const isViewing = usePtcSessionStore((s) => s.isViewing);
  const [tick, setTick] = useState(0);

  const viewingStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (isViewing) {
      if (viewingStartRef.current == null) viewingStartRef.current = Date.now();
    } else {
      viewingStartRef.current = null;
    }
  }, [isViewing]);

  useEffect(() => {
    if (status !== 'viewing') return;
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [status]);

  const elapsed = useMemo(() => {
    if (!session || !['viewing', 'paused', 'completed', 'opening'].includes(status)) return 0;
    if (status === 'completed') return session.requiredSeconds;
    const liveMs = isViewing && viewingStartRef.current != null ? Date.now() - viewingStartRef.current : 0;
    return Math.min((accumulatedMs + liveMs) / 1000, session.requiredSeconds);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, status, accumulatedMs, isViewing, tick]);

  if (!session || status === 'idle' || status === 'claimed') return null;

  const requiredSeconds = session.requiredSeconds;
  const pct = Math.min(100, (elapsed / requiredSeconds) * 100);

  if (status === 'cancelled') {
    return (
      <Link
        to="/ptc"
        className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-black uppercase tracking-widest hover:bg-red-500/20 transition-colors"
      >
        <AlertTriangle className="w-3.5 h-3.5" />
        PTC Cancelado
      </Link>
    );
  }

  if (status === 'completed') {
    return (
      <Link
        to="/ptc"
        className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-colors animate-pulse"
      >
        <CheckCircle2 className="w-3.5 h-3.5" />
        PTC Pronto — Resgatar
      </Link>
    );
  }

  const isPaused = status === 'paused' || status === 'opening' || (status === 'viewing' && !isViewing);

  return (
    <Link
      to="/ptc"
      className={`hidden lg:flex items-center gap-2.5 px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-colors ${
        isPaused
          ? 'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20'
          : 'bg-sky-500/10 border-sky-500/20 text-sky-400 hover:bg-sky-500/20'
      }`}
    >
      {isPaused ? <PauseCircle className="w-3.5 h-3.5 shrink-0" /> : <Clock className="w-3.5 h-3.5 shrink-0 animate-pulse" />}
      <span className="tabular-nums">{fmtPtcTime(elapsed)} / {fmtPtcTime(requiredSeconds)}</span>
      <div className="w-12 h-1 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${isPaused ? 'bg-amber-400' : 'bg-sky-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </Link>
  );
}

interface HeaderNotification {
  id: string | number;
  isRead?: boolean;
  type?: string;
  title?: string;
  message?: string;
  createdAt?: string | number | Date;
}

function OfferwallGlobalTimer() {
  const isActive = useOfferwallTimerStore((s) => s.isActive);
  const elapsed = useOfferwallTimerStore((s) => s.elapsed);
  const minSec = useOfferwallTimerStore((s) => s.minSec);
  const isPaused = useOfferwallTimerStore((s) => s.isPaused);
  const canSubmit = useOfferwallTimerStore((s) => s.canSubmit);

  if (!isActive) return null;

  const pct = minSec > 0 ? Math.min(100, (elapsed / minSec) * 100) : 0;

  if (canSubmit) {
    return (
      <Link
        to="/internal-offerwall"
        className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-colors animate-pulse"
      >
        <CheckCircle2 className="w-3.5 h-3.5" />
        Offerwall — Concluído
      </Link>
    );
  }

  return (
    <Link
      to="/internal-offerwall"
      className={`hidden lg:flex items-center gap-2.5 px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-colors ${
        isPaused
          ? 'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20'
          : 'bg-purple-500/10 border-purple-500/20 text-purple-400 hover:bg-purple-500/20'
      }`}
    >
      {isPaused
        ? <PauseCircle className="w-3.5 h-3.5 shrink-0" />
        : <Clock className="w-3.5 h-3.5 shrink-0 animate-pulse" />}
      <span className="tabular-nums">{fmtPtcTime(elapsed)} / {fmtPtcTime(minSec)}</span>
      <div className="w-12 h-1 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${isPaused ? 'bg-amber-400' : 'bg-purple-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </Link>
  );
}

export default function Header() {
  const { t } = useTranslation();
  const location = useLocation();
  const toggleChat = useGameStore((state) => state.toggleChat);
  const notifications = useGameStore((state) => state.notifications) as HeaderNotification[];
  const markNotificationRead = useGameStore((state) => state.markNotificationRead);
  const fetchNotifications = useGameStore((state) => state.fetchNotifications);
  const user = useAuthStore((state) => state.user);

  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const notificationRef = useRef<HTMLDivElement | null>(null);

  const getPageTitle = (): string => {
    const segments = location.pathname.split('/').filter(Boolean);
    if (segments.length === 0) return t('pages.overview');

    const key = `pages.${segments[0].replace('-', '_')}`;
    const translated = t(key);

    if (translated !== key) return translated;
    return t('pages.overview');
  };

  const title = getPageTitle();
  const unreadCount = (notifications || []).filter((n) => !n.isRead).length;

  useEffect(() => {
    void fetchNotifications();
    const handleClickOutside = (event: globalThis.MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (notificationRef.current && !notificationRef.current.contains(target)) {
        setIsNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [fetchNotifications]);

  const handleMarkAllRead = () => {
    markNotificationRead('all');
  };

  const getNotificationIcon = (type: string | undefined): ReactNode => {
    switch (type) {
      case 'success':
        return <Check className="w-4 h-4 text-emerald-400" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-amber-400" />;
      case 'reward':
        return <TrendingUp className="w-4 h-4 text-primary" />;
      default:
        return <Info className="w-4 h-4 text-blue-400" />;
    }
  };

  const displayUser =
    (typeof user?.username === 'string' && user.username) ||
    (typeof user?.name === 'string' && user.name) ||
    '';
  const initial =
    typeof user?.name === 'string' && user.name.length > 0
      ? user.name.charAt(0).toUpperCase()
      : typeof user?.username === 'string' && user.username.length > 0
        ? user.username.charAt(0).toUpperCase()
        : '?';

  return (
    <header className="hidden md:flex h-20 bg-background/80 backdrop-blur-md border-b border-gray-800/50 items-center px-8 sticky top-0 z-30">
      <div className="flex flex-col">
        <h1 className="text-xl font-bold text-white tracking-tight">{title}</h1>
        <p className="text-[11px] text-gray-500 font-medium">Protocolo de mineração ativo.</p>
      </div>

      <div className="ml-auto flex items-center gap-6">
        <OfferwallGlobalTimer />
        <PtcGlobalTimer />

        <div className="relative hidden lg:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Buscar no sistema..."
            className="bg-gray-800/30 border border-gray-800/50 rounded-xl py-2 pl-10 pr-4 text-sm text-gray-300 focus:outline-none focus:border-primary/50 transition-colors w-64"
          />
        </div>

        <div className="flex items-center gap-3 border-l border-gray-800/50 pl-6">
          <button
            type="button"
            onClick={toggleChat}
            className="p-2.5 text-gray-400 hover:text-white hover:bg-gray-800/50 rounded-xl transition-all relative group"
            title="Comunidade"
          >
            <MessageSquare className="w-5 h-5" />
          </button>

          <CommunityShortcuts gapClass="gap-0.5" />

          <div className="relative" ref={notificationRef}>
            <button
              type="button"
              onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
              className={`p-2.5 rounded-xl transition-all relative group ${isNotificationsOpen ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'}`}
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-2.5 right-2.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-background animate-pulse" />
              )}
            </button>

            {isNotificationsOpen && (
              <div className="absolute right-0 mt-3 w-80 bg-surface border border-gray-800 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 z-50">
                <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between bg-gray-900/50">
                  <h3 className="text-xs font-black text-white uppercase tracking-widest">Notificações</h3>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllRead}
                      className="text-[10px] font-bold text-primary hover:text-primary-hover transition-colors uppercase tracking-tighter"
                    >
                      Ler todas
                    </button>
                  )}
                </div>

                <div className="max-h-[400px] overflow-y-auto scrollbar-hide">
                  {(notifications || []).length === 0 ? (
                    <div className="py-12 flex flex-col items-center justify-center text-gray-600 space-y-3">
                      <Inbox className="w-10 h-10 opacity-20" />
                      <p className="text-[10px] font-bold uppercase tracking-widest italic">Nenhum alerta pendente</p>
                    </div>
                  ) : (
                    (notifications || []).map((n: HeaderNotification) => (
                      <div
                        key={String(n.id)}
                        className={`px-6 py-4 border-b border-gray-800/30 hover:bg-gray-800/30 transition-colors relative group ${!n.isRead ? 'bg-primary/5' : ''}`}
                        onClick={() => markNotificationRead(n.id)}
                      >
                        <div className="flex gap-4">
                          <div
                            className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center bg-gray-900 border border-gray-800`}
                          >
                            {getNotificationIcon(n.type)}
                          </div>
                          <div className="space-y-1 min-w-0">
                            <p
                              className={`text-xs font-bold leading-tight truncate ${!n.isRead ? 'text-white' : 'text-gray-400'}`}
                            >
                              {n.title}
                            </p>
                            <p className="text-[11px] text-gray-500 leading-normal line-clamp-2">{n.message}</p>
                            <p className="text-[9px] text-gray-600 font-medium">
                              {new Date(n.createdAt ?? 0).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                          </div>
                        </div>
                        {!n.isRead && (
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-primary rounded-full" />
                        )}
                      </div>
                    ))
                  )}
                </div>

                <div className="px-6 py-3 bg-gray-900/30 text-center">
                  <span className="text-[9px] font-black text-gray-600 uppercase tracking-[0.2em]">
                    Block Miner Intelligence
                  </span>
                </div>
              </div>
            )}
          </div>

          <Link
            to="/settings"
            className="p-2.5 text-gray-400 hover:text-white hover:bg-gray-800/50 rounded-xl transition-all"
            title="Configurações"
          >
            <Settings className="w-5 h-5" />
          </Link>

          <div className="flex items-center gap-3 pl-3 ml-2 border-l border-gray-800/50">
            <div className="flex flex-col items-end hidden sm:flex">
              <span className="text-sm font-black text-white leading-none tracking-tighter uppercase italic">
                {displayUser}
              </span>
              <span className="text-[9px] font-bold text-primary uppercase tracking-[0.2em] mt-1">Nível 1</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center text-white font-black border border-gray-700 shadow-xl overflow-hidden ring-2 ring-primary/20">
              {initial}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
