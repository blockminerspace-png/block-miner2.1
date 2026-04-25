import test from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ||= "postgresql://user:pass@127.0.0.1:1/db?schema=public";
process.env.TELEGRAM_BOT_TOKEN = "123456:abcdefghijklmnopqrstuvwxyz";
process.env.TELEGRAM_PRIVATE_WITHDRAWAL_ALERT_CHAT_ID = "-1003734849036";
process.env.TELEGRAM_PUBLIC_PROOF_CHAT_ID = "-1003734849036";
process.env.TELEGRAM_PUBLIC_PROOF_THREAD_ID = "42";
process.env.TELEGRAM_WITHDRAWAL_ALERTS_ENABLED = "true";
process.env.TELEGRAM_PUBLIC_PROOFS_ENABLED = "true";

const service = await import("../server/services/withdrawalTelegramService.js");

test("preserves Telegram channel chat id as string", () => {
  assert.equal(service.normalizeChatId("-1003734849036"), "-1003734849036");
});

test("validates message_thread_id as safe integer", () => {
  assert.equal(service.normalizeThreadId("42"), 42);
  assert.throws(() => service.normalizeThreadId("-1"), /message_thread_id/);
});

test("rejects invalid txHash and builds safe Polygonscan URL for valid hash", () => {
  assert.equal(service.isValidPolygonTxHash("0x" + "ab".repeat(32)), true);
  assert.equal(service.isValidPolygonTxHash("https://evil.test/tx/0x" + "ab".repeat(32)), false);
  assert.equal(
    service.buildPolygonscanTxUrl("0x" + "ab".repeat(32), "https://polygonscan.com/path?q=1"),
    `https://polygonscan.com/tx/0x${"ab".repeat(32)}`,
  );
});

test("outbox creation is idempotent by transaction/type and keeps chat ids out of payload", async () => {
  const calls = [];
  const tx = {
    telegramOutboxEvent: {
      upsert: async (arg) => {
        calls.push(arg);
        return { id: 1 };
      },
    },
  };
  await service.createTelegramOutboxEventTx(tx, service.TELEGRAM_EVENT_TYPES.WITHDRAWAL_REQUESTED_PRIVATE_ALERT, {
    id: 123,
    userId: 7,
    amount: "10.5",
    address: "0x" + "11".repeat(20),
    status: "pending",
    createdAt: new Date("2026-04-24T10:50:00Z"),
    user: { id: 7, username: "alice", email: "alice@example.com", ip: "127.0.0.1" },
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].where, {
    transactionId_type: {
      transactionId: 123,
      type: service.TELEGRAM_EVENT_TYPES.WITHDRAWAL_REQUESTED_PRIVATE_ALERT,
    },
  });
  assert.equal(calls[0].create.destinationWallet, "0x" + "11".repeat(20));
  assert.equal(JSON.stringify(calls[0].create.payload).includes("123456:"), false);
  assert.equal(JSON.stringify(calls[0].create.payload).includes("-1003734849036"), false);
});
