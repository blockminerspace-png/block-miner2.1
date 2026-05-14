/**
 * Client-side helpers for Admin Mini Pass UI (mirrors server rules where noted).
 * Does not replace server validation.
 */

export function toDatetimeLocalValue(d: string | number | Date): string {
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 16);
}

export function defaultSeasonDateRange(): { startsAt: string; endsAt: string } {
  const start = new Date();
  const end = new Date(start);
  end.setDate(end.getDate() + 14);
  return { startsAt: toDatetimeLocalValue(start), endsAt: toDatetimeLocalValue(end) };
}

export type ProgressionTier = {
  level: number;
  minTotalXp: number;
  xpToAdvance: number;
};

/**
 * Each tier L requires totalXp >= (L-1) * xpPerLevel to claim that level's reward (see computePassLevel).
 */
export function buildProgressionTiers(maxLevel: unknown, xpPerLevel: unknown): ProgressionTier[] {
  const max = Math.max(1, Math.min(500, parseInt(String(maxLevel), 10) || 1));
  const step = Math.max(1, Math.min(1_000_000, parseInt(String(xpPerLevel), 10) || 1));
  const rows: ProgressionTier[] = [];
  for (let level = 1; level <= max; level += 1) {
    const minTotalXp = (level - 1) * step;
    const xpToAdvance = level < max ? step : 0;
    rows.push({ level, minTotalXp, xpToAdvance });
  }
  return rows;
}

function positiveInt(n: unknown): number | null {
  const v = parseInt(String(n), 10);
  return Number.isFinite(v) && v > 0 ? v : null;
}

function positiveDecimalString(s: unknown): string | null {
  if (s == null || String(s).trim() === '') return null;
  const n = Number(String(s).replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? String(s).trim() : null;
}

export type RewardDraft = {
  rewardKind?: string;
  minerId?: string | number;
  eventMinerId?: string | number;
  hashRate?: string | number;
  hashRateDays?: string | number;
  blkAmount?: string | number;
  polAmount?: string | number;
};

export type ValidateOk = { ok: true };
export type ValidateErr = { ok: false; errorKey: string };
export type ValidateResult = ValidateOk | ValidateErr;

export function validateRewardDraft(draft: RewardDraft): ValidateResult {
  const kind = String(draft.rewardKind || 'NONE').toUpperCase();
  if (kind === 'NONE') return { ok: true };

  if (kind === 'SHOP_MINER') {
    if (!positiveInt(draft.minerId)) return { ok: false, errorKey: 'reward_shop_miner' };
    return { ok: true };
  }
  if (kind === 'EVENT_MINER') {
    if (!positiveInt(draft.eventMinerId)) return { ok: false, errorKey: 'reward_event_miner' };
    return { ok: true };
  }
  if (kind === 'HASHRATE_TEMP') {
    const hr = Number(draft.hashRate);
    const days = parseInt(String(draft.hashRateDays), 10);
    if (!Number.isFinite(hr) || hr <= 0) return { ok: false, errorKey: 'reward_hashrate' };
    if (!Number.isFinite(days) || days < 1 || days > 365) return { ok: false, errorKey: 'reward_hashrate_days' };
    return { ok: true };
  }
  if (kind === 'BLK') {
    if (!positiveDecimalString(draft.blkAmount)) return { ok: false, errorKey: 'reward_blk' };
    return { ok: true };
  }
  if (kind === 'POL') {
    if (!positiveDecimalString(draft.polAmount)) return { ok: false, errorKey: 'reward_pol' };
    return { ok: true };
  }
  return { ok: false, errorKey: 'reward_unknown_kind' };
}

export type SeasonFormInput = {
  slug?: string;
  titleEn?: string;
  titlePtBR?: string;
  titleEs?: string;
  startsAt?: string;
  endsAt?: string;
  maxLevel?: string | number;
  xpPerLevel?: string | number;
  buyLevelPricePol?: string | number | null;
  completePassPricePol?: string | number | null;
};

/** i18n error keys under adminMiniPass.errors */
export function validateSeasonForm(form: SeasonFormInput): string[] {
  const keys: string[] = [];
  const slug = String(form.slug || '')
    .trim()
    .toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug)) keys.push('invalid_slug');

  const titleEn = String(form.titleEn || '').trim();
  const titlePt = String(form.titlePtBR || '').trim();
  const titleEs = String(form.titleEs || '').trim();
  if (!titleEn && !titlePt && !titleEs) keys.push('title_required');

  const start = form.startsAt ? new Date(form.startsAt) : null;
  const end = form.endsAt ? new Date(form.endsAt) : null;
  if (!start || Number.isNaN(start.getTime())) keys.push('invalid_start');
  if (!end || Number.isNaN(end.getTime())) keys.push('invalid_end');
  if (start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end <= start) {
    keys.push('end_before_start');
  }

  const maxLevel = parseInt(String(form.maxLevel), 10);
  const xpPerLevel = parseInt(String(form.xpPerLevel), 10);
  if (!Number.isFinite(maxLevel) || maxLevel < 1 || maxLevel > 500) keys.push('invalid_max_level');
  if (!Number.isFinite(xpPerLevel) || xpPerLevel < 1 || xpPerLevel > 1_000_000) keys.push('invalid_xp_per_level');
  if (form.buyLevelPricePol != null && !/^\d+(?:[.,]\d+)?$/.test(String(form.buyLevelPricePol).trim())) {
    keys.push('invalid_buy_level_price');
  }
  if (form.completePassPricePol != null && !/^\d+(?:[.,]\d+)?$/.test(String(form.completePassPricePol).trim())) {
    keys.push('invalid_complete_pass_price');
  }

  return keys;
}

/** Row shape for reward summaries and API level-reward rows (extra fields such as `id` / `level` are ignored here). */
export type RewardRowSummary = {
  rewardKind?: string | null;
  minerId?: number | null;
  eventMinerId?: number | null;
  miner?: { id?: number; name?: string | null; isActive?: boolean } | null;
  eventMiner?: { id?: number; name?: string | null; isActive?: boolean } | null;
  titleI18n?: { ptBR?: string; en?: string; es?: string } | null;
  hashRate?: string | number | null;
  hashRateDays?: string | number | null;
  blkAmount?: string | number | null;
  polAmount?: string | number | null;
};

export function summarizeRewardRow(r: RewardRowSummary | null | undefined): string {
  if (!r || r.rewardKind == null || String(r.rewardKind).trim() === '') return '—';
  const kind = String(r.rewardKind || 'NONE').toUpperCase();
  if (kind === 'NONE') return '—';
  if (kind === 'SHOP_MINER') return r.miner?.name || r.titleI18n?.ptBR || r.titleI18n?.en || `Miner #${r.minerId ?? '?'}`;
  if (kind === 'EVENT_MINER') return r.eventMiner?.name || r.titleI18n?.ptBR || r.titleI18n?.en || `Event #${r.eventMinerId ?? '?'}`;
  if (kind === 'HASHRATE_TEMP') return `${r.hashRate ?? '?'} H/s × ${r.hashRateDays ?? '?'}d`;
  if (kind === 'BLK') return `BLK ${r.blkAmount ?? '?'}`;
  if (kind === 'POL') return `POL ${r.polAmount ?? '?'}`;
  return kind;
}

export type MissionDraft = {
  titleEn?: string;
  titlePtBR?: string;
  titleEs?: string;
  targetValue?: string | number;
  xpReward?: string | number;
  descriptionEn?: string;
  descriptionPtBR?: string;
  descriptionEs?: string;
  gameSlug?: string;
  missionType?: string;
  cadence?: string;
  sortOrder?: string;
};

export function validateMissionDraft(missionDraft: MissionDraft): ValidateResult {
  const en = String(missionDraft.titleEn || '').trim();
  const pt = String(missionDraft.titlePtBR || '').trim();
  const es = String(missionDraft.titleEs || '').trim();
  if (!en && !pt && !es) return { ok: false, errorKey: 'mission_title_required' };

  let targetNum: number;
  try {
    targetNum = Number(String(missionDraft.targetValue ?? '0').replace(',', '.'));
  } catch {
    targetNum = NaN;
  }
  if (!Number.isFinite(targetNum) || targetNum <= 0) return { ok: false, errorKey: 'mission_target' };

  const xp = Math.floor(Number(missionDraft.xpReward) || 0);
  if (!Number.isFinite(xp) || xp < 0 || xp > 1_000_000) return { ok: false, errorKey: 'mission_xp' };

  const dEn = String(missionDraft.descriptionEn || '').trim();
  const dPt = String(missionDraft.descriptionPtBR || '').trim();
  const dEs = String(missionDraft.descriptionEs || '').trim();
  if ((dPt || dEs) && !dEn) return { ok: false, errorKey: 'mission_desc_en' };

  const rawSlug = String(missionDraft.gameSlug || '').trim();
  if (rawSlug && !/^[a-z0-9][a-z0-9-]{0,62}$/.test(rawSlug.toLowerCase())) {
    return { ok: false, errorKey: 'mission_game_slug' };
  }

  return { ok: true };
}

type RewardLevelRow = { level: number };

export function countRewardLevels(
  rewards: RewardLevelRow[] | null | undefined,
  maxLevel: unknown
): { defined: number; expected: number; missingLevels: number[] } {
  const max = Math.max(1, Math.min(500, parseInt(String(maxLevel), 10) || 1));
  const set = new Set((rewards || []).map((r) => r.level).filter((n) => n >= 1 && n <= max));
  return {
    defined: set.size,
    expected: max,
    missingLevels: Array.from({ length: max }, (_, i) => i + 1).filter((l) => !set.has(l)),
  };
}
