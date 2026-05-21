export const TASK_TYPES = ['LOGIN_DAY', 'MINE_BLK', 'PLAY_GAMES', 'WATCH_YOUTUBE', 'INTERNAL_OFFERWALL'] as const;

export const REWARD_KINDS = ['BLK', 'POL', 'HASHRATE_TEMP', 'SHOP_MINER', 'EVENT_MINER'] as const;

export const RESET_CADENCES = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;

/** Task types where target is a whole number of actions per reset period (not BLK amount). */
const COUNT_TASK_TYPES = new Set<string>(['LOGIN_DAY', 'PLAY_GAMES', 'WATCH_YOUTUBE', 'INTERNAL_OFFERWALL']);

export function isCountTaskType(tt: string): boolean {
  return COUNT_TASK_TYPES.has(String(tt || '').toUpperCase());
}

export function defaultTargetForCountType(tt: string): string {
  switch (String(tt || '').toUpperCase()) {
    case 'INTERNAL_OFFERWALL':
      return '5';
    case 'LOGIN_DAY':
      return '1';
    case 'PLAY_GAMES':
      return '5';
    case 'WATCH_YOUTUBE':
      return '1';
    default:
      return '1';
  }
}

/**
 * When switching task type, replace misleading BLK-style decimals with a sensible integer target.
 */
export function coerceTargetWhenSwitchingTaskType(prevType: string, nextType: string, targetValue: string): string {
  const t = String(targetValue).replace(',', '.').trim();
  const n = parseFloat(t);
  const prev = String(prevType || '');
  const next = String(nextType || '');
  const nextCount = isCountTaskType(next);
  const prevMine = prev === 'MINE_BLK';
  const nextMine = next === 'MINE_BLK';

  if (nextMine) {
    if (prevMine && Number.isFinite(n) && n > 0) return t;
    return '0.05';
  }
  if (nextCount) {
    const looksLikeBlkAmount = Number.isFinite(n) && n > 0 && n < 1 && !Number.isInteger(n);
    if (prevMine || looksLikeBlkAmount || !Number.isFinite(n) || n < 1) {
      return defaultTargetForCountType(next);
    }
    return String(Math.max(1, Math.min(1_000_000, Math.round(n))));
  }
  return t;
}

export type CreateFormState = {
  slug: string;
  taskType: string;
  resetCadence: string;
  targetValue: string;
  translationKey: string;
  rewardKind: string;
  rewardBlkAmount: string;
  rewardPolAmount: string;
  rewardHashRate: string;
  rewardHashRateDays: string;
  rewardMinerId: string;
  rewardEventMinerId: string;
  gameSlug: string;
  internalOfferwallOfferId: string;
  sortOrder: string;
  autoSortOrder: boolean;
};

export function defaultCreateForm(): CreateFormState {
  return {
    slug: '',
    taskType: 'MINE_BLK',
    resetCadence: 'DAILY',
    targetValue: '0.05',
    translationKey: 'dailyTasks.tasks.custom',
    rewardKind: 'BLK',
    rewardBlkAmount: '0.01',
    rewardPolAmount: '0.01',
    rewardHashRate: '5',
    rewardHashRateDays: '1',
    rewardMinerId: '',
    rewardEventMinerId: '',
    gameSlug: '',
    internalOfferwallOfferId: '',
    sortOrder: '',
    autoSortOrder: true
  };
}

export type CreateDefinitionBody = {
  slug: string;
  taskType: string;
  resetCadence: string;
  targetValue: number;
  translationKey: string;
  rewardKind: string;
  autoSortOrder: boolean;
  sortOrder?: number;
  gameSlug?: string;
  internalOfferwallOfferId?: number;
  rewardBlkAmount?: number;
  rewardPolAmount?: number;
  rewardHashRate?: number;
  rewardHashRateDays?: number;
  rewardMinerId?: number;
  rewardEventMinerId?: number;
};

export function buildCreateBody(f: CreateFormState): CreateDefinitionBody {
  const rawTarget = parseFloat(String(f.targetValue).replace(',', '.'));
  const targetValue = isCountTaskType(f.taskType) ? Math.round(rawTarget) : rawTarget;
  const body: CreateDefinitionBody = {
    slug: f.slug.trim(),
    taskType: f.taskType,
    resetCadence: f.resetCadence,
    targetValue,
    translationKey: f.translationKey.trim(),
    rewardKind: f.rewardKind,
    autoSortOrder: Boolean(f.autoSortOrder)
  };
  if (!f.autoSortOrder && String(f.sortOrder).trim() !== '') {
    body.sortOrder = parseInt(String(f.sortOrder), 10);
  }
  if (String(f.gameSlug).trim()) body.gameSlug = f.gameSlug.trim();
  if (String(f.internalOfferwallOfferId).trim()) {
    const oid = parseInt(String(f.internalOfferwallOfferId).trim(), 10);
    if (Number.isInteger(oid) && oid >= 1) body.internalOfferwallOfferId = oid;
  }
  if (f.rewardKind === 'BLK') body.rewardBlkAmount = parseFloat(String(f.rewardBlkAmount).replace(',', '.'));
  if (f.rewardKind === 'POL') body.rewardPolAmount = parseFloat(String(f.rewardPolAmount).replace(',', '.'));
  if (f.rewardKind === 'HASHRATE_TEMP') {
    body.rewardHashRate = parseFloat(String(f.rewardHashRate).replace(',', '.'));
    body.rewardHashRateDays = parseInt(String(f.rewardHashRateDays), 10);
  }
  if (f.rewardKind === 'SHOP_MINER') body.rewardMinerId = parseInt(String(f.rewardMinerId), 10);
  if (f.rewardKind === 'EVENT_MINER') body.rewardEventMinerId = parseInt(String(f.rewardEventMinerId), 10);
  return body;
}

export function suggestSlug(cadence: string, stem: string): string {
  const c = String(cadence || 'DAILY').toLowerCase();
  const raw = String(stem)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const s = raw.slice(0, 40) || 'task';
  const tail = Date.now().toString(36).slice(-6);
  return `${c}-${s}-${tail}`;
}

export type QuickTemplateId =
  | 'checkins'
  | 'games_any'
  | 'games_one'
  | 'offerwall'
  | 'mine_blk'
  | 'youtube';

export function applyQuickTemplate(templateId: QuickTemplateId, form: CreateFormState): CreateFormState {
  const next: CreateFormState = { ...form, gameSlug: '', internalOfferwallOfferId: '' };
  const slugIfEmpty = (stem: string) => (String(next.slug).trim() ? next.slug : suggestSlug(next.resetCadence, stem));

  switch (templateId) {
    case 'checkins':
      return {
        ...next,
        taskType: 'LOGIN_DAY',
        targetValue: '3',
        translationKey: 'dailyTasks.tasks.login',
        slug: slugIfEmpty('checkins')
      };
    case 'games_any':
      return {
        ...next,
        taskType: 'PLAY_GAMES',
        targetValue: '5',
        translationKey: 'dailyTasks.tasks.play_games',
        slug: slugIfEmpty('games')
      };
    case 'games_one':
      return {
        ...next,
        taskType: 'PLAY_GAMES',
        targetValue: '3',
        translationKey: 'dailyTasks.tasks.play_games',
        gameSlug: '',
        slug: slugIfEmpty('one-game')
      };
    case 'offerwall':
      return {
        ...next,
        taskType: 'INTERNAL_OFFERWALL',
        targetValue: '5',
        translationKey: 'dailyTasks.tasks.internal_offerwall',
        slug: slugIfEmpty('offerwall')
      };
    case 'mine_blk':
      return {
        ...next,
        taskType: 'MINE_BLK',
        targetValue: '0.05',
        translationKey: 'dailyTasks.tasks.mine_blk',
        slug: slugIfEmpty('mine-blk')
      };
    case 'youtube':
      return {
        ...next,
        taskType: 'WATCH_YOUTUBE',
        targetValue: '1',
        translationKey: 'dailyTasks.tasks.watch_youtube',
        slug: slugIfEmpty('youtube')
      };
  }
}

export type AdminDailyTaskDefinitionRow = {
  id: number;
  slug: string;
  taskType: string;
  resetCadence?: string | null;
  targetValue?: string | number | null;
  translationKey?: string | null;
  internalOfferwallOfferId?: number | null;
  rewardKind?: string | null;
  rewardBlkAmount?: string | number | null;
  rewardPolAmount?: string | number | null;
  rewardHashRate?: string | number | null;
  rewardHashRateDays?: number | null;
  rewardMinerId?: number | null;
  rewardEventMinerId?: number | null;
  gameSlug?: string | null;
  isActive?: boolean | null;
  sortOrder?: number | null;
  validFrom?: string | Date | null;
  validUntil?: string | Date | null;
};

/** Format a Decimal/number value for display, keeping at most 8 significant decimal digits. */
function fmtNum(v: string | number | null | undefined): string {
  if (v == null) return '—';
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  if (!Number.isFinite(n)) return String(v);
  return parseFloat(n.toFixed(8)).toString();
}

export function formatRewardSummary(r: AdminDailyTaskDefinitionRow): string {
  const kind = String(r.rewardKind || '').toUpperCase();
  switch (kind) {
    case 'BLK': return `BLK ${fmtNum(r.rewardBlkAmount)}`;
    case 'POL': return `POL ${fmtNum(r.rewardPolAmount)}`;
    case 'HASHRATE_TEMP': return `+${fmtNum(r.rewardHashRate)} H/s ×${r.rewardHashRateDays ?? 1}d`;
    case 'SHOP_MINER': return `Miner #${r.rewardMinerId ?? '?'}`;
    case 'EVENT_MINER': return `EvMiner #${r.rewardEventMinerId ?? '?'}`;
    default: return kind || '—';
  }
}

/** Convert a date value to the format expected by <input type="datetime-local"> */
export function toDatetimeLocal(v: string | Date | null | undefined): string {
  if (!v) return '';
  const d = typeof v === 'string' ? new Date(v) : v;
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export type EditFormState = {
  slug: string;
  taskType: string;
  resetCadence: string;
  targetValue: string;
  translationKey: string;
  rewardKind: string;
  rewardBlkAmount: string;
  rewardPolAmount: string;
  rewardHashRate: string;
  rewardHashRateDays: string;
  rewardMinerId: string;
  rewardEventMinerId: string;
  gameSlug: string;
  internalOfferwallOfferId: string;
  isActive: boolean;
  sortOrder: string;
  validFrom: string;
  validUntil: string;
};

export function defaultEditForm(row: AdminDailyTaskDefinitionRow): EditFormState {
  return {
    slug: row.slug,
    taskType: String(row.taskType || ''),
    resetCadence: String(row.resetCadence || 'DAILY').toUpperCase(),
    targetValue: String(row.targetValue ?? '0'),
    translationKey: String(row.translationKey ?? ''),
    rewardKind: String(row.rewardKind || 'BLK').toUpperCase(),
    rewardBlkAmount: row.rewardBlkAmount != null ? String(row.rewardBlkAmount) : '',
    rewardPolAmount: row.rewardPolAmount != null ? String(row.rewardPolAmount) : '',
    rewardHashRate: row.rewardHashRate != null ? String(row.rewardHashRate) : '',
    rewardHashRateDays: row.rewardHashRateDays != null ? String(row.rewardHashRateDays) : '1',
    rewardMinerId: row.rewardMinerId != null ? String(row.rewardMinerId) : '',
    rewardEventMinerId: row.rewardEventMinerId != null ? String(row.rewardEventMinerId) : '',
    gameSlug: String(row.gameSlug ?? ''),
    internalOfferwallOfferId: row.internalOfferwallOfferId != null ? String(row.internalOfferwallOfferId) : '',
    isActive: row.isActive !== false,
    sortOrder: String(row.sortOrder ?? '0'),
    validFrom: toDatetimeLocal(row.validFrom),
    validUntil: toDatetimeLocal(row.validUntil),
  };
}

export type EditDefinitionBody = {
  slug: string;
  taskType: string;
  resetCadence: string;
  targetValue: number;
  translationKey: string;
  rewardKind: string;
  isActive: boolean;
  sortOrder: number;
  gameSlug: string | null;
  internalOfferwallOfferId: number | null;
  validFrom: string | null;
  validUntil: string | null;
  rewardBlkAmount?: number;
  rewardPolAmount?: number;
  rewardHashRate?: number;
  rewardHashRateDays?: number;
  rewardMinerId?: number;
  rewardEventMinerId?: number;
};

export function buildEditBody(f: EditFormState): EditDefinitionBody {
  const rawTarget = parseFloat(String(f.targetValue).replace(',', '.'));
  const targetValue = isCountTaskType(f.taskType) ? Math.round(rawTarget) : rawTarget;
  const body: EditDefinitionBody = {
    slug: f.slug.trim(),
    taskType: f.taskType,
    resetCadence: f.resetCadence,
    targetValue,
    translationKey: f.translationKey.trim(),
    rewardKind: f.rewardKind,
    isActive: f.isActive,
    sortOrder: parseInt(String(f.sortOrder), 10) || 0,
    gameSlug: String(f.gameSlug).trim() || null,
    internalOfferwallOfferId: String(f.internalOfferwallOfferId).trim()
      ? parseInt(String(f.internalOfferwallOfferId).trim(), 10)
      : null,
    validFrom: f.validFrom.trim() || null,
    validUntil: f.validUntil.trim() || null,
  };
  if (f.rewardKind === 'BLK') body.rewardBlkAmount = parseFloat(String(f.rewardBlkAmount).replace(',', '.'));
  if (f.rewardKind === 'POL') body.rewardPolAmount = parseFloat(String(f.rewardPolAmount).replace(',', '.'));
  if (f.rewardKind === 'HASHRATE_TEMP') {
    body.rewardHashRate = parseFloat(String(f.rewardHashRate).replace(',', '.'));
    body.rewardHashRateDays = parseInt(String(f.rewardHashRateDays), 10);
  }
  if (f.rewardKind === 'SHOP_MINER') body.rewardMinerId = parseInt(String(f.rewardMinerId), 10);
  if (f.rewardKind === 'EVENT_MINER') body.rewardEventMinerId = parseInt(String(f.rewardEventMinerId), 10);
  return body;
}

export type DefinitionsListResponse = {
  ok?: boolean;
  definitions?: AdminDailyTaskDefinitionRow[];
  message?: string;
};

export type MutationResponse = {
  ok?: boolean;
  message?: string;
};
