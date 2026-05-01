import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDeviceFingerprint,
  evaluateRegistrationAttempt,
  getAuthIpContext,
} from "../server/services/authNetworkSignalService.js";

describe("auth network signal service", () => {
  it("builds a stable device fingerprint from the anti-bot payload", () => {
    const req = {
      headers: {
        "x-anti-bot-payload": Buffer.from(JSON.stringify({
          tz: "America/Sao_Paulo",
          l: "pt-BR",
          p: "Win32",
          hc: 8,
          dm: 8,
          tp: 0,
          s: { width: 1920, height: 1080, dpr: 1, colorDepth: 24 },
          b: false,
          v: "5.1",
        })).toString("base64"),
      },
    };

    const a = buildDeviceFingerprint(req);
    const b = buildDeviceFingerprint(req);
    assert.equal(a, b);
    assert.notEqual(a, "unknown");
  });

  it("uses cached IP intelligence when present and derives IPv6 /64 otherwise", async () => {
    const prisma = {
      ipIntelligenceCache: {
        findUnique: async () => ({ ip: "203.0.113.9", asn: 64512, providerType: "hosting", networkCidr: null }),
      },
    };
    const cached = await getAuthIpContext(prisma, "203.0.113.9");
    assert.equal(cached.asn, 64512);
    assert.equal(cached.providerType, "hosting");

    const derived = await getAuthIpContext({ ipIntelligenceCache: { findUnique: async () => null } }, "2001:db8:abcd:12::5");
    assert.equal(derived.networkCidr, "2001:db8:abcd:12::/64");
  });

  it("blocks repeated recent registrations by the same fingerprint or risky IP burst", async () => {
    const prisma = {
      userIpLog: {
        count: async ({ where }) => {
          if (where.deviceFingerprint === "fp-1") return 2;
          if (where.ip === "203.0.113.7") return 1;
          return 0;
        },
      },
    };

    const byFingerprint = await evaluateRegistrationAttempt(prisma, {
      ip: "198.51.100.8",
      networkCidr: null,
      providerType: "unknown",
      deviceFingerprint: "fp-1",
      now: new Date("2026-04-27T20:00:00Z"),
    });
    assert.equal(byFingerprint.allowed, false);
    assert.ok(byFingerprint.reasons.some((reason) => reason.includes("fingerprint")));

    const byHostingIp = await evaluateRegistrationAttempt(prisma, {
      ip: "203.0.113.7",
      networkCidr: null,
      providerType: "hosting",
      deviceFingerprint: "unknown",
      now: new Date("2026-04-27T20:00:00Z"),
    });
    assert.equal(byHostingIp.allowed, false);
    assert.ok(byHostingIp.reasons.some((reason) => reason.includes("Hosting/VPN")));
  });
});
