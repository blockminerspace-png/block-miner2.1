/**
 * Alertmanager webhook → Telegram + Discord (ENV only, no hardcoded tokens).
 */
import http from "node:http";

const PORT = Number.parseInt(String(process.env.NOTIFIER_PORT || "8080"), 10) || 8080;
const TELEGRAM_BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
const TELEGRAM_CHAT_ID = String(process.env.TELEGRAM_CHAT_ID || "").trim();
const DISCORD_WEBHOOK_URL = String(process.env.DISCORD_WEBHOOK_URL || "").trim();

function formatTelegramMessage(payload) {
  const lines = [];
  const status = payload.status === "resolved" ? "✅ RESOLVED" : "🚨 FIRING";
  lines.push(`${status} — BlockMiner`);
  for (const alert of payload.alerts || []) {
    const name = alert.labels?.alertname || "Alert";
    const sev = alert.labels?.severity || "unknown";
    const comp = alert.labels?.component || "";
    lines.push(`\n*${name}* (${sev})`);
    if (comp) lines.push(`Component: ${comp}`);
    if (alert.annotations?.summary) lines.push(alert.annotations.summary);
    if (alert.annotations?.description) lines.push(alert.annotations.description);
  }
  return lines.join("\n");
}

function formatDiscordEmbed(payload) {
  const color = payload.status === "resolved" ? 0x22c55e : 0xef4444;
  const embeds = (payload.alerts || []).slice(0, 10).map((alert) => ({
    title: alert.labels?.alertname || "Alert",
    description: [alert.annotations?.summary, alert.annotations?.description].filter(Boolean).join("\n"),
    color,
    fields: [
      { name: "Severity", value: alert.labels?.severity || "—", inline: true },
      { name: "Component", value: alert.labels?.component || "—", inline: true },
      { name: "Status", value: payload.status || "—", inline: true },
    ],
  }));
  return {
    username: "BlockMiner Alerts",
    embeds,
  };
}

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("[notifier] telegram failed", res.status, body);
  }
}

async function sendDiscord(payload) {
  if (!DISCORD_WEBHOOK_URL) return;
  const res = await fetch(DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(formatDiscordEmbed(payload)),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("[notifier] discord failed", res.status, body);
  }
}

async function handleAlert(payload) {
  const text = formatTelegramMessage(payload);
  await Promise.all([sendTelegram(text), sendDiscord(payload)]);
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        telegram: Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID),
        discord: Boolean(DISCORD_WEBHOOK_URL),
      }),
    );
    return;
  }

  if (req.method === "POST" && req.url === "/alerts") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    try {
      const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      await handleAlert(payload);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      console.error("[notifier] parse error", e);
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false }));
    }
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[notifier] listening on :${PORT}`);
});
