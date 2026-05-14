/**
 * Runtime validation for `/api/sidebar/nav` payloads (defence in depth; React text already escapes XSS).
 * Rejects open redirects / protocol tricks / oversized paths before they reach `navigate()`.
 */

const SAFE_REL_PATH = /^\/[A-Za-z0-9/_-]*$/;

export function sanitizeSidebarNavPath(path: unknown): string | null {
  if (typeof path !== 'string') return null;
  const s = path.trim();
  if (s.length < 1 || s.length > 120) return null;
  if (!SAFE_REL_PATH.test(s)) return null;
  const lower = s.toLowerCase();
  if (lower.includes('//') || lower.includes('%2f') || lower.includes('\\')) return null;
  if (lower.startsWith('/javascript:') || lower.startsWith('/data:')) return null;
  return s;
}

export type PublicNavChild = {
  itemId?: string;
  labelKey?: string;
  icon?: string;
  path: string;
};

export type PublicNavItem = {
  itemId?: string;
  labelKey?: string;
  icon?: string;
  path?: string;
  children?: PublicNavChild[];
};

export type PublicNavCategory = {
  section?: string;
  titleKey?: string;
  items?: PublicNavItem[];
};

function sanitizeChild(ch: Record<string, unknown>): PublicNavChild | null {
  const path = sanitizeSidebarNavPath(ch.path);
  if (!path) return null;
  return {
    itemId: typeof ch.itemId === 'string' ? ch.itemId : undefined,
    labelKey: typeof ch.labelKey === 'string' ? ch.labelKey : undefined,
    icon: typeof ch.icon === 'string' ? ch.icon : undefined,
    path
  };
}

function sanitizeItem(it: Record<string, unknown>): PublicNavItem | null {
  const childrenRaw = it.children;
  if (Array.isArray(childrenRaw) && childrenRaw.length > 0) {
    const children: PublicNavChild[] = [];
    for (const c of childrenRaw) {
      if (!c || typeof c !== 'object') continue;
      const sc = sanitizeChild(c as Record<string, unknown>);
      if (sc) children.push(sc);
    }
    if (children.length === 0) return null;
    return {
      itemId: typeof it.itemId === 'string' ? it.itemId : undefined,
      labelKey: typeof it.labelKey === 'string' ? it.labelKey : undefined,
      icon: typeof it.icon === 'string' ? it.icon : undefined,
      children
    };
  }
  const path = sanitizeSidebarNavPath(it.path);
  if (!path) return null;
  return {
    itemId: typeof it.itemId === 'string' ? it.itemId : undefined,
    labelKey: typeof it.labelKey === 'string' ? it.labelKey : undefined,
    icon: typeof it.icon === 'string' ? it.icon : undefined,
    path
  };
}

/**
 * Returns sanitized categories or `null` if the payload is unusable (caller keeps bundled default).
 */
export function parsePublicSidebarNavCategories(raw: unknown): PublicNavCategory[] | null {
  if (!Array.isArray(raw)) return null;
  const out: PublicNavCategory[] = [];
  for (const cat of raw) {
    if (!cat || typeof cat !== 'object') continue;
    const c = cat as Record<string, unknown>;
    const titleKey = typeof c.titleKey === 'string' ? c.titleKey : undefined;
    const section = typeof c.section === 'string' ? c.section : undefined;
    const itemsRaw = c.items;
    if (!Array.isArray(itemsRaw)) continue;
    const items: PublicNavItem[] = [];
    for (const it of itemsRaw) {
      if (!it || typeof it !== 'object') continue;
      const si = sanitizeItem(it as Record<string, unknown>);
      if (si) items.push(si);
    }
    if (items.length === 0) continue;
    out.push({ section, titleKey, items });
  }
  return out.length > 0 ? out : null;
}
