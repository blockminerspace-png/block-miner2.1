import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function loadJson(filePath: string): Record<string, unknown> {
  try {
    const txt = fs.readFileSync(filePath, "utf8");
    return JSON.parse(txt) as Record<string, unknown>;
  } catch {
    return {};
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");
const cfgDir = path.join(root, "config");

const defaultCfg = loadJson(path.join(cfgDir, "default.json"));
const prodCfg = loadJson(path.join(cfgDir, "production.json"));

type AppConfig = {
  faucet: Record<string, unknown>;
  withdraw: Record<string, unknown>;
  schedules: Record<string, unknown>;
  admin: Record<string, unknown>;
  wallet: Record<string, unknown>;
  ui: Record<string, unknown>;
  dbPath?: unknown;
  [key: string]: unknown;
};

function envOr(_pathParts: string[], envNames: string[], currentValue: unknown): unknown {
  for (const n of envNames) {
    if (process.env[n] !== undefined) return parseEnvValue(process.env[n]);
  }
  return currentValue;
}

function parseEnvValue(v: string | undefined): unknown {
  if (v === undefined) return v;
  if (v === "true") return true;
  if (v === "false") return false;
  if (!Number.isNaN(Number(v)) && v.trim() !== "") return Number(v);
  return v;
}

let cfg: AppConfig = { ...defaultCfg } as AppConfig;

if (process.env.NODE_ENV && String(process.env.NODE_ENV).toLowerCase() === "production") {
  cfg = { ...cfg, ...prodCfg } as AppConfig;
}

cfg.faucet = (cfg.faucet as Record<string, unknown>) || {};
cfg.withdraw = (cfg.withdraw as Record<string, unknown>) || {};
cfg.schedules = (cfg.schedules as Record<string, unknown>) || {};
cfg.admin = (cfg.admin as Record<string, unknown>) || {};
cfg.wallet = (cfg.wallet as Record<string, unknown>) || {};
cfg.ui = (cfg.ui as Record<string, unknown>) || {};

const faucet = cfg.faucet as Record<string, unknown>;
const withdraw = cfg.withdraw as Record<string, unknown>;
const schedules = cfg.schedules as Record<string, unknown>;
const admin = cfg.admin as Record<string, unknown>;
const wallet = cfg.wallet as Record<string, unknown>;
const ui = cfg.ui as Record<string, unknown>;

faucet.rewardMinerSlug = envOr([], ["FAUCET_REWARD_MINER_SLUG"], faucet.rewardMinerSlug);
faucet.cooldownMs = envOr([], ["FAUCET_COOLDOWN_MS"], faucet.cooldownMs);

withdraw.min = envOr([], ["MIN_WITHDRAWAL"], withdraw.min);
withdraw.max = envOr([], ["MAX_WITHDRAWAL"], withdraw.max);

schedules.depositsCron = envOr([], ["DEPOSITS_CRON"], schedules.depositsCron);
schedules.withdrawsCron = envOr([], ["WITHDRAWS_CRON", "WITHDRAWALS_CRON"], schedules.withdrawsCron);
schedules.backupCron = envOr([], ["BACKUP_CRON"], schedules.backupCron);

admin.adminEmails = envOr([], ["ADMIN_EMAILS"], admin.adminEmails);
admin.nodeEnv = envOr([], ["NODE_ENV"], admin.nodeEnv);

wallet.allowWithdrawToContracts = envOr([], ["ALLOW_WITHDRAW_TO_CONTRACTS"], wallet.allowWithdrawToContracts);
wallet.enableAutoPayouts = envOr([], ["ENABLE_AUTO_PAYOUTS"], wallet.enableAutoPayouts);

ui.showFaucetInShop = envOr([], ["SHOW_FAUCET_IN_SHOP"], ui.showFaucetInShop);

if (!faucet.rewardMinerSlug) faucet.rewardMinerSlug = "faucet-1ghs";
if (!withdraw.min) withdraw.min = 10;
if (!withdraw.max) withdraw.max = 1000000;

function failStartup(message: string): never {
  const help: string[] = [];
  help.push("See README.md for configuration instructions: ./README.md");
  help.push("Ensure your .env contains required secrets (do NOT commit .env).");
  help.push("Examples:");
  help.push("  PowerShell:  $env:DB_PATH = \"./data/blockminer.db\"");
  help.push("  bash:        export DB_PATH=./data/blockminer.db");
  help.push("To persist for your shell, add the above to your profile or use a .env file.");
  console.error("Configuration validation failed:", message);
  console.error(help.join("\n"));
  throw new Error(message);
}

const isProduction = String(process.env.NODE_ENV || (admin.nodeEnv as string) || "").toLowerCase() === "production";

const dbPath = process.env.DB_PATH || cfg.dbPath || null;
if (!dbPath) {
  failStartup("DB_PATH is not configured. Set DB_PATH in your .env");
}

if (isProduction) {
  const adminEmails = String(process.env.ADMIN_EMAILS || (admin.adminEmails as string) || "").trim();
  if (!adminEmails) {
    failStartup("ADMIN_EMAILS must be set in production (comma-separated)");
  }

  const hasPrivateKey = Boolean(String(process.env.WITHDRAWAL_PRIVATE_KEY || "").trim());
  const hasMnemonic = Boolean(String(process.env.WITHDRAWAL_MNEMONIC || "").trim());
  if (!hasPrivateKey && !hasMnemonic) {
    failStartup("Either WITHDRAWAL_PRIVATE_KEY or WITHDRAWAL_MNEMONIC must be set in production");
  }
}

export default cfg;
