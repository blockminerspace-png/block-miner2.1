import prisma from "../src/db/prisma.js";

export const TELEGRAM_EVENT_TYPES = Object.freeze({
  WITHDRAWAL_REQUESTED_PRIVATE_ALERT: "withdrawal_requested_private_alert",
  WITHDRAWAL_COMPLETED_PUBLIC_PROOF: "withdrawal_completed_public_proof",
});

const SINGLETON_ID = 1;
const CHAT_ID_PATTERN = /^-?\d{5,30}$/;
const THREAD_ID_PATTERN = /^\d{1,12}$/;
const MAX_LAST_ERROR = 500;

function cleanString(value) {
  const s = typeof value === "string" ? value.trim() : "";
  return s || null;
}

function boolFromEnv(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function maskSecret(value) {
  const s = cleanString(value);
  if (!s) return "";
  if (s.length <= 8) return "*".repeat(s.length);
  return `${s.slice(0, 4)}••••${s.slice(-4)}`;
}

function safeError(value) {
  return String(value || "Erro desconhecido")
    .replace(/bot\d{6,}:[A-Za-z0-9_-]+/g, "bot[redacted]")
    .slice(0, MAX_LAST_ERROR);
}

export function isValidPolygonTxHash(value) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{64}$/.test(value.trim());
}

export function normalizeChatId(value, label = "chat_id") {
  const next = cleanString(value);
  if (!next) return null;
  if (!CHAT_ID_PATTERN.test(next)) {
    const error = new Error(`${label} invalido.`);
    error.statusCode = 400;
    throw error;
  }
  return next;
}

export function normalizeThreadId(value) {
  const next = cleanString(value);
  if (!next) return null;
  if (!THREAD_ID_PATTERN.test(next)) {
    const error = new Error("message_thread_id invalido.");
    error.statusCode = 400;
    throw error;
  }
  const numeric = Number(next);
  if (!Number.isSafeInteger(numeric) || numeric < 1) {
    const error = new Error("message_thread_id invalido.");
    error.statusCode = 400;
    throw error;
  }
  return numeric;
}

export function normalizePolygonscanBaseUrl(value = process.env.POLYGONSCAN_BASE_URL) {
  const raw = cleanString(value) || "https://polygonscan.com";
  let url;
  try {
    url = new URL(raw);
  } catch {
    const error = new Error("POLYGONSCAN_BASE_URL invalida.");
    error.statusCode = 400;
    throw error;
  }
  if (url.protocol !== "https:" || !/(^|\.)polygonscan\.com$/i.test(url.hostname)) {
    const error = new Error("POLYGONSCAN_BASE_URL precisa usar HTTPS em dominio polygonscan.com.");
    error.statusCode = 400;
    throw error;
  }
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

export function buildPolygonscanTxUrl(txHash, baseUrl = process.env.POLYGONSCAN_BASE_URL) {
  const hash = cleanString(txHash);
  if (!isValidPolygonTxHash(hash)) {
    const error = new Error("txHash invalido.");
    error.statusCode = 400;
    throw error;
  }
  return `${normalizePolygonscanBaseUrl(baseUrl)}/tx/${hash}`;
}

function getEnvConfig() {
  const privateChatId = normalizeChatId(process.env.TELEGRAM_PRIVATE_WITHDRAWAL_ALERT_CHAT_ID, "chat privado");
  const publicChatId = normalizeChatId(process.env.TELEGRAM_PUBLIC_PROOF_CHAT_ID, "chat publico");
  const publicThreadId = normalizeThreadId(process.env.TELEGRAM_PUBLIC_PROOF_THREAD_ID);
  const token = cleanString(process.env.TELEGRAM_BOT_TOKEN);
  return {
    botToken: token,
    botTokenConfigured: Boolean(token),
    botTokenMasked: maskSecret(token),
    privateAlertsEnabled: boolFromEnv("TELEGRAM_WITHDRAWAL_ALERTS_ENABLED", false),
    publicProofsEnabled: boolFromEnv("TELEGRAM_PUBLIC_PROOFS_ENABLED", false),
    screenshotEnabled: boolFromEnv("TELEGRAM_POLYGONSCAN_SCREENSHOT_ENABLED", false),
    privateChatId,
    publicChatId,
    publicThreadId,
    polygonscanBaseUrl: normalizePolygonscanBaseUrl(),
    pollIntervalMs: Math.max(1000, Number(process.env.TELEGRAM_WORKER_POLL_INTERVAL_MS || 5000) || 5000),
    maxAttempts: Math.max(1, Number(process.env.TELEGRAM_WORKER_MAX_ATTEMPTS || 5) || 5),
    concurrency: Math.max(1, Math.min(10, Number(process.env.TELEGRAM_WORKER_CONCURRENCY || 1) || 1)),
  };
}

async function getLegacySettingsRow() {
  return prisma.withdrawalTelegramSettings.findUnique({ where: { id: SINGLETON_ID } }).catch(() => null);
}

export async function getWithdrawalTelegramSettings() {
  const env = getEnvConfig();
  const legacy = await getLegacySettingsRow();
  return {
    enabled: Boolean(env.privateAlertsEnabled || env.publicProofsEnabled),
    configSource: "env",
    tokenConfigured: env.botTokenConfigured,
    botTokenConfigured: env.botTokenConfigured,
    botTokenMasked: env.botTokenMasked,
    legacyDbTokenPresent: Boolean(legacy?.privateBotToken || legacy?.publicBotToken),
    privateAlertsEnabled: env.privateAlertsEnabled,
    privateChatConfigured: Boolean(env.privateChatId),
    privateChatId: env.privateChatId || "",
    publicProofsEnabled: env.publicProofsEnabled,
    publicChatConfigured: Boolean(env.publicChatId),
    publicChatId: env.publicChatId || "",
    publicThreadConfigured: Boolean(env.publicThreadId),
    publicThreadId: env.publicThreadId ? String(env.publicThreadId) : "",
    screenshotEnabled: env.screenshotEnabled,
    captureEnabled: env.screenshotEnabled,
    polygonscanBaseUrl: env.polygonscanBaseUrl,
    worker: {
      pollIntervalMs: env.pollIntervalMs,
      maxAttempts: env.maxAttempts,
      concurrency: env.concurrency,
    },
    updatedAt: legacy?.updatedAt || null,
  };
}

export async function updateWithdrawalTelegramSettings() {
  const error = new Error("As configuracoes sensiveis do Telegram agora sao definidas por env vars no backend/worker.");
  error.statusCode = 400;
  throw error;
}

function snapshotUsername(transaction) {
  return cleanString(transaction?.user?.username) || cleanString(transaction?.user?.email) || (transaction?.userId ? `user-${transaction.userId}` : null);
}

function publicPayloadForEvent(type, transaction, extra = {}) {
  const user = transaction?.user || {};
  const base = {
    transactionId: transaction?.id ?? null,
    userId: transaction?.userId ?? user?.id ?? null,
    username: cleanString(user?.username) || null,
    emailMasked: maskEmail(user?.email),
    status: transaction?.status || null,
    createdAt: transaction?.createdAt || transaction?.created_at || null,
    completedAt: transaction?.completedAt || null,
  };
  if (type === TELEGRAM_EVENT_TYPES.WITHDRAWAL_REQUESTED_PRIVATE_ALERT) {
    return {
      ...base,
      destinationWallet: cleanString(transaction?.address),
      registrationIp: cleanString(user?.registrationIp),
      lastIp: cleanString(user?.ip),
      ...extra,
    };
  }
  return { ...base, ...extra };
}

function maskEmail(value) {
  const email = cleanString(value);
  if (!email || !email.includes("@")) return null;
  const [local, domain] = email.split("@");
  const prefix = local.slice(0, 2);
  return `${prefix}${local.length > 2 ? "•••" : "•"}@${domain}`;
}

export function isTelegramPrivateAlertsEnabled() {
  try {
    const cfg = getEnvConfig();
    return Boolean(cfg.botTokenConfigured && cfg.privateAlertsEnabled && cfg.privateChatId);
  } catch {
    return false;
  }
}

export function isTelegramPublicProofsEnabled() {
  try {
    const cfg = getEnvConfig();
    return Boolean(cfg.botTokenConfigured && cfg.publicProofsEnabled && cfg.publicChatId);
  } catch {
    return false;
  }
}

export async function createTelegramOutboxEventTx(tx, type, transaction, extra = {}) {
  if (!transaction?.id) return null;
  if (type === TELEGRAM_EVENT_TYPES.WITHDRAWAL_REQUESTED_PRIVATE_ALERT && !isTelegramPrivateAlertsEnabled()) return null;
  if (type === TELEGRAM_EVENT_TYPES.WITHDRAWAL_COMPLETED_PUBLIC_PROOF && !isTelegramPublicProofsEnabled()) return null;

  const txHash = cleanString(extra.txHash || transaction.txHash);
  if (type === TELEGRAM_EVENT_TYPES.WITHDRAWAL_COMPLETED_PUBLIC_PROOF && !isValidPolygonTxHash(txHash)) return null;

  return tx.telegramOutboxEvent.upsert({
    where: { transactionId_type: { transactionId: transaction.id, type } },
    create: {
      type,
      status: "pending",
      transactionId: transaction.id,
      userId: transaction.userId,
      txHash,
      amount: transaction.amount,
      currency: "POL",
      destinationWallet: cleanString(transaction.address),
      usernameSnapshot: snapshotUsername(transaction),
      payload: publicPayloadForEvent(type, transaction, extra),
      nextRunAt: new Date(),
    },
    update: {},
  });
}

export async function notifyWithdrawalRequested(withdrawal) {
  return createTelegramOutboxEventTx(
    prisma,
    TELEGRAM_EVENT_TYPES.WITHDRAWAL_REQUESTED_PRIVATE_ALERT,
    withdrawal,
  );
}

export async function notifyWithdrawalCompleted(withdrawal) {
  return createTelegramOutboxEventTx(
    prisma,
    TELEGRAM_EVENT_TYPES.WITHDRAWAL_COMPLETED_PUBLIC_PROOF,
    withdrawal,
    { txHash: withdrawal?.txHash },
  );
}

export async function listTelegramOutboxEvents({ page = 1, limit = 25 } = {}) {
  const take = Math.min(100, Math.max(1, Number(limit) || 25));
  const skip = (Math.max(1, Number(page) || 1) - 1) * take;
  const [events, total] = await Promise.all([
    prisma.telegramOutboxEvent.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take,
      select: {
        id: true,
        type: true,
        status: true,
        transactionId: true,
        userId: true,
        txHash: true,
        amount: true,
        currency: true,
        attempts: true,
        lastError: true,
        nextRunAt: true,
        sentAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.telegramOutboxEvent.count(),
  ]);
  return { events: events.map((event) => ({ ...event, amount: event.amount == null ? null : Number(event.amount), lastError: safeError(event.lastError) })), total };
}

export async function retryTelegramOutboxEvent(id) {
  const eventId = Number(id);
  if (!Number.isSafeInteger(eventId) || eventId < 1) {
    const error = new Error("Evento invalido.");
    error.statusCode = 400;
    throw error;
  }
  const event = await prisma.telegramOutboxEvent.findUnique({ where: { id: eventId } });
  if (!event) {
    const error = new Error("Evento nao encontrado.");
    error.statusCode = 404;
    throw error;
  }
  if (!["failed", "dead"].includes(event.status)) {
    const error = new Error("Apenas eventos failed/dead podem ser reenviados manualmente.");
    error.statusCode = 400;
    throw error;
  }
  return prisma.telegramOutboxEvent.update({
    where: { id: eventId },
    data: {
      status: "pending",
      attempts: 0,
      lastError: null,
      nextRunAt: new Date(),
      sentAt: null,
    },
    select: { id: true, type: true, status: true, attempts: true, nextRunAt: true },
  });
}

export async function createTelegramTestEvent(type, payload = {}) {
  const txHash = cleanString(payload.txHash);
  if (type === TELEGRAM_EVENT_TYPES.WITHDRAWAL_COMPLETED_PUBLIC_PROOF && !isValidPolygonTxHash(txHash)) {
    const error = new Error("txHash invalido.");
    error.statusCode = 400;
    throw error;
  }
  if (type === TELEGRAM_EVENT_TYPES.WITHDRAWAL_REQUESTED_PRIVATE_ALERT && !isTelegramPrivateAlertsEnabled()) {
    const error = new Error("Alerta privado Telegram nao configurado.");
    error.statusCode = 400;
    throw error;
  }
  if (type === TELEGRAM_EVENT_TYPES.WITHDRAWAL_COMPLETED_PUBLIC_PROOF && !isTelegramPublicProofsEnabled()) {
    const error = new Error("Prova publica Telegram nao configurada.");
    error.statusCode = 400;
    throw error;
  }
  return prisma.telegramOutboxEvent.create({
    data: {
      type,
      status: "pending",
      txHash,
      amount: payload.amount || "0",
      currency: "POL",
      destinationWallet: cleanString(payload.destinationWallet),
      usernameSnapshot: cleanString(payload.username) || "admin-test",
      payload: {
        isTest: true,
        username: cleanString(payload.username) || "admin-test",
        txHash,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      },
      nextRunAt: new Date(),
    },
    select: { id: true, type: true, status: true, createdAt: true },
  });
}

export async function getTelegramWorkerHealth() {
  const settings = await getWithdrawalTelegramSettings();
  const [pending, processing, failed, dead, lastSent] = await Promise.all([
    prisma.telegramOutboxEvent.count({ where: { status: "pending" } }),
    prisma.telegramOutboxEvent.count({ where: { status: "processing" } }),
    prisma.telegramOutboxEvent.count({ where: { status: "failed" } }),
    prisma.telegramOutboxEvent.count({ where: { status: "dead" } }),
    prisma.telegramOutboxEvent.findFirst({ where: { status: "sent" }, orderBy: { sentAt: "desc" }, select: { id: true, sentAt: true } }),
  ]);
  return {
    ok: true,
    configured: settings.botTokenConfigured && (settings.privateChatConfigured || settings.publicChatConfigured),
    settings,
    queue: { pending, processing, failed, dead, lastSent },
  };
}
