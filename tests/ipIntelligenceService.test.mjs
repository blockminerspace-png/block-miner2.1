import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { enrichIp, getCachedIpIntelligence, lookupProxycheck } from "../server/services/ipIntelligenceService.js";

const oldEnv = { ...process.env };

afterEach(() => {
  for (const key of ["IP_ASN_PROVIDER", "IPINFO_TOKEN", "PROXYCHECK_ENABLED", "PROXYCHECK_API_KEY", "PROXYCHECK_DAILY_LIMIT"]) {
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

  it("derives IPv6 /64 network CIDR locally when ASN provider does not return one", async () => {
    const result = await enrichIp("2001:db8:abcd:12::beef", {
      resolver: { reverse: async () => { throw new Error("ENOTFOUND"); }, lookup: async () => [] },
    });
    assert.equal(result.networkCidr, "2001:db8:abcd:12::/64");
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

  it("parses proxycheck proxy/vpn results from the private server-side API", async () => {
    process.env.PROXYCHECK_API_KEY = "server-private-key";
    process.env.PROXYCHECK_ENABLED = "true";
    const result = await lookupProxycheck("203.0.113.9", {
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          status: "ok",
          "203.0.113.9": {
            proxy: "yes",
            type: "VPN",
            risk: "73",
            provider: "Example VPN",
            "last seen unix": "1714233600",
          },
        }),
      }),
    });
    assert.equal(result.proxyDetected, true);
    assert.equal(result.proxyType, "VPN");
    assert.equal(result.proxyRiskScore, 73);
    assert.equal(result.proxyProvider, "Example VPN");
    assert.ok(result.proxyLastSeenAt instanceof Date);
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

  it("refreshes proxycheck data once per day even when core IP intel is still fresh", async () => {
    process.env.PROXYCHECK_API_KEY = "server-private-key";
    process.env.PROXYCHECK_ENABLED = "true";
    process.env.PROXYCHECK_DAILY_LIMIT = "1000";

    let upserted = null;
    let fetchCalls = 0;
    const prisma = {
      ipIntelligenceCache: {
        findUnique: async () => ({
          ip: "203.0.113.9",
          ipVersion: 4,
          reverseDns: "customer.example.net",
          reverseDnsForwardConfirmed: true,
          asn: 64512,
          asnOrg: "Example ISP",
          networkCidr: "203.0.113.0/24",
          providerLabel: "Residential ISP",
          providerType: "residential",
          confidence: "medium",
          source: "cache",
          error: null,
          checkedAt: new Date("2026-04-27T12:00:00Z"),
          expiresAt: new Date("2026-05-10T12:00:00Z"),
          proxyCheckedAt: new Date("2026-04-25T12:00:00Z"),
          proxyExpiresAt: new Date("2026-04-26T12:00:00Z"),
        }),
        count: async () => 12,
        upsert: async ({ create }) => {
          upserted = create;
          return create;
        },
      },
    };

    const result = await getCachedIpIntelligence(prisma, "203.0.113.9", {
      deps: {
        fetchImpl: async () => {
          fetchCalls += 1;
          return {
            ok: true,
            json: async () => ({
              status: "ok",
              "203.0.113.9": {
                proxy: "yes",
                type: "VPN",
                risk: "74",
                provider: "Example VPN",
              },
            }),
          };
        },
      },
    });

    assert.equal(fetchCalls, 1);
    assert.equal(result.providerType, "residential");
    assert.equal(result.proxyDetected, true);
    assert.equal(result.proxyType, "VPN");
    assert.equal(result.proxyRiskScore, 74);
    assert.equal(upserted.proxyDetected, true);
    assert.ok(upserted.proxyExpiresAt instanceof Date);
  });
});
