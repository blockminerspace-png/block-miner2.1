import test from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ||= "postgresql://user:pass@127.0.0.1:1/db?schema=public";
process.env.POLYGONSCAN_BASE_URL = "https://polygonscan.com";

const worker = await import("../services/telegram-proof-worker/telegramProofWorker.js");
const { TELEGRAM_EVENT_TYPES } = await import("../server/services/withdrawalTelegramService.js");

test("Telegram sendMessage payload preserves string chat id and includes thread id", async () => {
  let captured;
  await worker.sendTelegramMessage({
    botToken: "123456:abcdefghijklmnopqrstuvwxyz",
    chatId: "-1003734849036",
    threadId: 42,
    text: "hello",
    fetchImpl: async (_method, _token, body) => {
      captured = JSON.parse(body.body);
      return { ok: true };
    },
  });
  assert.equal(captured.chat_id, "-1003734849036");
  assert.equal(captured.message_thread_id, 42);
});

test("public proof falls back to sendMessage when screenshot capture fails", async () => {
  const sent = [];
  const result = await worker.processTelegramEvent(
    {
      id: 9,
      type: TELEGRAM_EVENT_TYPES.WITHDRAWAL_COMPLETED_PUBLIC_PROOF,
      txHash: "0x" + "cd".repeat(32),
      amount: "10.5",
      currency: "POL",
      usernameSnapshot: "alice",
      transactionId: 123,
      payload: { username: "alice", completedAt: "2026-04-24T10:50:00Z" },
      createdAt: new Date("2026-04-24T10:50:00Z"),
    },
    {
      botToken: "123456:abcdefghijklmnopqrstuvwxyz",
      publicChatId: "-1003734849036",
      publicThreadId: 42,
      screenshotEnabled: true,
      captureFn: async () => { throw new Error("browser timeout"); },
      sendMessageFn: async (payload) => sent.push({ kind: "message", payload }),
      sendPhotoFn: async (payload) => sent.push({ kind: "photo", payload }),
    },
  );
  assert.deepEqual(result, { sent: true, screenshot: false });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].kind, "message");
  assert.equal(sent[0].payload.threadId, 42);
  assert.match(sent[0].payload.text, /Polygonscan: https:\/\/polygonscan\.com\/tx\/0x/);
});

test("backoff grows and is capped", () => {
  assert.equal(worker.computeBackoffMs(1), 30_000);
  assert.equal(worker.computeBackoffMs(99), 3_600_000);
});
