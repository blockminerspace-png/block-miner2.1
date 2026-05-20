export type CheckinMode = "offchain" | "onchain" | "hybrid";

const VALID_MODES = new Set<CheckinMode>(["offchain", "onchain", "hybrid"]);

function readIntEnv(key: string, fallback: number, min: number, max: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function readBoolEnv(key: string, fallback: boolean): boolean {
  const v = String(process.env[key] ?? "").trim().toLowerCase();
  if (!v) return fallback;
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** CHECKIN_MODE: offchain | onchain | hybrid (default hybrid). */
export function getCheckinMode(env: NodeJS.ProcessEnv = process.env): CheckinMode {
  const raw = String(env.CHECKIN_MODE ?? "hybrid").trim().toLowerCase();
  if (VALID_MODES.has(raw as CheckinMode)) return raw as CheckinMode;
  return "hybrid";
}

/** Hour (0–23) in America/Sao_Paulo when the daily period rolls (default 21). */
export function getCheckinResetHour(env: NodeJS.ProcessEnv = process.env): number {
  return readIntEnv("CHECKIN_RESET_HOUR", 21, 0, 23);
}

/** Hours after period end where a missed day can still preserve streak (default 6). */
export function getCheckinGraceHours(env: NodeJS.ProcessEnv = process.env): number {
  return readIntEnv("CHECKIN_GRACE_HOURS", 6, 0, 48);
}

export function isCheckinStreakFreezeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return readBoolEnv("CHECKIN_STREAK_FREEZE_ENABLED", true);
}

export function getCheckinMaxGraceUsesPerMonth(env: NodeJS.ProcessEnv = process.env): number {
  return readIntEnv("CHECKIN_MAX_GRACE_USES_PER_MONTH", 2, 0, 31);
}

export function getCheckinMaxFreezeUsesPerMonth(env: NodeJS.ProcessEnv = process.env): number {
  return readIntEnv("CHECKIN_MAX_FREEZE_USES_PER_MONTH", 1, 0, 10);
}

/** Whether balance/offchain check-in requires a linked wallet (default false in hybrid/offchain). */
export function requiresWalletForOffchainCheckin(env: NodeJS.ProcessEnv = process.env): boolean {
  const mode = getCheckinMode(env);
  if (mode === "onchain") return true;
  return readBoolEnv("CHECKIN_OFFCHAIN_REQUIRES_WALLET", false);
}

export function allowsWalletCheckin(env: NodeJS.ProcessEnv = process.env): boolean {
  const mode = getCheckinMode(env);
  return mode === "onchain" || mode === "hybrid";
}

export function allowsOffchainCheckin(env: NodeJS.ProcessEnv = process.env): boolean {
  const mode = getCheckinMode(env);
  return mode === "offchain" || mode === "hybrid";
}
