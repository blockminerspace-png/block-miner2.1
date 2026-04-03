import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  ShoppingCart,
  Cpu,
  Wallet,
  LogOut,
  Gift,
  Link as LinkIcon,
  Calendar,
  Youtube,
  Trophy,
  Gamepad2,
  ChevronRight,
  Zap,
  Tag,
  Menu,
  X,
  Bell,
  MessageSquare,
  Building2,
} from 'lucide-react';
import { useAuthStore } from '../store/auth';
import { useGameStore } from '../store/game';
import BrandLogo from './BrandLogo';

export default function Sidebar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user } = useAuthStore();
  const { notifications, markNotificationRead, toggleChat, hasMention } = useGameStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef(null);

  const unreadCount = (notifications || []).filter(n => !n.isRead).length;

  useEffect(() => {
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const categories = [
    {
      title: t('sidebar.categories.main', 'Principal'),
      items: [
        { icon: LayoutDashboard, label: t('sidebar.dashboard'), path: '/dashboard' },
        { icon: Cpu, label: t('sidebar.machines'), path: '/inventory' },
        { icon: ShoppingCart, label: t('sidebar.shop'), path: '/shop' },
        { icon: Tag, label: t('sidebar.offers', 'Ofertas'), path: '/offers' },
        { icon: Building2, label: t('sidebar.farm', 'Minha Fazenda'), path: '/farm' },
        { icon: Wallet, label: t('sidebar.wallet'), path: '/wallet' },
      ]
    },
    {
      title: t('sidebar.categories.earn', 'Ganhar'),
      items: [
        { icon: Calendar, label: t('sidebar.checkin', 'Check-in'), path: '/checkin' },
        { icon: Gift, label: t('sidebar.faucet'), path: '/faucet' },
        { icon: LinkIcon, label: t('sidebar.shortlinks'), path: '/shortlinks' },
        { icon: Zap, label: t('sidebar.auto_mining', 'Auto Mining'), path: '/auto-mining' },
        { icon: Youtube, label: t('sidebar.youtube', 'YouTube'), path: '/youtube' },
      ]
    },
    {
      title: t('sidebar.categories.social', 'Social & Fun'),
      items: [
        { icon: Gamepad2, label: t('sidebar.games', 'Jogos'), path: '/games' },
        { icon: Trophy, label: t('sidebar.ranking', 'Ranking'), path: '/ranking' },
      ]
    }
  ];

  const bottomNavItems = [
    { icon: LayoutDashboard, label: 'Início', path: '/dashboard' },
    { icon: Cpu, label: 'Máquinas', path: '/inventory' },
    { icon: ShoppingCart, label: 'Loja', path: '/shop' },
    { icon: Wallet, label: 'Carteira', path: '/wallet' },
  ];

  const handleNav = (path) => {
    navigate(path);
    setMobileOpen(false);
  };

  const menuContent = (
    <>
      <nav className="flex-1 overflow-y-auto px-4 space-y-8 scrollbar-hide py-6">
        {categories.map((category) => (
          <div key={category.title} className="space-y-2">
            <h3 className="text-[9px] font-black text-gray-600 uppercase tracking-[0.3em] px-4 mb-4">{category.title}</h3>
            <div className="space-y-1">
              {category.items.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <button
                    key={item.path}
                    onClick={() => handleNav(item.path)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all duration-300 group ${isActive
                      ? 'bg-primary/10 text-primary border border-primary/10'
                      : 'text-gray-500 hover:text-white hover:bg-gray-800/40'
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <item.icon className={`w-4 h-4 transition-colors ${isActive ? 'text-primary' : 'group-hover:text-primary'}`} />
                      <span className={`text-xs font-bold uppercase tracking-wide ${isActive ? 'text-white' : ''}`}>{item.label}</span>
                    </div>
                    {isActive ? (
                        <div className="w-1 h-4 bg-primary rounded-full shadow-glow" />
                    ) : (
                        <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-gray-600" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Logout */}
      <div className="p-4 mt-auto border-t border-gray-800/50">
        <button
          onClick={() => logout()}
          className="w-full flex items-center gap-3 px-4 py-4 text-gray-500 hover:text-red-400 hover:bg-red-400/5 rounded-2xl transition-all duration-300 group"
        >
          <LogOut className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span className="font-bold text-xs uppercase tracking-widest">{t('common.logout')}</span>
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* ── Mobile top bar ── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-3 h-14 bg-surface border-b border-gray-800/50 shadow-lg">
        <BrandLogo variant="header" />

        <div className="flex items-center gap-0.5">
          {/* Chat */}
          <button
            onClick={toggleChat}
            className="p-2 text-gray-400 hover:text-white transition-colors relative"
            aria-label="Chat"
          >
            <MessageSquare className="w-5 h-5" />
            {hasMention && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-amber-400 rounded-full" />
            )}
          </button>

          {/* Notifications */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setNotifOpen(v => !v)}
              className="p-2 text-gray-400 hover:text-white transition-colors relative"
              aria-label="Notificações"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-pulse border border-surface" />
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-surface border border-gray-800 rounded-2xl shadow-2xl overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between bg-gray-900/50">
                  <h3 className="text-xs font-black text-white uppercase tracking-widest">Notificações</h3>
                  {unreadCount > 0 && (
                    <button
                      onClick={() => markNotificationRead('all')}
                      className="text-[10px] font-bold text-primary hover:text-primary-hover uppercase tracking-tighter"
                    >
                      Ler todas
                    </button>
                  )}
                </div>
                <div className="max-h-72 overflow-y-auto scrollbar-hide divide-y divide-gray-800/30">
                  {(notifications || []).length === 0 ? (
                    <p className="py-8 text-center text-[10px] text-gray-600 font-bold uppercase tracking-widest italic">
                      Nenhuma notificação
                    </p>
                  ) : (
                    (notifications || []).slice(0, 10).map(n => (
                      <button
                        key={n.id}
                        onClick={() => { markNotificationRead(n.id); setNotifOpen(false); }}
                        className={`w-full text-left px-4 py-3 hover:bg-gray-800/30 transition-colors ${!n.isRead ? 'bg-primary/5' : ''}`}
                      >
                        <p className={`text-xs font-bold truncate ${!n.isRead ? 'text-white' : 'text-gray-400'}`}>{n.title}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User avatar → settings */}
          <button
            onClick={() => { navigate('/settings'); setMobileOpen(false); }}
            className="w-8 h-8 rounded-xl bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center text-white font-black border border-gray-700 text-xs mx-1 ring-1 ring-primary/20"
            aria-label="Configurações"
          >
            {user?.name?.charAt(0)?.toUpperCase() || '?'}
          </button>

          {/* Hamburger */}
          <button
            onClick={() => setMobileOpen(v => !v)}
            className="p-2 text-gray-400 hover:text-white transition-colors"
            aria-label="Menu"
          >
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Drawer overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-30 bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer — fica entre top bar e bottom nav */}
      <aside
        className={`md:hidden fixed top-14 bottom-16 left-0 z-40 w-72 bg-surface border-r border-gray-800/50 flex flex-col shadow-2xl transition-transform duration-300 overflow-y-auto ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {menuContent}
      </aside>

      {/* ── Bottom navigation bar ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-surface border-t border-gray-800/50 flex items-center justify-around px-1 shadow-2xl">
        {bottomNavItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex flex-col items-center justify-center gap-1 flex-1 py-2 rounded-xl transition-all duration-300 ${
                isActive ? 'text-primary' : 'text-gray-500 hover:text-white'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[8px] font-black uppercase tracking-widest leading-none">{item.label}</span>
            </button>
          );
        })}
        <button
          onClick={() => setMobileOpen(true)}
          className="flex flex-col items-center justify-center gap-1 flex-1 py-2 rounded-xl transition-all text-gray-500 hover:text-white"
        >
          <Menu className="w-5 h-5" />
          <span className="text-[8px] font-black uppercase tracking-widest leading-none">Menu</span>
        </button>
      </nav>

      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex w-64 bg-surface border-r border-gray-800/50 shrink-0 flex-col h-full shadow-2xl relative z-20">
        <div className="p-8">
          <BrandLogo variant="sidebar" />
        </div>
        {menuContent}
      </aside>
    </>
  );
}
