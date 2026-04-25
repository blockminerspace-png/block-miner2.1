import fs from "fs/promises";
import os from "os";
import path from "path";
import { chromium } from "playwright";
import prisma from "../../server/src/db/prisma.js";
import {
  TELEGRAM_EVENT_TYPES,
  buildPolygonscanTxUrl,
  getWithdrawalTelegramSettings,
  isValidPolygonTxHash,
  normalizeThreadId,
} from "../../server/services/withdrawalTelegramService.js";

const SAFE_ERROR_MAX = 500;

function cleanString(value) {
  const s = typeof value === "string" ? value.trim() : "";
  return s || null;
}

function boolFromEnv(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function safeError(error) {
  return String(error?.message || error || "Erro desconhecido")
    .replace(/bot\d{6,}:[A-Za-z0-9_-]+/g, "bot[redacted]")
    .slice(0, SAFE_ERROR_MAX);
}

function getWorkerConfig() {
  return {
    botToken: cleanString(process.env.TELEGRAM_BOT_TOKEN),
    privateChatId: cleanString(process.env.TELEGRAM_PRIVATE_WITHDRAWAL_ALERT_CHAT_ID),
    publicChatId: cleanString(process.env.TELEGRAM_PUBLIC_PROOF_CHAT_ID),
    publicThreadId: normalizeThreadId(process.env.TELEGRAM_PUBLIC_PROOF_THREAD_ID),
    screenshotEnabled: boolFromEnv("TELEGRAM_POLYGONSCAN_SCREENSHOT_ENABLED", true),
    pollIntervalMs: Math.max(1000, Number(process.env.TELEGRAM_WORKER_POLL_INTERVAL_MS || 5000) || 5000),
    maxAttempts: Math.max(1, Number(process.env.TELEGRAM_WORKER_MAX_ATTEMPTS || 5) || 5),
    concurrency: Math.max(1, Math.min(10, Number(process.env.TELEGRAM_WORKER_CONCURRENCY || 1) || 1)),
    screenshotTimeoutMs: Math.max(5000, Number(process.env.TELEGRAM_POLYGONSCAN_SCREENSHOT_TIMEOUT_MS || 45000) || 45000),
  };
}

export function computeBackoffMs(attempts) {
  const n = Math.max(1, Number(attempts) || 1);
  return Math.min(60 * 60 * 1000, 30_000 * 2 ** (n - 1));
}

export function formatTelegramDate(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: process.env.TZ || "America/Sao_Paulo",
  }).format(date);
}

function amountText(value) {
  const n = Number(value || 0);
  return `${Number.isFinite(n) ? n.toFixed(8) : "0.00000000"} POL`;
}

export function buildPrivateAlertMessage(event) {
  const payload = event.payload || {};
  const username = payload.username || event.usernameSnapshot || `user-${event.userId || "?"}`;
  return [
    "Novo pedido de saque",
    `Usuario: @${username} (#${event.userId || "?"})`,
    payload.emailMasked ? `Email: ${payload.emailMasked}` : null,
    `Valor: ${amountText(event.amount)}`,
    `Destino: ${event.destinationWallet || payload.destinationWallet || "-"}`,
    `Data: ${formatTelegramDate(payload.createdAt || event.createdAt)}`,
    `Transacao: #${event.transactionId || event.id}`,
    "Status: pending",
    payload.lastIp ? `IP: ${payload.lastIp}` : null,
  ].filter(Boolean).join("\n");
}

export function buildPublicProofMessage(event) {
  const payload = event.payload || {};
  const txHash = cleanString(event.txHash || payload.txHash);
  const url = buildPolygonscanTxUrl(txHash);
  const username = payload.username || event.usernameSnapshot || `user-${event.userId || "?"}`;
  return [
    "Saque processado",
    `Usuario: ${username}`,
    `Valor: ${amountText(event.amount)}`,
    "Moeda: POL",
    `Hash: ${txHash}`,
    `Polygonscan: ${url}`,
    `Data: ${formatTelegramDate(payload.completedAt || event.sentAt || event.updatedAt || event.createdAt)}`,
    "Status: completed",
    event.transactionId ? `Transacao: #${event.transactionId}` : null,
  ].filter(Boolean).join("\n");
}

async function telegramFetch(method, botToken, body) {
  if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN nao configurado.");
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, body);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Telegram ${method} failed (${response.status}): ${text.slice(0, 250)}`);
  }
  return response.json().catch(() => ({}));
}

export async function sendTelegramMessage({ botToken, chatId, threadId, text, fetchImpl = telegramFetch }) {
  const body = {
    chat_id: String(chatId),
    text,
    disable_web_page_preview: false,
  };
  if (threadId) body.message_thread_id = Number(threadId);
  return fetchImpl("sendMessage", botToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function sendTelegramPhoto({ botToken, chatId, threadId, caption, filePath, fetchImpl = telegramFetch }) {
  const buffer = await fs.readFile(filePath);
  const form = new FormData();
  form.set("chat_id", String(chatId));
  if (threadId) form.set("message_thread_id", String(threadId));
  form.set("caption", caption);
  form.set("photo", new Blob([buffer], { type: "image/png" }), path.basename(filePath));
  return fetchImpl("sendPhoto", botToken, { method: "POST", body: form });
}

export async function capturePolygonscanScreenshot(txHash, { timeoutMs = 45000, chromiumImpl = chromium } = {}) {
  if (!isValidPolygonTxHash(txHash)) throw new Error("txHash invalido.");
  const url = buildPolygonscanTxUrl(txHash);
  const tempPath = path.join(os.tmpdir(), `telegram-proof-${txHash.slice(2, 12)}-${Date.now()}.png`);
  const browser = await chromiumImpl.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await page.screenshot({ path: tempPath, fullPage: true });
    return tempPath;
  } catch (error) {
    await fs.unlink(tempPath).catch(() => {});
    throw error;
  } finally {
    await browser.close().catch(() => {});
  }
}

async function claimNextEvent() {
  const event = await prisma.telegramOutboxEvent.findFirst({
    where: {
      status: { in: ["pending", "failed"] },
      nextRunAt: { lte: new Date() },
    },
    orderBy: { createdAt: "asc" },
  });
  if (!event) return null;
  const claimed = await prisma.telegramOutboxEvent.updateMany({
    where: {
      id: event.id,
      status: event.status,
      nextRunAt: { lte: new Date() },
    },
    data: {
      status: "processing",
      attempts: { increment: 1 },
      lastError: null,
    },
  });
  if (claimed.count !== 1) return null;
  return prisma.telegramOutboxEvent.findUnique({ where: { id: event.id } });
}

async function markSent(eventId) {
  await prisma.telegramOutboxEvent.update({
    where: { id: eventId },
    data: { status: "sent", sentAt: new Date(), lastError: null },
  });
}

async function markFailed(event, error, config) {
  const attempts = Number(event.attempts || 0);
  const dead = attempts >= config.maxAttempts;
  await prisma.telegramOutboxEvent.update({
    where: { id: event.id },
    data: {
      status: dead ? "dead" : "failed",
      lastError: safeError(error),
      nextRunAt: new Date(Date.now() + computeBackoffMs(attempts)),
    },
  });
}

export async function processTelegramEvent(event, config = getWorkerConfig()) {
  if (event.type === TELEGRAM_EVENT_TYPES.WITHDRAWAL_REQUESTED_PRIVATE_ALERT) {
    const sendMessageFn = config.sendMessageFn || sendTelegramMessage;
    await sendMessageFn({
      botToken: config.botToken,
      chatId: config.privateChatId,
      text: buildPrivateAlertMessage(event),
    });
    return { sent: true, screenshot: false };
  }

  if (event.type === TELEGRAM_EVENT_TYPES.WITHDRAWAL_COMPLETED_PUBLIC_PROOF) {
    const txHash = cleanString(event.txHash || event.payload?.txHash);
    if (!isValidPolygonTxHash(txHash)) throw new Error("txHash invalido.");
    const text = buildPublicProofMessage(event);
    let screenshotPath = null;
    const captureFn = config.captureFn || capturePolygonscanScreenshot;
    const sendMessageFn = config.sendMessageFn || sendTelegramMessage;
    const sendPhotoFn = config.sendPhotoFn || sendTelegramPhoto;
    if (config.screenshotEnabled) {
      try {
        screenshotPath = await captureFn(txHash, { timeoutMs: config.screenshotTimeoutMs });
      } catch (error) {
        console.warn("[telegram-proof-worker] screenshot failed; sending text fallback", { eventId: event.id, error: safeError(error) });
      }
    }
    try {
      if (screenshotPath) {
        await sendPhotoFn({
          botToken: config.botToken,
          chatId: config.publicChatId,
          threadId: config.publicThreadId,
          caption: text,
          filePath: screenshotPath,
        });
        return { sent: true, screenshot: true };
      }
      await sendMessageFn({
        botToken: config.botToken,
        chatId: config.publicChatId,
        threadId: config.publicThreadId,
        text,
      });
      return { sent: true, screenshot: false };
    } finally {
      if (screenshotPath) await fs.unlink(screenshotPath).catch(() => {});
    }
  }

  throw new Error(`Tipo de evento Telegram desconhecido: ${event.type}`);
}

async function workerTick() {
  const config = getWorkerConfig();
  const event = await claimNextEvent();
  if (!event) return false;
  try {
    await processTelegramEvent(event, config);
    await markSent(event.id);
    console.log("[telegram-proof-worker] sent", { eventId: event.id, type: event.type });
  } catch (error) {
    console.warn("[telegram-proof-worker] failed", { eventId: event.id, type: event.type, error: safeError(error) });
    await markFailed(event, error, config);
  }
  return true;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runWorker() {
  const config = getWorkerConfig();
  await getWithdrawalTelegramSettings();
  console.log("[telegram-proof-worker] started", {
    privateChatConfigured: Boolean(config.privateChatId),
    publicChatConfigured: Boolean(config.publicChatId),
    publicThreadConfigured: Boolean(config.publicThreadId),
    screenshotEnabled: config.screenshotEnabled,
    concurrency: config.concurrency,
  });
  let stopping = false;
  process.on("SIGTERM", () => { stopping = true; });
  process.on("SIGINT", () => { stopping = true; });
  while (!stopping) {
    const results = await Promise.all(Array.from({ length: config.concurrency }, () => workerTick()));
    if (!results.some(Boolean)) await sleep(config.pollIntervalMs);
  }
  await prisma.$disconnect().catch(() => {});
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runWorker().catch(async (error) => {
    console.error("[telegram-proof-worker] fatal", { error: safeError(error) });
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });
}
