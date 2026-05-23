import prisma from "../src/db/prisma.js";
import {
  buildDefaultSidebarEntries,
  CATEGORY_TITLE_KEYS,
  coerceInternalOfferwallEarnRoot,
  coerceParentLockedSidebarEntries,
  coerceZeradsHidden,
  mergeMissingSidebarRegistryEntries,
  SIDEBAR_ITEM_REGISTRY,
  SIDEBAR_SECTIONS,
  type SidebarPersistedEntry,
  type SidebarSection,
  validateSidebarEntriesPayload
} from "./sidebarNavRegistry.js";

const SINGLETON_ID = 1;

export function buildResolvedCategories(entries: SidebarPersistedEntry[]) {
  const byId = new Map(entries.map((e) => [e.itemId, e]));

  const isGroupVisible = byId.get("rewards_group")?.visible === true;

  /** @param {string} id */
  function rowVisible(id: string) {
    const e = byId.get(id);
    return Boolean(e?.visible);
  }

  /** @param {{ itemId: string, visible: boolean, parentItemId: string | null, section: string }} entry */
  function isShown(entry: SidebarPersistedEntry) {
    if (!entry.visible) return false;
    if (entry.parentItemId === "rewards_group") return isGroupVisible;
    return true;
  }

  const active = entries.filter(isShown);

  /**
   * @param {'main'|'earn'|'social'} section
   */
  function rowsForSection(section: SidebarSection) {
    const roots = active.filter((e) => e.section === section && e.parentItemId === null);
    roots.sort((a, b) => a.sortOrder - b.sortOrder);
    return roots.map((root) => {
      const def = SIDEBAR_ITEM_REGISTRY[root.itemId];
      if (def?.isGroup) {
        const children = active
          .filter((e) => e.parentItemId === root.itemId)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        return {
          itemId: root.itemId,
          labelKey: def.labelKey,
          icon: def.icon,
          children: children.map((c) => {
            const cdef = SIDEBAR_ITEM_REGISTRY[c.itemId];
            return {
              itemId: c.itemId,
              labelKey: cdef.labelKey,
              icon: cdef.icon,
              path: cdef.path
            };
          })
        };
      }
      return {
        itemId: root.itemId,
        labelKey: def.labelKey,
        icon: def.icon,
        path: def.path
      };
    });
  }

  return SIDEBAR_SECTIONS.map((section) => ({
    section,
    titleKey: CATEGORY_TITLE_KEYS[section],
    items: rowsForSection(section)
  }));
}

async function ensureRow() {
  let row = await prisma.sidebarNavConfig.findUnique({ where: { id: SINGLETON_ID } });
  if (!row) {
    const defaults = buildDefaultSidebarEntries();
    row = await prisma.sidebarNavConfig.create({
      data: { id: SINGLETON_ID, entries: defaults }
    });
  }
  return row;
}

/**
 * @returns {Promise<{ entries: object[], categories: object[] }>}
 */
export async function getSidebarNavForAdmin() {
  const row = await ensureRow();
  const raw = Array.isArray(row.entries) ? row.entries : [];
  const { entries: coerced, changed: lockedChanged } = coerceParentLockedSidebarEntries(raw);
  const { entries: coercedOfferwall, changed: offerwallChanged } = coerceInternalOfferwallEarnRoot(coerced);
  const { entries: coercedZerads, changed: zeradsChanged } = coerceZeradsHidden(coercedOfferwall);
  if (lockedChanged || offerwallChanged || zeradsChanged) {
    await prisma.sidebarNavConfig.update({
      where: { id: SINGLETON_ID },
      data: { entries: coercedZerads }
    });
  }
  const { entries: merged, changed: mergeChanged } =
    mergeMissingSidebarRegistryEntries(coercedZerads);
  if (mergeChanged) {
    await prisma.sidebarNavConfig.update({
      where: { id: SINGLETON_ID },
      data: { entries: merged }
    });
  }
  const parsed = validateSidebarEntriesPayload(merged);
  if (!parsed.ok) {
    const defaults = buildDefaultSidebarEntries();
    await prisma.sidebarNavConfig.update({
      where: { id: SINGLETON_ID },
      data: { entries: defaults }
    });
    return { entries: defaults, categories: buildResolvedCategories(defaults) };
  }
  return {
    entries: parsed.entries,
    categories: buildResolvedCategories(parsed.entries)
  };
}

/**
 * @returns {Promise<object[]>}
 */
export async function getSidebarNavCategoriesPublic() {
  const { categories } = await getSidebarNavForAdmin();
  return categories;
}

/**
 * @param {unknown} bodyEntries
 * @returns {Promise<{ ok: true, entries: object[], categories: object[] } | { ok: false, code: string }>}
 */
export async function saveSidebarNavEntries(bodyEntries) {
  const raw = Array.isArray(bodyEntries) ? bodyEntries : [];
  const { entries: afterLocked } = coerceParentLockedSidebarEntries(raw);
  const { entries: afterOfferwall } = coerceInternalOfferwallEarnRoot(afterLocked);
  const { entries: coerced } = coerceZeradsHidden(afterOfferwall);
  const v = validateSidebarEntriesPayload(coerced);
  if (!v.ok) return { ok: false, code: v.code };
  await ensureRow();
  await prisma.sidebarNavConfig.update({
    where: { id: SINGLETON_ID },
    data: { entries: v.entries }
  });
  return { ok: true, entries: v.entries, categories: buildResolvedCategories(v.entries) };
}

/**
 * Normalize app paths for comparison (matches client router paths).
 * @param {string} path
 */
export function normalizeSidebarPath(path) {
  if (typeof path !== "string" || !path.startsWith("/")) return "";
  const base = path.split("?")[0];
  if (base.length > 1 && base.endsWith("/")) return base.slice(0, -1);
  return base;
}

/**
 * Collect visible user-app paths from resolved sidebar categories (public nav payload).
 * @param {unknown} categories
 * @returns {Set<string>}
 */
export function collectVisiblePathsFromCategories(categories) {
  const paths = new Set();
  if (!Array.isArray(categories)) return paths;
  for (const cat of categories) {
    for (const item of cat.items || []) {
      if (typeof item.path === "string") {
        const n = normalizeSidebarPath(item.path);
        if (n) paths.add(n);
      }
      for (const child of item.children || []) {
        if (typeof child.path === "string") {
          const n = normalizeSidebarPath(child.path);
          if (n) paths.add(n);
        }
      }
    }
  }
  return paths;
}

/**
 * @returns {Promise<Set<string>>}
 */
export async function getVisibleSidebarPaths() {
  const categories = await getSidebarNavCategoriesPublic();
  return collectVisiblePathsFromCategories(categories);
}

/**
 * @param {string} path
 * @returns {Promise<boolean>}
 */
export async function isSidebarPathVisible(path) {
  const normalized = normalizeSidebarPath(path);
  if (!normalized) return false;
  const paths = await getVisibleSidebarPaths();
  return paths.has(normalized);
}
