/**
 * Lightweight Telegram bot for support notifications.
 *
 * - Long-polls `getUpdates` to capture chat IDs from users that send `/start` to the bot.
 * - Persists subscribed chat IDs in a JSON file (survives restarts).
 * - Exposes `notifyNewSupportTicket(...)` which fans out to all subscribed chats.
 *
 * Env:
 *   SUPPORT_TELEGRAM_BOT_TOKEN     — bot token (required to enable)
 *   SUPPORT_TELEGRAM_CHAT_STORE    — optional override for the JSON file path
 *   SUPPORT_TELEGRAM_POLL_INTERVAL — optional poll interval (seconds, default 5)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { resolveUploadsRoot } from "../utils/uploadsRoot.js";
import loggerNs from "../utils/logger.js";

const log = loggerNs.child("SupportTelegramNotifier");

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
  const override = process.env.SUPPORT_TELEGRAM_CHAT_STORE?.trim();
  if (override) return path.resolve(override);
  return path.join(resolveUploadsRoot(__dirname), "support-telegram-chats.json");
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
  const t = process.env.SUPPORT_TELEGRAM_BOT_TOKEN?.trim();
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
              text: "✅ Pronto! Você vai receber aqui notificações de novos tickets de suporte do BlockMiner.",
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
              text: "🔕 Você não receberá mais notificações de tickets neste chat.",
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
  const intervalSec = Math.max(1, Number(process.env.SUPPORT_TELEGRAM_POLL_INTERVAL || 5) || 5);
  pollTimer = setTimeout(() => {
    void pollOnce().finally(() => scheduleNext());
  }, intervalSec * 1000);
}

export function startSupportTelegramNotifier(): void {
  if (started) return;
  if (!getToken()) {
    log.info("SUPPORT_TELEGRAM_BOT_TOKEN not set; support Telegram notifier disabled.");
    return;
  }
  storePath = resolveStorePath();
  loadStore();
  started = true;
  log.info("Support Telegram notifier started", { storePath, chatsRegistered: Object.keys(chatStore.chats).length });
  void pollOnce().finally(() => scheduleNext());
}

export function stopSupportTelegramNotifier(): void {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
  started = false;
}

function escapeMd(value: string): string {
  return value.replace(/([_*`\[\]()~>#+\-=|{}.!\\])/g, "\\$1");
}

type SupportTicketSummary = {
  id: number;
  name?: string | null;
  email?: string | null;
  subject?: string | null;
  body?: string | null;
  userId?: number | null;
  username?: string | null;
};

export function notifyNewSupportTicket(ticket: SupportTicketSummary): void {
  if (!started || !getToken()) return;
  const chatIds = Object.keys(chatStore.chats);
  if (!chatIds.length) return;

  const subject = (ticket.subject || "(sem assunto)").slice(0, 180);
  const bodyPreview = (ticket.body || "").slice(0, 500);
  const userLabel = ticket.username
    ? `@${ticket.username}`
    : ticket.userId
    ? `#${ticket.userId}`
    : "convidado";

  const lines = [
    `🆘 *Novo ticket de suporte* #${ticket.id}`,
    `*Assunto:* ${escapeMd(subject)}`,
    `*Usuário:* ${escapeMd(userLabel)}`,
    ticket.name ? `*Nome:* ${escapeMd(ticket.name)}` : null,
    ticket.email ? `*E-mail:* ${escapeMd(ticket.email)}` : null,
    bodyPreview ? `\n${escapeMd(bodyPreview)}` : null,
  ].filter(Boolean);

  const text = lines.join("\n");

  for (const chatId of chatIds) {
    void tgApi("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "MarkdownV2",
      disable_web_page_preview: true,
    }).catch((err) => {
      log.warn("Failed to send Telegram notification", {
        chatId,
        err: err instanceof Error ? err.message : String(err),
      });
    });
  }
}
