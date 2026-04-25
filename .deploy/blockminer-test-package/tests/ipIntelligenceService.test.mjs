import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { enrichIp, getCachedIpIntelligence } from "../server/services/ipIntelligenceService.js";

const oldEnv = { ...process.env };

afterEach(() => {
  for (const key of ["IP_ASN_PROVIDER", "IPINFO_TOKEN"]) {
    if (oldEnv[key] === undefined) delete process.env[key];
    else process.env[key] = oldEnv[key];
  }
});

function resolver({ reverse = [], lookup = [] } = {}) {
  return {
    reverse: async () => reverse,
    lookup: async () => lookup,
  };
}

describe("IP intelligence enrichment", () => {
  it("handles reverse DNS and forward-confirmed PTR", async () => {
    const result = await enrichIp("203.0.113.9", {
      resolver: resolver({
        reverse: ["customer.example-telecom.net"],
        lookup: [{ address: "203.0.113.9" }],
      }),
    });
    assert.equal(result.reverseDns, "customer.example-telecom.net");
    assert.equal(result.reverseDnsForwardConfirmed, true);
    assert.equal(result.providerType, "residential");
  });

  it("returns false for forward-confirmed mismatch", async () => {
    const result = await enrichIp("203.0.113.9", {
      resolver: resolver({
        reverse: ["host.example.net"],
        lookup: [{ address: "203.0.113.10" }],
      }),
    });
    assert.equal(result.reverseDnsForwardConfirmed, false);
  });

  it("does not fail when reverse DNS has no PTR", async () => {
    const result = await enrichIp("203.0.113.9", {
      resolver: { reverse: async () => { throw new Error("ENOTFOUND"); }, lookup: async () => [] },
    });
    assert.equal(result.reverseDns, null);
    assert.equal(result.providerType, "unknown");
  });

  it("uses optional ASN provider and classifies hosting", async () => {
    process.env.IP_ASN_PROVIDER = "ipinfo";
    process.env.IPINFO_TOKEN = "test-token";
    const result = await enrichIp("8.8.8.8", {
      resolver: resolver({ reverse: ["dns.google"], lookup: [{ address: "8.8.8.8" }] }),
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ org: "AS15169 Google LLC" }),
      }),
    });
    assert.equal(result.asn, 15169);
    assert.equal(result.asnOrg, "Google LLC");
    assert.equal(result.providerType, "hosting");
  });

  it("caches hits and refreshes expired rows", async () => {
    let upserted = null;
    const future = new Date(Date.now() + 10000);
    const prisma = {
      ipIntelligenceCache: {
        findUnique: async () => upserted || { ip: "203.0.113.9", ipVersion: 4, providerType: "mobile", confidence: "medium", checkedAt: new Date(), expiresAt: future },
        upsert: async ({ create }) => { upserted = create; return create; },
      },
    };
    const hit = await getCachedIpIntelligence(prisma, "203.0.113.9");
    assert.equal(hit.providerType, "mobile");

    const expiredPrisma = {
      ipIntelligenceCache: {
        findUnique: async () => ({ ip: "203.0.113.9", ipVersion: 4, providerType: "unknown", confidence: "low", checkedAt: new Date(), expiresAt: new Date(Date.now() - 1) }),
        upsert: async ({ create }) => create,
      },
    };
    const refreshed = await getCachedIpIntelligence(expiredPrisma, "203.0.113.9", {
      deps: { resolver: resolver({ reverse: ["mobile.cgnat.example"], lookup: [{ address: "203.0.113.9" }] }) },
    });
    assert.equal(refreshed.providerType, "mobile");
  });
});
