/**
 * Lightweight Telegram bot for VIDEO moderation notifications.
 *
 * Completely separate from the support-tickets bot:
 *   - own bot token   (VIDEO_TELEGRAM_BOT_TOKEN)
 *   - own chat store  (video-telegram-chats.json)
 *   - own poll loop
 *
 * Flow:
 *   - Long-polls `getUpdates` so the admin captures the chat id by sending `/start`.
 *   - `notifyNewVideoSubmission(...)` fans out to every subscribed chat.
 *
 * Env:
 *   VIDEO_TELEGRAM_BOT_TOKEN     — bot token (required to enable)
 *   VIDEO_TELEGRAM_CHAT_STORE    — optional override for the JSON file path
 *   VIDEO_TELEGRAM_POLL_INTERVAL — optional poll interval (seconds, default 5)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { resolveUploadsRoot } from "../utils/uploadsRoot.js";
import loggerNs from "../utils/logger.js";

const log = loggerNs.child("VideoTelegramNotifier");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type ChatStore = {
  chats: Record<string, { registeredAt: string; firstName?: string; username?: string }>;
  lastUpdateId: number;
};

let chatStore: ChatStore = { chats: {}, lastUpdateId: 0 };
let started = false;
let pollTimer: NodeJS.Timeout | null = null;
let storePath = "";

function resolveStorePath(): string {
  const override = process.env.VIDEO_TELEGRAM_CHAT_STORE?.trim();
  if (override) return path.resolve(override);
  return path.join(resolveUploadsRoot(__dirname), "video-telegram-chats.json");
}

function loadStore(): void {
  try {
    if (fs.existsSync(storePath)) {
      const raw = fs.readFileSync(storePath, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        chatStore = {
          chats: parsed.chats && typeof parsed.chats === "object" ? parsed.chats : {},
          lastUpdateId: Number(parsed.lastUpdateId) || 0,
        };
      }
    }
  } catch (err) {
    log.warn("Failed to load chat store", { err: err instanceof Error ? err.message : String(err) });
  }
}

function persistStore(): void {
  try {
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(storePath, JSON.stringify(chatStore, null, 2), "utf8");
  } catch (err) {
    log.warn("Failed to persist chat store", { err: err instanceof Error ? err.message : String(err) });
  }
}

function getToken(): string | null {
  const t = process.env.VIDEO_TELEGRAM_BOT_TOKEN?.trim();
  return t || null;
}

async function tgApi(method: string, payload: Record<string, unknown>): Promise<unknown> {
  const token = getToken();
  if (!token) return null;
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Telegram ${method} failed: ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

type TelegramUpdate = {
  update_id: number;
  message?: {
    chat: { id: number; type: string; first_name?: string; username?: string };
    text?: string;
    from?: { first_name?: string; username?: string };
  };
};

async function pollOnce(): Promise<void> {
  const token = getToken();
  if (!token) return;
  try {
    const url = `https://api.telegram.org/bot${token}/getUpdates?timeout=20&offset=${chatStore.lastUpdateId + 1}`;
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) return;
    const json = (await res.json()) as { ok: boolean; result?: TelegramUpdate[] };
    if (!json.ok || !Array.isArray(json.result)) return;
    let changed = false;
    for (const upd of json.result) {
      if (typeof upd.update_id === "number" && upd.update_id > chatStore.lastUpdateId) {
        chatStore.lastUpdateId = upd.update_id;
        changed = true;
      }
      const msg = upd.message;
      if (!msg || !msg.chat) continue;
      const text = (msg.text || "").trim().toLowerCase();
      const chatId = String(msg.chat.id);
      if (text.startsWith("/start")) {
        if (!chatStore.chats[chatId]) {
          chatStore.chats[chatId] = {
            registeredAt: new Date().toISOString(),
            firstName: msg.chat.first_name || msg.from?.first_name,
            username: msg.chat.username || msg.from?.username,
          };
          changed = true;
          try {
            await tgApi("sendMessage", {
              chat_id: msg.chat.id,
              text: "🎬 Pronto! Você vai receber aqui os avisos de novos vídeos para moderar no BlockMiner.",
            });
          } catch (e) {
            log.warn("Failed to send /start ack", { err: e instanceof Error ? e.message : String(e) });
          }
        }
      } else if (text.startsWith("/stop")) {
        if (chatStore.chats[chatId]) {
          delete chatStore.chats[chatId];
          changed = true;
          try {
            await tgApi("sendMessage", {
              chat_id: msg.chat.id,
              text: "🔕 Você não receberá mais avisos de vídeos neste chat.",
            });
          } catch {
            /* ignore */
          }
        }
      }
    }
    if (changed) persistStore();
  } catch (err) {
    log.debug("getUpdates poll error", { err: err instanceof Error ? err.message : String(err) });
  }
}

function scheduleNext(): void {
  const intervalSec = Math.max(1, Number(process.env.VIDEO_TELEGRAM_POLL_INTERVAL || 5) || 5);
  pollTimer = setTimeout(() => {
    void pollOnce().finally(() => scheduleNext());
  }, intervalSec * 1000);
}

export function startVideoTelegramNotifier(): void {
  if (started) return;
  if (!getToken()) {
    log.info("VIDEO_TELEGRAM_BOT_TOKEN not set; video Telegram notifier disabled.");
    return;
  }
  storePath = resolveStorePath();
  loadStore();
  started = true;
  log.info("Video Telegram notifier started", { storePath, chatsRegistered: Object.keys(chatStore.chats).length });
  void pollOnce().finally(() => scheduleNext());
}

export function stopVideoTelegramNotifier(): void {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
  started = false;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

type VideoSubmissionSummary = {
  id: number;
  userId: number;
  username?: string | null;
  videoId?: string | null;
  videoUrl?: string | null;
  title?: string | null;
};

type PublicSupportTicketSummary = {
  id: number;
  guestName?: string | null;
  guestEmail?: string | null;
  subject?: string | null;
  message?: string | null;
};

type SupportReplySummary = {
  ticketId: number;
  subject?: string | null;
  username?: string | null;
  userId?: number | null;
  message?: string | null;
};

export function notifyNewVideoSubmission(video: VideoSubmissionSummary): void {
  if (!started || !getToken()) return;
  const chatIds = Object.keys(chatStore.chats);
  if (!chatIds.length) return;

  const userLabel = video.username ? `@${video.username}` : `#${video.userId}`;
  const title = (video.title || "(sem título)").slice(0, 180);
  const watchUrl = video.videoId
    ? `https://youtu.be/${video.videoId}`
    : escapeHtml(video.videoUrl || "(sem url)");

  const lines = [
    `🎬 <b>Novo vídeo para moderar</b> #${video.id}`,
    `<b>Canal:</b> ${escapeHtml(userLabel)}`,
    `<b>Título:</b> ${escapeHtml(title)}`,
    `<b>Assistir:</b> ${watchUrl}`,
  ];

  const text = lines.join("\n");

  for (const chatId of chatIds) {
    void tgApi("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: false,
    }).catch((err) => {
      log.warn("Failed to send Telegram video notification", {
        chatId,
        err: err instanceof Error ? err.message : String(err),
      });
    });
  }
}

/**
 * Notifica todos os chats inscritos sobre um NOVO chamado de suporte publico
 * (pré-login). Mesmo bot/store do notifier de videos, para o admin receber
 * vídeos + chamados num único chat (@BlockMinerOperacionalBot).
 */
export function notifyNewPublicSupportTicket(ticket: PublicSupportTicketSummary): void {
  if (!started || !getToken()) return;
  const chatIds = Object.keys(chatStore.chats);
  if (!chatIds.length) return;

  const subject = (ticket.subject || "(sem assunto)").slice(0, 180);
  const msgPreview = (ticket.message || "").slice(0, 500);

  const lines = [
    `🆘 <b>Novo chamado de suporte</b> #${ticket.id}`,
    `<b>Assunto:</b> ${escapeHtml(subject)}`,
    ticket.guestName ? `<b>Nome:</b> ${escapeHtml(ticket.guestName.slice(0, 80))}` : null,
    ticket.guestEmail ? `<b>E-mail:</b> ${escapeHtml(ticket.guestEmail.slice(0, 120))}` : null,
    msgPreview ? `\n${escapeHtml(msgPreview)}` : null,
  ].filter(Boolean);

  const text = lines.join("\n");

  for (const chatId of chatIds) {
    void tgApi("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }).catch((err) => {
      log.warn("Failed to send Telegram public support notification", {
        chatId,
        err: err instanceof Error ? err.message : String(err),
      });
    });
  }
}

/**
 * Notifica quando um usuário LOGADO responde a um ticket de suporte existente
 * (atividade nova num ticket que pode já estar "Respondido"). Mesmo bot/store
 * dos avisos operacionais.
 */
export function notifySupportReply(reply: SupportReplySummary): void {
  if (!started || !getToken()) return;
  const chatIds = Object.keys(chatStore.chats);
  if (!chatIds.length) return;

  const subject = (reply.subject || "(sem assunto)").slice(0, 120);
  const userLabel = reply.username ? `@${reply.username}` : reply.userId ? `#${reply.userId}` : "usuário";
  const msgPreview = (reply.message || "").slice(0, 500);

  const lines = [
    `💬 <b>Nova resposta no ticket</b> #${reply.ticketId}`,
    `<b>Usuário:</b> ${escapeHtml(userLabel)}`,
    `<b>Assunto:</b> ${escapeHtml(subject)}`,
    msgPreview ? `\n${escapeHtml(msgPreview)}` : null,
  ].filter(Boolean);

  const text = lines.join("\n");

  for (const chatId of chatIds) {
    void tgApi("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }).catch((err) => {
      log.warn("Failed to send Telegram support reply notification", {
        chatId,
        err: err instanceof Error ? err.message : String(err),
      });
    });
  }
}
