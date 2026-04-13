/**
 * Canonical registry for user app sidebar items. DB stores visibility/order/parent only;
 * paths and label keys always come from here (no arbitrary URLs from clients).
 */

/** @typedef {'main'|'earn'|'social'} SidebarSection */

/**
 * @typedef {object} RegistryItemDef
 * @property {string | null} path
 * @property {string} labelKey — i18n key under client locales
 * @property {string} icon — Lucide export name (client maps string → component)
 * @property {SidebarSection} section
 * @property {string | null} defaultParentItemId — null or "rewards_group"
 * @property {boolean} [isGroup] — collapsible folder (no path)
 * @property {boolean} [parentLocked] — if true, admin cannot change parent (e.g. check-in, mini pass)
 */

/** @type {Record<string, RegistryItemDef>} */
export const SIDEBAR_ITEM_REGISTRY = {
  dashboard: {
    path: "/dashboard",
    labelKey: "sidebar.dashboard",
    icon: "LayoutDashboard",
    section: "main",
    defaultParentItemId: null
  },
  power_stats: {
    path: "/power-stats",
    labelKey: "sidebar.power_stats",
    icon: "BarChart3",
    section: "main",
    defaultParentItemId: null
  },
  machines: {
    path: "/inventory",
    labelKey: "sidebar.machines",
    icon: "Cpu",
    section: "main",
    defaultParentItemId: null
  },
  shop: {
    path: "/shop",
    labelKey: "sidebar.shop",
    icon: "ShoppingCart",
    section: "main",
    defaultParentItemId: null
  },
  offers: {
    path: "/offers",
    labelKey: "sidebar.offers",
    icon: "Tag",
    section: "main",
    defaultParentItemId: null
  },
  wallet: {
    path: "/wallet",
    labelKey: "sidebar.wallet",
    icon: "Wallet",
    section: "main",
    defaultParentItemId: null
  },
  support: {
    path: "/support",
    labelKey: "sidebar.support",
    icon: "LifeBuoy",
    section: "main",
    defaultParentItemId: null
  },

  checkin: {
    path: "/checkin",
    labelKey: "sidebar.checkin",
    icon: "Calendar",
    section: "earn",
    defaultParentItemId: null,
    parentLocked: true
  },
  mini_pass: {
    path: "/mini-pass",
    labelKey: "sidebar.mini_pass",
    icon: "Trophy",
    section: "earn",
    defaultParentItemId: null,
    parentLocked: true
  },
  rewards_group: {
    path: null,
    labelKey: "sidebar.rewards",
    icon: "Folder",
    section: "earn",
    defaultParentItemId: null,
    isGroup: true,
    parentLocked: true
  },
  faucet: {
    path: "/faucet",
    labelKey: "sidebar.faucet",
    icon: "Gift",
    section: "earn",
    defaultParentItemId: "rewards_group"
  },
  shortlinks: {
    path: "/shortlinks",
    labelKey: "sidebar.shortlinks",
    icon: "Link",
    section: "earn",
    defaultParentItemId: "rewards_group"
  },
  auto_mining: {
    path: "/auto-mining",
    labelKey: "sidebar.auto_mining",
    icon: "Zap",
    section: "earn",
    defaultParentItemId: "rewards_group"
  },
  youtube: {
    path: "/youtube",
    labelKey: "sidebar.youtube",
    icon: "Youtube",
    section: "earn",
    defaultParentItemId: "rewards_group"
  },
  read_earn: {
    path: "/read-earn",
    labelKey: "sidebar.read_earn",
    icon: "Sparkles",
    section: "earn",
    defaultParentItemId: "rewards_group"
  },
  internal_offerwall: {
    path: "/internal-offerwall",
    labelKey: "sidebar.internal_offerwall",
    icon: "LayoutGrid",
    section: "earn",
    defaultParentItemId: "rewards_group"
  },
  daily_tasks: {
    path: "/daily-tasks",
    labelKey: "sidebar.daily_tasks",
    icon: "ListChecks",
    section: "earn",
    defaultParentItemId: null,
    parentLocked: true
  },

  games: {
    path: "/games",
    labelKey: "sidebar.games",
    icon: "Gamepad2",
    section: "social",
    defaultParentItemId: null
  },
  calculator: {
    path: "/calculator",
    labelKey: "sidebar.calculator",
    icon: "Calculator",
    section: "social",
    defaultParentItemId: null
  },
  manual: {
    path: "/manual",
    labelKey: "sidebar.manual",
    icon: "BookOpen",
    section: "social",
    defaultParentItemId: null
  },
  ranking: {
    path: "/ranking",
    labelKey: "sidebar.ranking",
    icon: "Trophy",
    section: "social",
    defaultParentItemId: null
  },
  roadmap: {
    path: "/roadmap",
    labelKey: "sidebar.roadmap",
    icon: "Map",
    section: "social",
    defaultParentItemId: null
  },
  transparency: {
    path: "/transparency",
    labelKey: "sidebar.transparency",
    icon: "Eye",
    section: "social",
    defaultParentItemId: null
  }
};

export const ALLOWED_ITEM_IDS = new Set(Object.keys(SIDEBAR_ITEM_REGISTRY));

export const SIDEBAR_SECTIONS = /** @type {const} */ (["main", "earn", "social"]);

export const CATEGORY_TITLE_KEYS = {
  main: "sidebar.categories.main",
  earn: "sidebar.categories.earn",
  social: "sidebar.categories.social"
};

/**
 * Default persisted entries: Mini Pass top-level in Earn; rewards children under group.
 * @returns {Array<{ itemId: string, visible: boolean, sortOrder: number, section: SidebarSection, parentItemId: string | null }>}
 */
/** Metadata for admin editor (no paths — client resolves labels via i18n `labelKey`). */
export function buildAdminItemMeta() {
  return Object.fromEntries(
    Object.entries(SIDEBAR_ITEM_REGISTRY).map(([itemId, def]) => [
      itemId,
      {
        labelKey: def.labelKey,
        icon: def.icon,
        section: def.section,
        parentLocked: Boolean(def.parentLocked),
        defaultParentItemId: def.defaultParentItemId,
        isGroup: Boolean(def.isGroup)
      }
    ])
  );
}

/**
 * Forces `parentItemId` to the registry default for every `parentLocked` item
 * (e.g. Mini Pass and check-in must stay out of the Rewards group).
 * @param {unknown[]} entries
 * @returns {{ entries: object[], changed: boolean }}
 */
/**
 * Aligns internal offerwall `parentItemId` with the registry default (under rewards_group; legacy rows may have null).
 * @param {unknown[]} entries
 * @returns {{ entries: object[], changed: boolean }}
 */
export function coerceInternalOfferwallEarnRoot(entries) {
  if (!Array.isArray(entries)) return { entries: /** @type {object[]} */ (entries), changed: false };
  const want = SIDEBAR_ITEM_REGISTRY.internal_offerwall?.defaultParentItemId ?? null;
  let changed = false;
  const next = entries.map((e) => {
    if (!e || typeof e !== "object") return /** @type {object} */ (e);
    const row = /** @type {{ itemId: string, parentItemId?: string | null }} */ (e);
    if (row.itemId !== "internal_offerwall") return /** @type {object} */ (e);
    const cur = row.parentItemId ?? null;
    if (cur !== want) {
      changed = true;
      return { ...row, parentItemId: want, section: "earn" };
    }
    return /** @type {object} */ (e);
  });
  return { entries: next, changed };
}

export function coerceParentLockedSidebarEntries(entries) {
  if (!Array.isArray(entries)) return { entries: /** @type {object[]} */ (entries), changed: false };
  let changed = false;
  const next = entries.map((e) => {
    if (!e || typeof e !== "object") return /** @type {object} */ (e);
    const row = /** @type {{ itemId: string, parentItemId?: string | null }} */ (e);
    const def = SIDEBAR_ITEM_REGISTRY[row.itemId];
    if (!def?.parentLocked) return /** @type {object} */ (e);
    const want = def.defaultParentItemId ?? null;
    const cur = row.parentItemId ?? null;
    if (cur !== want) {
      changed = true;
      return { ...row, parentItemId: want };
    }
    return /** @type {object} */ (e);
  });
  return { entries: next, changed };
}

/**
 * Appends rows for any new `SIDEBAR_ITEM_REGISTRY` ids missing from stored nav (survives DB snapshots from older builds).
 * @param {unknown[]} entries
 * @returns {{ entries: object[], changed: boolean }}
 */
export function mergeMissingSidebarRegistryEntries(entries) {
  if (!Array.isArray(entries)) {
    return { entries: buildDefaultSidebarEntries(), changed: true };
  }
  const present = new Set(
    entries
      .filter((e) => e && typeof e === "object")
      .map((e) => String(/** @type {{ itemId?: string }} */ (e).itemId || "").trim())
      .filter(Boolean)
  );
  const defaults = buildDefaultSidebarEntries();
  let changed = false;
  const next = [...entries];
  for (const row of defaults) {
    if (!present.has(row.itemId)) {
      next.push({ ...row });
      present.add(row.itemId);
      changed = true;
    }
  }
  return { entries: next, changed };
}

export function buildDefaultSidebarEntries() {
  return [
    { itemId: "dashboard", visible: true, sortOrder: 10, section: "main", parentItemId: null },
    { itemId: "power_stats", visible: true, sortOrder: 20, section: "main", parentItemId: null },
    { itemId: "machines", visible: true, sortOrder: 30, section: "main", parentItemId: null },
    { itemId: "shop", visible: true, sortOrder: 40, section: "main", parentItemId: null },
    { itemId: "offers", visible: true, sortOrder: 50, section: "main", parentItemId: null },
    { itemId: "wallet", visible: true, sortOrder: 60, section: "main", parentItemId: null },
    { itemId: "support", visible: true, sortOrder: 70, section: "main", parentItemId: null },

    { itemId: "checkin", visible: true, sortOrder: 110, section: "earn", parentItemId: null },
    { itemId: "mini_pass", visible: true, sortOrder: 115, section: "earn", parentItemId: null },
    { itemId: "daily_tasks", visible: true, sortOrder: 118, section: "earn", parentItemId: null },
    { itemId: "rewards_group", visible: true, sortOrder: 120, section: "earn", parentItemId: null },
    { itemId: "internal_offerwall", visible: true, sortOrder: 125, section: "earn", parentItemId: "rewards_group" },
    { itemId: "faucet", visible: true, sortOrder: 130, section: "earn", parentItemId: "rewards_group" },
    { itemId: "shortlinks", visible: true, sortOrder: 140, section: "earn", parentItemId: "rewards_group" },
    { itemId: "auto_mining", visible: true, sortOrder: 150, section: "earn", parentItemId: "rewards_group" },
    { itemId: "youtube", visible: true, sortOrder: 160, section: "earn", parentItemId: "rewards_group" },
    { itemId: "read_earn", visible: true, sortOrder: 170, section: "earn", parentItemId: "rewards_group" },

    { itemId: "games", visible: true, sortOrder: 210, section: "social", parentItemId: null },
    { itemId: "calculator", visible: true, sortOrder: 220, section: "social", parentItemId: null },
    { itemId: "manual", visible: true, sortOrder: 230, section: "social", parentItemId: null },
    { itemId: "ranking", visible: true, sortOrder: 240, section: "social", parentItemId: null },
    { itemId: "roadmap", visible: true, sortOrder: 250, section: "social", parentItemId: null },
    { itemId: "transparency", visible: true, sortOrder: 260, section: "social", parentItemId: null }
  ];
}

/**
 * @param {unknown} raw
 * @returns {string | null}
 */
export function validationErrorForEntry(raw) {
  if (!raw || typeof raw !== "object") return "invalid_entry_shape";
  const { itemId, visible, sortOrder, section, parentItemId } = /** @type {Record<string, unknown>} */ (raw);
  if (typeof itemId !== "string" || !ALLOWED_ITEM_IDS.has(itemId)) return "unknown_item_id";
  if (typeof visible !== "boolean") return "invalid_visible";
  if (typeof sortOrder !== "number" || !Number.isInteger(sortOrder)) return "invalid_sort_order";
  if (section !== "main" && section !== "earn" && section !== "social") return "invalid_section";
  if (parentItemId !== null && parentItemId !== "rewards_group") return "invalid_parent";

  const def = SIDEBAR_ITEM_REGISTRY[itemId];
  if (def.section !== section) return "section_mismatch";
  if (def.parentLocked && parentItemId !== def.defaultParentItemId) return "parent_locked";

  if (def.section === "main" || def.section === "social") {
    if (parentItemId !== null) return "main_social_parent_must_be_null";
  }
  if (def.section === "earn" && itemId !== "rewards_group") {
    // rewards_group is a root; nesting only under rewards_group when allowed
    if (parentItemId === "rewards_group" && def.defaultParentItemId !== "rewards_group") {
      return "cannot_nest_item";
    }
  }
  if (itemId === "rewards_group" && parentItemId !== null) return "group_must_be_root";
  return null;
}

/**
 * @param {unknown[]} entries
 * @returns {{ ok: true, entries: object[] } | { ok: false, code: string }}
 */
export function validateSidebarEntriesPayload(entries) {
  if (!Array.isArray(entries)) return { ok: false, code: "entries_not_array" };
  const seen = new Set();
  for (const e of entries) {
    const err = validationErrorForEntry(e);
    if (err) return { ok: false, code: err };
    const id = /** @type {{ itemId: string }} */ (e).itemId;
    if (seen.has(id)) return { ok: false, code: "duplicate_item_id" };
    seen.add(id);
  }
  if (seen.size !== ALLOWED_ITEM_IDS.size) return { ok: false, code: "incomplete_item_set" };
  const hasGroup = entries.some((x) => /** @type {{ itemId: string }} */ (x).itemId === "rewards_group");
  const childOfGroup = entries.filter(
    (x) => /** @type {{ parentItemId: string | null }} */ (x).parentItemId === "rewards_group"
  );
  if (childOfGroup.length > 0 && !hasGroup) return { ok: false, code: "rewards_group_required" };
  return { ok: true, entries: /** @type {object[]} */ (entries) };
}
