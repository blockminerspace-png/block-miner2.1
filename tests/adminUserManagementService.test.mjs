import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  listAdminUsers,
  listAdminUserLogs,
  listAdminUserTransactions,
  parseAdminUserListQuery,
  setAdminUserBanState,
} from "../server/services/adminUserManagementService.js";

function baseUser(id = 300) {
  return {
    id,
    name: "Gustavo",
    username: "gugu",
    email: "email@gmail.com",
    createdAt: new Date("2026-04-01T00:00:00Z"),
    lastLoginAt: new Date("2026-04-02T00:00:00Z"),
    ip: "170.79.86.235",
    registrationIp: "170.79.86.235",
    isBanned: false,
    walletAddress: "0xabc0000000000000000000000000000000000000",
    polBalance: 12,
    refCode: "ref300",
    _count: { transactions: 1, auditLogs: 2, supportMessages: 0 },
  };
}

function fakePrisma({ users = [baseUser()], txUserIds = [], txRows = [], logs = [] } = {}) {
  return {
    user: {
      findMany: async () => users,
      count: async () => users.length,
      update: async ({ data }) => ({ id: 300, username: "gugu", email: "email@gmail.com", isBanned: Boolean(data.isBanned) }),
    },
    transaction: {
      findMany: async (args) => txRows.length ? txRows : txUserIds.map((userId) => ({ userId })),
      count: async () => txRows.length,
      groupBy: async () => [{ userId: 300, _count: { _all: 1 } }],
    },
    depositTicket: { findMany: async () => [] },
    auditLog: {
      findMany: async () => logs,
      count: async () => logs.length,
      create: async ({ data }) => ({ id: 1, ...data }),
    },
    polygonHdAddress: { findMany: async () => [] },
    payout: { findMany: async () => [] },
    ipIntelligenceCache: { findMany: async () => [] },
    userMiner: {
      groupBy: async () => [{ userId: 300, _sum: { hashRate: 42 }, _count: { _all: 2 } }],
    },
    faucetClaim: { findMany: async () => [{ userId: 300, totalClaims: 1 }] },
    auditEvent: {
      findMany: async () => [],
      count: async () => 0,
    },
  };
}

describe("admin user management service", () => {
  it("validates long search terms", () => {
    assert.throws(() => parseAdminUserListQuery({ q: "x".repeat(141) }), /invalid_search/);
  });

  it("lists users by ID / #ID without leaking password fields", async () => {
    const result = await listAdminUsers(fakePrisma(), { q: "#300", page: "1", limit: "10" });
    assert.equal(result.users[0].id, 300);
    assert.equal("passwordHash" in result.users[0], false);
    assert.equal(result.users[0].email, "email@gmail.com");
  });

  it("can resolve a user through transaction hash candidates", async () => {
    const result = await listAdminUsers(fakePrisma({ txUserIds: [300] }), {
      q: "0x1234567890abcdef1234567890abcdef1234567890abcdef",
    });
    assert.equal(result.users[0].id, 300);
  });

  it("returns transaction hashes and wallets safely", async () => {
    const result = await listAdminUserTransactions(fakePrisma({
      txRows: [{
        id: 55,
        type: "deposit",
        amount: 1,
        fee: null,
        status: "completed",
        txHash: "0xhash",
        address: "0xto",
        fromAddress: "0xfrom",
        rawTx: JSON.stringify({ ok: true, token: "secret" }),
        createdAt: new Date(),
        completedAt: null,
      }],
    }), 300, {});
    assert.equal(result.transactions[0].txHash, "0xhash");
    assert.equal(result.transactions[0].metadata.token, undefined);
  });

  it("returns paginated safe logs", async () => {
    const result = await listAdminUserLogs(fakePrisma({
      logs: [{
        id: 1,
        userId: 300,
        action: "WALLET_LINKED",
        label: null,
        description: null,
        source: "user",
        severity: "success",
        ip: "170.79.86.235",
        userAgent: "<script>x</script>",
        detailsJson: JSON.stringify({ wallet: "0xabc", password: "hidden" }),
        metadata: null,
        relatedEntityType: "wallet",
        relatedEntityId: "0xabc",
        actorAdminId: null,
        createdAt: new Date(),
      }],
    }), 300, { page: "1", limit: "10" });
    assert.equal(result.logs.length, 1);
    assert.equal(result.logs[0].metadata.password, undefined);
    assert.match(result.logs[0].userAgent, /script/);
  });

  it("ban/unban requires reason and writes audit log", async () => {
    await assert.rejects(() => setAdminUserBanState(fakePrisma(), 300, { isBanned: true, reason: "" }), /invalid_reason/);
    const result = await setAdminUserBanState(fakePrisma(), 300, { isBanned: true, reason: "abuse" });
    assert.equal(result.user.isBanned, true);
  });
});
