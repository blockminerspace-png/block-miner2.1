import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  Cpu,
  Wallet,
  ShoppingCart,
  LogOut,
  ChevronRight,
  Menu,
  X,
  Bell,
  MessageSquare,
  Settings,
} from 'lucide-react';
import { useAuthStore, api } from '../../store/auth';
import { useGameStore } from '../../store/game';
import BrandLogo from './BrandLogo';
import CommunityShortcuts from './CommunityShortcuts';
import {
  USER_DASHBOARD_NAV_FALLBACK,
  mobileBottomNavItems,
} from '../../app/navigation/sidebarItems';
import {
  mapApiCategoriesToMenu,
  normalizeMiniPassOutOfRewardsGroup,
} from '../utils/sidebarNavMap';
import type { PublicNavCategory } from '../utils/sidebarNavPublicSchema';
import { parsePublicSidebarNavCategories } from '../utils/sidebarNavPublicSchema';
import { pathMatchesNavChild } from '../utils/sidebarPathMatch';
import { prefetchRoute } from '../utils/routePrefetch';

export default function Sidebar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const logout = useAuthStore((state) => state.logout);
  type GameNotification = {
    id: string | number;
    title?: string;
    message?: string;
    isRead?: boolean;
  };
  const notifications = useGameStore((state) => state.notifications) as GameNotification[];
  const markNotificationRead = useGameStore((state) => state.markNotificationRead);
  const toggleChat = useGameStore((state) => state.toggleChat);
  const hasMention = useGameStore((state) => state.hasMention);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  /**
   * User-expanded nav groups when not on a matching child route.
   * A group stays open only if the path matches a child OR this flag is true for that key.
   */
  const [manualOpenGroups, setManualOpenGroups] = useState<Record<string, boolean>>({});
  const [navCategoriesSource, setNavCategoriesSource] = useState<PublicNavCategory[]>(
    () => USER_DASHBOARD_NAV_FALLBACK
  );
  const notifRef = useRef<HTMLDivElement | null>(null);
  const lastNavAtRef = useRef(0);

  const unreadCount = (notifications || []).filter((n) => !n.isRead).length;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/sidebar/nav');
        if (!cancelled && res.data?.ok && Array.isArray(res.data.categories)) {
          const parsed = parsePublicSidebarNavCategories(res.data.categories);
          if (parsed) setNavCategoriesSource(parsed);
        }
      } catch {
        /* keep bundled default */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const categories = useMemo(
    () =>
      mapApiCategoriesToMenu(
        normalizeMiniPassOutOfRewardsGroup(navCategoriesSource),
        t
      ),
    [navCategoriesSource, t]
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target;
      if (
        notifRef.current &&
        target instanceof Node &&
        !notifRef.current.contains(target)
      ) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const mobileBottomIconByPage: Record<string, LucideIcon> = {
    dashboard: LayoutDashboard,
    machines: Cpu,
    shop: ShoppingCart,
    wallet: Wallet,
  };

  const bottomNavItems: { icon: LucideIcon; label: string; path: string }[] = mobileBottomNavItems.map(
    (item) => ({
      icon: mobileBottomIconByPage[item.page] ?? LayoutDashboard,
      label: item.label,
      path: item.path,
    })
  );

  const handleNav = useCallback(
    (path: string) => {
      const now = performance.now();
      if (now - lastNavAtRef.current < 380) return;
      lastNavAtRef.current = now;
      void prefetchRoute(path);
      navigate(path);
      setMobileOpen(false);
    },
    [navigate]
  );

  const menuContent = (
    <>
      <nav className="flex-1 overflow-y-auto px-4 space-y-8 scrollbar-hide py-6">
        {categories.map((category) => (
          <div key={category.title} className="space-y-2">
            <h3 className="text-[9px] font-black text-gray-600 uppercase tracking-[0.3em] px-4 mb-4">
              {category.title}
            </h3>
            <div className="space-y-1">
              {category.items.map((item) => {
                if (item.type === 'group') {
                  const pathOpensGroup = item.children.some((child) =>
                    pathMatchesNavChild(location.pathname, child.path)
                  );
                  const groupOpen = pathOpensGroup || Boolean(manualOpenGroups[item.key]);
                  const isParentActive = pathOpensGroup;
                  const isRewards = item.key === 'rewards_group';
                  const toggleGroup = () => {
                    if (pathOpensGroup) return;
                    setManualOpenGroups((g) => ({ ...g, [item.key]: !Boolean(g[item.key]) }));
                  };

                  const innerButton = (
                    <button
                      type="button"
                      onClick={toggleGroup}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all duration-300 group ${
                        isParentActive
                          ? 'bg-primary/10 text-primary border border-primary/10'
                          : 'text-gray-500 hover:text-white hover:bg-gray-800/40'
                      } ${isRewards ? 'bg-slate-950/95 border border-blue-500/25' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <item.Icon
                          className={`w-4 h-4 transition-colors ${
                            isParentActive ? 'text-primary' : 'group-hover:text-primary'
                          } ${isRewards ? '!text-sky-400' : ''}`}
                        />
                        <span
                          className={`text-xs font-bold uppercase tracking-wide ${
                            isParentActive ? 'text-white' : ''
                          }`}
                        >
                          {item.label}
                        </span>
                      </div>
                      <ChevronRight
                        className={`w-3 h-3 transition-transform ${groupOpen ? 'rotate-90' : ''} ${
                          isParentActive ? 'text-primary' : 'text-gray-600'
                        }`}
                      />
                    </button>
                  );

                  return (
                    <div key={item.key} className="space-y-1">
                      {isRewards ? (
                        <div className="sidebar-rewards-glow p-[1px]">{innerButton}</div>
                      ) : (
                        innerButton
                      )}
                      {groupOpen && (
                        <div className="space-y-1 pl-8">
                          {item.children.map((child) => {
                            const isChildActive = pathMatchesNavChild(location.pathname, child.path);
                            return (
                              <button
                                key={child.path}
                                type="button"
                                onMouseEnter={() => void prefetchRoute(child.path)}
                                onFocus={() => void prefetchRoute(child.path)}
                                onClick={() => handleNav(child.path)}
                                className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all duration-300 group ${
                                  isChildActive
                                    ? 'bg-primary/10 text-primary border border-primary/10'
                                    : 'text-gray-500 hover:text-white hover:bg-gray-800/40'
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <child.Icon
                                    className={`w-4 h-4 transition-colors ${
                                      isChildActive ? 'text-primary' : 'group-hover:text-primary'
                                    }`}
                                  />
                                  <span
                                    className={`text-xs font-bold uppercase tracking-wide ${
                                      isChildActive ? 'text-white' : ''
                                    }`}
                                  >
                                    {child.label}
                                  </span>
                                </div>
                                {isChildActive ? (
                                  <div className="w-1 h-4 bg-primary rounded-full shadow-glow" />
                                ) : (
                                  <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-gray-600" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }

                const isActive = location.pathname === item.path;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onMouseEnter={() => void prefetchRoute(item.path)}
                    onFocus={() => void prefetchRoute(item.path)}
                    onClick={() => handleNav(item.path)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all duration-300 group ${
                      isActive
                        ? 'bg-primary/10 text-primary border border-primary/10'
                        : 'text-gray-500 hover:text-white hover:bg-gray-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <item.Icon
                        className={`w-4 h-4 transition-colors ${
                          isActive ? 'text-primary' : 'group-hover:text-primary'
                        }`}
                      />
                      <span
                        className={`text-xs font-bold uppercase tracking-wide ${
                          isActive ? 'text-white' : ''
                        }`}
                      >
                        {item.label}
                      </span>
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

      <div className="md:hidden px-4 pb-3">
        <button
          type="button"
          onClick={() => {
            navigate('/settings');
            setMobileOpen(false);
          }}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-gray-800/80 bg-gray-900/40 text-gray-300 hover:text-white hover:bg-gray-800/50 transition-all"
        >
          <Settings className="w-4 h-4 text-sky-400 shrink-0" aria-hidden />
          <span className="text-xs font-bold uppercase tracking-wide">{t('sidebar.settings')}</span>
        </button>
      </div>

      <div className="p-4 mt-auto border-t border-gray-800/50">
        <button
          type="button"
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
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-3 h-14 bg-surface border-b border-gray-800/50 shadow-lg">
        <BrandLogo variant="header" />

        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={toggleChat}
            className="p-2 text-gray-400 hover:text-white transition-colors relative"
            aria-label="Chat"
          >
            <MessageSquare className="w-5 h-5" />
            {hasMention && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-amber-400 rounded-full" />
            )}
          </button>

          <CommunityShortcuts gapClass="gap-0" />

          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={() => setNotifOpen((v) => !v)}
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
                      type="button"
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
                    (notifications || []).slice(0, 10).map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => {
                          markNotificationRead(n.id);
                          setNotifOpen(false);
                        }}
                        className={`w-full text-left px-4 py-3 hover:bg-gray-800/30 transition-colors ${
                          !n.isRead ? 'bg-primary/5' : ''
                        }`}
                      >
                        <p
                          className={`text-xs font-bold truncate ${
                            !n.isRead ? 'text-white' : 'text-gray-400'
                          }`}
                        >
                          {n.title}
                        </p>
                        <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="p-2 text-gray-400 hover:text-white transition-colors"
            aria-label="Menu"
          >
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div
          role="presentation"
          className="md:hidden fixed inset-0 z-30 bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`md:hidden fixed top-14 bottom-16 left-0 z-40 w-72 bg-surface border-r border-gray-800/50 flex flex-col shadow-2xl transition-transform duration-300 overflow-y-auto ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {menuContent}
      </aside>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-surface border-t border-gray-800/50 flex items-center justify-around px-1 shadow-2xl">
        {bottomNavItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              type="button"
              onMouseEnter={() => void prefetchRoute(item.path)}
              onFocus={() => void prefetchRoute(item.path)}
              onClick={() => handleNav(item.path)}
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
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex flex-col items-center justify-center gap-1 flex-1 py-2 rounded-xl transition-all text-gray-500 hover:text-white"
        >
          <Menu className="w-5 h-5" />
          <span className="text-[8px] font-black uppercase tracking-widest leading-none">Menu</span>
        </button>
      </nav>

      <aside className="hidden md:flex w-64 bg-surface border-r border-gray-800/50 shrink-0 flex-col h-full shadow-2xl relative z-20">
        <div className="p-8">
          <BrandLogo variant="sidebar" />
        </div>
        {menuContent}
      </aside>
    </>
  );
}
