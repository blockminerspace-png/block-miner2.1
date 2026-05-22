import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  ShoppingCart,
  Cpu,
  Package,
  Wallet,
  Gift,
  Link as LinkIcon,
  Calendar,
  Youtube,
  Trophy,
  Gamepad2,
  Zap,
  Tag,
  Folder,
  Map,
  Calculator,
  Eye,
  BookOpen,
  BarChart3,
  LifeBuoy,
  Sparkles,
  ListChecks,
  LayoutGrid,
  Crosshair
} from 'lucide-react';
import type { PublicNavCategory, PublicNavItem } from './sidebarNavPublicSchema';

/** Lucide name → component (user sidebar API returns `icon` string). */
export const SIDEBAR_ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard,
  ShoppingCart,
  Cpu,
  Package,
  Wallet,
  Gift,
  Link: LinkIcon,
  Calendar,
  Youtube,
  Trophy,
  Gamepad2,
  Zap,
  Tag,
  Folder,
  Map,
  Calculator,
  Eye,
  BookOpen,
  BarChart3,
  LifeBuoy,
  Sparkles,
  ListChecks,
  LayoutGrid,
  Crosshair
};

export function resolveSidebarIcon(iconName: unknown): LucideIcon {
  if (typeof iconName !== 'string') return LayoutDashboard;
  return SIDEBAR_ICON_MAP[iconName] || LayoutDashboard;
}

const MINI_PASS_PATH = '/mini-pass';
const DAILY_TASKS_PATH = '/tasks';

export function normalizeMiniPassOutOfRewardsGroup(categories: unknown): PublicNavCategory[] {
  if (!Array.isArray(categories)) return [];
  return categories.map((cat) => {
    if (!cat || typeof cat !== 'object') return cat as PublicNavCategory;
    const c = cat as PublicNavCategory & { section?: string; titleKey?: string };
    const isEarn = c.section === 'earn' || c.titleKey === 'sidebar.categories.earn';
    if (!isEarn) return c;

    const items = Array.isArray(c.items) ? [...c.items] : [];
    const pulled: Array<{ order: number; entry: PublicNavItem }> = [];

    const cleaned = items.map((item) => {
      if (!item?.children?.length) return item;
      const kept: NonNullable<PublicNavItem['children']> = [];
      for (const ch of item.children!) {
        if (
          ch?.itemId === 'mini_pass' ||
          ch?.path === MINI_PASS_PATH ||
          ch?.labelKey === 'sidebar.mini_pass'
        ) {
          pulled.push({
            order: 0,
            entry: {
              itemId: 'mini_pass',
              labelKey: ch.labelKey || 'sidebar.mini_pass',
              icon: ch.icon || 'Trophy',
              path: ch.path || MINI_PASS_PATH
            }
          });
        } else if (
          ch?.itemId === 'daily_tasks' ||
          ch?.path === DAILY_TASKS_PATH ||
          ch?.labelKey === 'sidebar.daily_tasks'
        ) {
          pulled.push({
            order: 1,
            entry: {
              itemId: 'daily_tasks',
              labelKey: ch.labelKey || 'sidebar.daily_tasks',
              icon: ch.icon || 'ListChecks',
              path: ch.path || DAILY_TASKS_PATH
            }
          });
        } else {
          kept.push(ch);
        }
      }
      return { ...item, children: kept };
    });

    pulled.sort((a, b) => a.order - b.order);

    const checkIx = cleaned.findIndex((i) => i?.itemId === 'checkin');
    const rewardsIx = cleaned.findIndex(
      (i) => i?.itemId === 'rewards_group' || (Boolean(i?.children?.length) && !i?.path)
    );
    let insertAt = 0;
    if (checkIx >= 0) insertAt = checkIx + 1;
    else if (rewardsIx >= 0) insertAt = rewardsIx;

    for (const { entry } of pulled) {
      const hasTop = cleaned.some(
        (i) =>
          !i?.children?.length &&
          (i?.itemId === entry.itemId || i?.path === entry.path)
      );
      if (!hasTop) {
        cleaned.splice(insertAt, 0, entry);
        insertAt += 1;
      }
    }

    return { ...c, items: cleaned };
  });
}

export type SidebarMenuChild = {
  key: string;
  Icon: LucideIcon;
  label: string;
  path: string;
};

export type SidebarMenuGroup = {
  type: 'group';
  key: string;
  Icon: LucideIcon;
  label: string;
  children: SidebarMenuChild[];
};

export type SidebarMenuLink = {
  type: 'link';
  key: string;
  Icon: LucideIcon;
  label: string;
  path: string;
};

export type SidebarMenuItem = SidebarMenuGroup | SidebarMenuLink;

export type SidebarMenuCategory = {
  title: string;
  items: SidebarMenuItem[];
};

function mapChildItem(
  item: NonNullable<PublicNavItem['children']>[number],
  t: (key: string) => string
): SidebarMenuChild {
  const Icon = resolveSidebarIcon(item.icon);
  return {
    key: item.itemId || item.path,
    Icon,
    label: t(item.labelKey || ''),
    path: item.path
  };
}

export function mapNavItem(item: PublicNavItem, t: (key: string) => string): SidebarMenuItem {
  const Icon = resolveSidebarIcon(item.icon);
  if (Array.isArray(item.children) && item.children.length > 0) {
    return {
      type: 'group',
      key: item.itemId || item.labelKey || 'group',
      Icon,
      label: t(item.labelKey || ''),
      children: item.children.map((ch) => mapChildItem(ch, t))
    };
  }
  return {
    type: 'link',
    key: item.itemId || item.path || 'link',
    Icon,
    label: t(item.labelKey || ''),
    path: item.path || '/'
  };
}

export function mapApiCategoriesToMenu(apiCategories: unknown, t: (key: string) => string): SidebarMenuCategory[] {
  if (!Array.isArray(apiCategories)) return [];
  return apiCategories.map((cat) => {
    const c = cat as PublicNavCategory;
    return {
      title: t(c.titleKey || ''),
      items: (c.items || []).map((item) => mapNavItem(item, t))
    };
  });
}
