import fs from "fs/promises";
import os from "os";
import path from "path";
import { chromium } from "playwright";
import prisma from "../src/db/prisma.js";
import loggerLib from "../utils/logger.js";

const logger = loggerLib.child("WithdrawalTelegram");
const SINGLETON_ID = 1;
const TELEGRAM_TOKEN_PATTERN = /^\d{6,}:[A-Za-z0-9_-]{20,}$/;
const CHAT_ID_PATTERN = /^-?\d{5,20}$/;
const TOPIC_ID_PATTERN = /^\d{1,20}$/;

function cleanString(value) {
  const s = typeof value === "string" ? value.trim() : "";
  return s || null;
}

function cleanBool(value, fallback = false) {
  if (value === true || value === false) return value;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(s)) return true;
    if (["0", "false", "no", "off", ""].includes(s)) return false;
  }
  if (typeof value === "number") return value !== 0;
  return fallback;
}

function maskSecret(value) {
  if (!value) return "";
  if (value.length <= 8) return "*".repeat(value.length);
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

function defaultPolygonscanBaseUrl() {
  return cleanString(process.env.POLYGONSCAN_BASE_URL) || "https://polygonscan.com";
}

function createValidationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function normalizeTelegramToken(value, currentValue) {
  if (value === "") return null;
  const next = cleanString(value);
  if (next === null) return currentValue;
  if (!TELEGRAM_TOKEN_PATTERN.test(next)) {
    throw createValidationError("Token do bot Telegram invalido.");
  }
  return next;
}

function normalizeChatId(value, currentValue, label) {
  if (value === "") return null;
  const next = cleanString(value);
  if (next === null) return currentValue;
  if (!CHAT_ID_PATTERN.test(next)) {
    throw createValidationError(`${label} invalido.`);
  }
  return next;
}

function normalizeTopicId(value, currentValue) {
  if (value === "") return null;
  const next = cleanString(value);
  if (next === null) return currentValue;
  if (!TOPIC_ID_PATTERN.test(next)) {
    throw createValidationError("Topico do Telegram invalido.");
  }
  return next;
}

function normalizeBrowserExecutablePath(value, currentValue) {
  if (value === "") return null;
  const next = cleanString(value);
  if (next === null) return currentValue;
  if (!path.isAbsolute(next)) {
    throw createValidationError("O caminho do Chromium precisa ser absoluto.");
  }
  if (next.length > 512) {
    throw createValidationError("O caminho do Chromium excede o limite permitido.");
  }
  return next;
}

function normalizePolygonscanBaseUrl(value, currentValue) {
  if (value === "") return defaultPolygonscanBaseUrl();
  const next = cleanString(value);
  if (next === null) return cleanString(currentValue) || defaultPolygonscanBaseUrl();
  let url;
  try {
    url = new URL(next);
  } catch {
    throw createValidationError("URL base do Polygonscan invalida.");
  }
  if (url.protocol !== "https:") {
    throw createValidationError("A URL base do Polygonscan precisa usar HTTPS.");
  }
  if (!/polygonscan\.com$/i.test(url.hostname)) {
    throw createValidationError("Use um dominio do Polygonscan para as provas de saque.");
  }
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

function buildTxUrl(txHash, settings) {
  const base = cleanString(settings?.polygonscanBaseUrl) || defaultPolygonscanBaseUrl();
  return `${base.replace(/\/+$/, "")}/tx/${encodeURIComponent(String(txHash || "").trim())}`;
}

async function ensureSettingsRow() {
  const existing = await prisma.withdrawalTelegramSettings.findUnique({ where: { id: SINGLETON_ID } });
  if (existing) return existing;
  return prisma.withdrawalTelegramSettings.create({ data: { id: SINGLETON_ID } });
}

function toPublicSettings(row) {
  return {
    enabled: Boolean(row?.enabled),
    privateAlertsEnabled: Boolean(row?.privateAlertsEnabled),
    privateBotTokenMasked: maskSecret(cleanString(row?.privateBotToken) || ""),
    privateChatId: cleanString(row?.privateChatId) || "",
    publicProofsEnabled: Boolean(row?.publicProofsEnabled),
    publicBotTokenMasked: maskSecret(cleanString(row?.publicBotToken) || ""),
    publicChatId: cleanString(row?.publicChatId) || "",
    publicTopicId: cleanString(row?.publicTopicId) || "",
    captureEnabled: row?.captureEnabled !== false,
    browserExecutablePath: cleanString(row?.browserExecutablePath) || "",
    polygonscanBaseUrl: cleanString(row?.polygonscanBaseUrl) || defaultPolygonscanBaseUrl(),
    updatedAt: row?.updatedAt || null,
  };
}

export async function getWithdrawalTelegramSettings() {
  const row = await ensureSettingsRow();
  return toPublicSettings(row);
}

export async function updateWithdrawalTelegramSettings(input) {
  const current = await ensureSettingsRow();
  const enabled = cleanBool(input?.enabled, current.enabled);
  const privateAlertsEnabled = cleanBool(input?.privateAlertsEnabled, current.privateAlertsEnabled);
  const publicProofsEnabled = cleanBool(input?.publicProofsEnabled, current.publicProofsEnabled);
  const captureEnabled = cleanBool(input?.captureEnabled, current.captureEnabled);
  const privateBotToken = normalizeTelegramToken(input?.privateBotToken, current.privateBotToken);
  const publicBotToken = normalizeTelegramToken(input?.publicBotToken, current.publicBotToken);
  const privateChatId = normalizeChatId(input?.privateChatId, current.privateChatId, "Chat privado");
  const publicChatId = normalizeChatId(input?.publicChatId, current.publicChatId, "Chat publico");
  const publicTopicId = normalizeTopicId(input?.publicTopicId, current.publicTopicId);
  const browserExecutablePath = normalizeBrowserExecutablePath(input?.browserExecutablePath, current.browserExecutablePath);
  const polygonscanBaseUrl = normalizePolygonscanBaseUrl(input?.polygonscanBaseUrl, current.polygonscanBaseUrl);

  if (enabled && privateAlertsEnabled && (!privateBotToken || !privateChatId)) {
    throw createValidationError("Configure token e chat privado para alertas de saque.");
  }
  if (enabled && publicProofsEnabled && (!publicBotToken || !publicChatId)) {
    throw createValidationError("Configure token e chat publico para provas de saque.");
  }
  if (enabled && publicProofsEnabled && captureEnabled && browserExecutablePath) {
    // Path already validated; keep explicit branch to document the requirement.
  }

  const next = await prisma.withdrawalTelegramSettings.update({
    where: { id: SINGLETON_ID },
    data: {
      enabled,
      privateAlertsEnabled,
      privateBotToken,
      privateChatId,
      publicProofsEnabled,
      publicBotToken,
      publicChatId,
      publicTopicId,
      captureEnabled,
      browserExecutablePath,
      polygonscanBaseUrl,
    },
  });
  return toPublicSettings(next);
}

async function loadActiveSettings() {
  const row = await ensureSettingsRow();
  return row;
}

async function sendTelegramMessage({ botToken, chatId, threadId, text }) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const body = {
    chat_id: chatId,
    text,
    disable_web_page_preview: false,
  };
  if (threadId) body.message_thread_id = threadId;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`Telegram sendMessage failed (${res.status}): ${errorText}`);
  }
}

async function sendTelegramPhoto({ botToken, chatId, threadId, caption, filePath }) {
  const url = `https://api.telegram.org/bot${botToken}/sendPhoto`;
  const buffer = await fs.readFile(filePath);
  const form = new FormData();
  form.set("chat_id", chatId);
  if (threadId) form.set("message_thread_id", threadId);
  form.set("caption", caption);
  form.set("photo", new Blob([buffer], { type: "image/png" }), path.basename(filePath));
  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`Telegram sendPhoto failed (${res.status}): ${errorText}`);
  }
}

function formatDateTime(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: process.env.TZ || "UTC",
  }).format(date);
}

function buildPrivateAlertMessage(withdrawal, settings) {
  const username = withdrawal.user?.username || withdrawal.user?.email || `User #${withdrawal.userId}`;
  const lines = [
    "Novo saque solicitado",
    `Usuario: ${username}`,
    `Valor: ${Number(withdrawal.amount || 0).toFixed(4)} POL`,
    `Destino: ${withdrawal.address || "-"}`,
    `Data: ${formatDateTime(withdrawal.createdAt || withdrawal.created_at)}`,
  ];
  if (withdrawal.user?.email) lines.push(`Email: ${withdrawal.user.email}`);
  return lines.join("\n");
}

function buildProofCaption(withdrawal, txHash, settings) {
  const username = withdrawal.user?.username || withdrawal.user?.email || `User #${withdrawal.userId}`;
  const txUrl = buildTxUrl(txHash, settings);
  return [
    "Prova de saque",
    `Usuario: ${username}`,
    `Valor: ${Number(withdrawal.amount || 0).toFixed(4)} POL`,
    `Tx: ${txHash}`,
    `Link: ${txUrl}`,
    `Enviado: ${formatDateTime(withdrawal.completedAt || new Date())}`,
  ].join("\n");
}

async function capturePolygonscanScreenshot(txHash, settings) {
  const executablePath = cleanString(settings.browserExecutablePath) || undefined;
  const txUrl = buildTxUrl(txHash, settings);
  const tempPath = path.join(os.tmpdir(), `withdraw-${txHash.slice(0, 10)}-${Date.now()}.png`);
  const browser = await chromium.launch({
    headless: true,
    executablePath,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });
    await page.goto(txUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.screenshot({ path: tempPath, fullPage: true });
    return tempPath;
  } finally {
    await browser.close().catch(() => {});
  }
}

export async function notifyWithdrawalRequested(withdrawal) {
  try {
    const settings = await loadActiveSettings();
    if (!settings.enabled || !settings.privateAlertsEnabled) return false;
    const botToken = cleanString(settings.privateBotToken);
    const chatId = cleanString(settings.privateChatId);
    if (!botToken || !chatId) return false;
    await sendTelegramMessage({
      botToken,
      chatId,
      text: buildPrivateAlertMessage(withdrawal, settings),
    });
    return true;
  } catch (error) {
    logger.warn("notifyWithdrawalRequested failed", { error: error?.message || String(error), withdrawalId: withdrawal?.id || null });
    return false;
  }
}

export async function notifyWithdrawalCompleted(withdrawal) {
  let screenshotPath = null;
  try {
    const settings = await loadActiveSettings();
    if (!settings.enabled || !settings.publicProofsEnabled) return false;
    const botToken = cleanString(settings.publicBotToken);
    const chatId = cleanString(settings.publicChatId);
    const threadId = cleanString(settings.publicTopicId);
    const txHash = cleanString(withdrawal?.txHash);
    if (!botToken || !chatId || !txHash) return false;
    const caption = buildProofCaption(withdrawal, txHash, settings);
    if (settings.captureEnabled !== false) {
      screenshotPath = await capturePolygonscanScreenshot(txHash, settings);
    }
    if (screenshotPath) {
      await sendTelegramPhoto({ botToken, chatId, threadId, caption, filePath: screenshotPath });
    } else {
      await sendTelegramMessage({ botToken, chatId, threadId, text: caption });
    }
    return true;
  } catch (error) {
    logger.warn("notifyWithdrawalCompleted failed", { error: error?.message || String(error), withdrawalId: withdrawal?.id || null });
    return false;
  } finally {
    if (screenshotPath) {
      await fs.unlink(screenshotPath).catch(() => {});
    }
  }
}
