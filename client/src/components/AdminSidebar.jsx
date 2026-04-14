import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  Users,
  Cpu,
  Wallet,
  Database,
  FileText,
  Activity,
  LogOut,
  ShieldAlert,
  Tag,
  MessageSquare,
  Ticket,
  Megaphone,
  Youtube,
  Eye,
  TrendingUp,
  Bell,
  CalendarRange,
  BookOpen,
  Layers,
  PanelLeft,
  ListChecks,
  LayoutGrid,
  Video,
} from 'lucide-react';

/** Admin routes: icons and paths are fixed; labels use `adminSidebar.nav.*` keys. */
const ADMIN_MENU_ITEMS = [
  { icon: LayoutDashboard, labelKey: 'adminSidebar.nav.overview', path: '/admin/dashboard' },
  { icon: Users, labelKey: 'adminSidebar.nav.users', path: '/admin/users' },
  { icon: Cpu, labelKey: 'adminSidebar.nav.miners', path: '/admin/miners' },
  { icon: Tag, labelKey: 'adminSidebar.nav.offers', path: '/admin/offer-events' },
  { icon: Layers, labelKey: 'adminSidebar.nav.mini_pass', path: '/admin/mini-pass' },
  { icon: Wallet, labelKey: 'adminSidebar.nav.finance', path: '/admin/finance' },
  { icon: PanelLeft, labelKey: 'adminSidebar.nav.user_app_sidebar', path: '/admin/user-sidebar' },
  { icon: MessageSquare, labelKey: 'adminSidebar.nav.support', path: '/admin/support' },
  { icon: Megaphone, labelKey: 'adminSidebar.nav.banners', path: '/admin/banners' },
  {
    icon: CalendarRange,
    labelKey: 'adminSidebar.nav.checkin_milestones',
    path: '/admin/checkin-milestones',
  },
  { icon: ListChecks, labelKey: 'adminSidebar.nav.daily_tasks', path: '/admin/daily-tasks' },
  { icon: BookOpen, labelKey: 'adminSidebar.nav.read_earn', path: '/admin/read-earn' },
  { icon: LayoutGrid, labelKey: 'adminSidebar.nav.internal_offerwall', path: '/admin/internal-offerwall' },
  { icon: Video, labelKey: 'adminSidebar.nav.live_streaming', path: '/admin/streaming' },
  { icon: Youtube, labelKey: 'adminSidebar.nav.creators', path: '/admin/creators' },
  { icon: Eye, labelKey: 'adminSidebar.nav.transparency', path: '/admin/transparency' },
  { icon: Ticket, labelKey: 'adminSidebar.nav.deposit_tickets', path: '/admin/deposit-tickets' },
  { icon: Database, labelKey: 'adminSidebar.nav.backups', path: '/admin/backups' },
  { icon: FileText, labelKey: 'adminSidebar.nav.logs', path: '/admin/logs' },
  { icon: Activity, labelKey: 'adminSidebar.nav.metrics', path: '/admin/metrics' },
  { icon: TrendingUp, labelKey: 'adminSidebar.nav.analytics', path: '/admin/analytics' },
  { icon: Bell, labelKey: 'adminSidebar.nav.broadcast', path: '/admin/broadcast' },
];

export default function AdminSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  const handleLogout = () => {
    // Clear admin session token here when wired to auth storage.
    navigate('/admin/login');
  };

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 p-6 shrink-0 flex flex-col self-stretch min-h-0 max-h-[100dvh] h-[100dvh] shadow-2xl relative z-20 overflow-hidden">
      <div className="flex items-center gap-3 mb-6 px-2 shrink-0">
        <div className="w-10 h-10 bg-gradient-to-tr from-amber-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/20">
          <ShieldAlert className="text-white w-6 h-6" aria-hidden />
        </div>
        <span className="font-black text-xl tracking-tighter text-white uppercase">
          {t('adminSidebar.brand_admin', 'Admin')}
          <span className="text-amber-500">{t('adminSidebar.brand_panel', 'Panel')}</span>
        </span>
      </div>

      <nav
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain scroll-smooth space-y-1 pr-1 py-0.5 [scrollbar-gutter:stable]"
        aria-label={t('adminSidebar.aria_main_nav', 'Main navigation')}
      >
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-2 mb-4 shrink-0">
          {t('adminSidebar.section_management', 'System management')}
        </p>
        {ADMIN_MENU_ITEMS.map((item) => {
          const isActive =
            location.pathname === item.path ||
            (item.path !== '/admin/dashboard' && location.pathname.startsWith(item.path + '/'));
          const label = t(item.labelKey);
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group ${
                isActive
                  ? 'bg-amber-500/10 text-amber-500 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <item.icon
                className={`w-5 h-5 shrink-0 transition-colors ${isActive ? 'text-amber-500' : 'group-hover:text-white'}`}
                aria-hidden
              />
              <span className="font-semibold text-sm text-left">{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="shrink-0 pt-6 border-t border-slate-800">
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-red-400 hover:bg-red-400/5 rounded-xl transition-all duration-300 group"
        >
          <LogOut className="w-5 h-5 shrink-0 group-hover:rotate-12 transition-transform" aria-hidden />
          <span className="font-bold text-xs uppercase tracking-widest">
            {t('adminSidebar.logout', 'Sign out')}
          </span>
        </button>
      </div>
    </aside>
  );
}
