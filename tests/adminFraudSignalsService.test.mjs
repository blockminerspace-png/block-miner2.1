import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  listAdminFraudSignals,
  resetAdminFraudCollectionData,
  ADMIN_FRAUD_COLLECTION_RESET_CONFIRM,
} from "#server/services/adminFraudSignalsService.js";

function fakePrisma({ queryResults = [], cachedIntel = [] } = {}) {
  const queue = [...queryResults];
  return {
    $queryRaw: async () => queue.shift() || [],
    ipIntelligenceCache: {
      findMany: async () => cachedIntel,
      findUnique: async () => null,
      upsert: async ({ create }) => create,
    },
  };
}

describe("admin fraud signals derived network grouping", () => {
  it("groups IPv6 users by shared /64 subnet even when exact IPs differ", async () => {
    const prisma = fakePrisma({
      queryResults: [
        [],
        [],
        [],
        [
          {
            id: 1,
            username: "u1",
            email: "u1@example.com",
            walletAddress: null,
            userAgent: "ua-1",
            createdAt: new Date("2026-04-20T10:00:00Z"),
            lastLoginAt: new Date("2026-04-21T10:00:00Z"),
            key: "2001:db8:abcd:12::1",
          },
          {
            id: 2,
            username: "u2",
            email: "u2@example.com",
            walletAddress: null,
            userAgent: "ua-2",
            createdAt: new Date("2026-04-20T11:00:00Z"),
            lastLoginAt: new Date("2026-04-21T11:00:00Z"),
            key: "2001:db8:abcd:12::99",
          },
        ],
        [],
      ],
    });

    const result = await listAdminFraudSignals(prisma, { scope: "ip_network" });
    assert.equal(result.signals.length, 1);
    assert.equal(result.signals[0].signalType, "ip_network");
    assert.equal(result.signals[0].value, "2001:db8:abcd:12::/64");
    assert.equal(result.signals[0].userCount, 2);
  });

  it("groups accounts by cached ASN/provider across different exact IPs", async () => {
    const prisma = fakePrisma({
      queryResults: [
        [],
        [],
        [],
        [
          {
            id: 3,
            username: "a1",
            email: "a1@example.com",
            walletAddress: null,
            userAgent: "ua-a",
            createdAt: new Date("2026-04-20T10:00:00Z"),
            lastLoginAt: new Date("2026-04-21T10:00:00Z"),
            key: "203.0.113.10",
          },
          {
            id: 4,
            username: "a2",
            email: "a2@example.com",
            walletAddress: null,
            userAgent: "ua-b",
            createdAt: new Date("2026-04-20T11:00:00Z"),
            lastLoginAt: new Date("2026-04-21T11:00:00Z"),
            key: "203.0.113.11",
          },
        ],
        [],
      ],
      cachedIntel: [
        {
          ip: "203.0.113.10",
          ipVersion: 4,
          reverseDns: null,
          reverseDnsForwardConfirmed: null,
          asn: 64512,
          asnOrg: "Example Hosting",
          networkCidr: null,
          providerLabel: "Datacenter/hosting",
          providerType: "hosting",
          confidence: "medium",
          source: "cache",
          error: null,
          checkedAt: new Date("2026-04-21T10:00:00Z"),
          expiresAt: new Date("2026-05-01T10:00:00Z"),
        },
        {
          ip: "203.0.113.11",
          ipVersion: 4,
          reverseDns: null,
          reverseDnsForwardConfirmed: null,
          asn: 64512,
          asnOrg: "Example Hosting",
          networkCidr: null,
          providerLabel: "Datacenter/hosting",
          providerType: "hosting",
          confidence: "medium",
          source: "cache",
          error: null,
          checkedAt: new Date("2026-04-21T10:00:00Z"),
          expiresAt: new Date("2026-05-01T10:00:00Z"),
        },
      ],
    });

    const result = await listAdminFraudSignals(prisma, { scope: "asn" });
    assert.equal(result.signals.length, 1);
    assert.equal(result.signals[0].signalType, "asn");
    assert.equal(result.signals[0].value, "AS64512");
    assert.equal(result.signals[0].userCount, 2);
  });

  it("groups shared device fingerprints from historical auth logs", async () => {
    const prisma = fakePrisma({
      queryResults: [
        [
          {
            id: 7,
            username: "d1",
            email: "d1@example.com",
            walletAddress: null,
            userAgent: "ua-1",
            createdAt: new Date("2026-04-20T10:00:00Z"),
            lastLoginAt: new Date("2026-04-21T10:00:00Z"),
            key: "fp-abc",
          },
          {
            id: 8,
            username: "d2",
            email: "d2@example.com",
            walletAddress: null,
            userAgent: "ua-2",
            createdAt: new Date("2026-04-20T11:00:00Z"),
            lastLoginAt: new Date("2026-04-21T11:00:00Z"),
            key: "fp-abc",
          },
        ],
      ],
    });

    const result = await listAdminFraudSignals(prisma, { scope: "devices" });
    assert.equal(result.signals.length, 1);
    assert.equal(result.signals[0].signalType, "device_fingerprint");
    assert.equal(result.signals[0].value, "fp-abc");
    assert.ok(["medium", "high", "critical"].includes(result.signals[0].riskLevel));
    assert.equal(typeof result.signals[0].decision, "object");
    assert.ok(Array.isArray(result.signals[0].identityVectors));
  });
});

describe("resetAdminFraudCollectionData", () => {
  it("deletes ip_logs and ip_intelligence_cache and clears profile IP/UA inside a transaction", async () => {
    const order = [];
    const prisma = {
      $transaction: async (fn) =>
        fn({
          userIpLog: {
            deleteMany: async () => {
              order.push("logs");
              return { count: 7 };
            },
          },
          ipIntelligenceCache: {
            deleteMany: async () => {
              order.push("cache");
              return { count: 2 };
            },
          },
          user: {
            updateMany: async ({ where, data }) => {
              order.push("profile");
              assert.ok(where?.OR);
              assert.equal(data.registrationIp, null);
              assert.equal(data.ip, null);
              assert.equal(data.userAgent, null);
              return { count: 5 };
            },
          },
        }),
    };
    const r = await resetAdminFraudCollectionData(prisma);
    assert.deepEqual(order, ["logs", "cache", "profile"]);
    assert.equal(r.ipLogsDeleted, 7);
    assert.equal(r.ipIntelDeleted, 2);
    assert.equal(r.usersProfileAntiFraudCleared, 5);
  });

  it("exposes a stable confirmation token for the admin API", () => {
    assert.equal(ADMIN_FRAUD_COLLECTION_RESET_CONFIRM, "RESET_FRAUD_COLLECTION");
  });
});
