import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateMultiAccountRisk } from "#server/services/multiAccountRiskService.js";

describe("multi-account risk scoring", () => {
  it("does not escalate technical anomalies to ban_candidate", () => {
    const risk = calculateMultiAccountRisk({
      signalType: "device_fingerprint",
      key: "localhost",
      users: [
        {
          id: 1,
          email: "127.0.0.1@blockminer.space.test",
          username: "undefined",
          walletAddress: "0x123",
          userAgent: "[object Object]",
        },
      ],
      ipIntelligence: { reverseDns: "blockminer.space", asnOrg: "Example Hosting", normalizedIp: "10.0.0.1" },
    });
    assert.ok(risk.score <= 45);
    assert.notEqual(risk.level, "critical");
    assert.equal(risk.decision.recommendedAction, "needs_more_signals");
    assert.equal(risk.decision.destructiveAllowed, false);
    assert.ok(Array.isArray(risk.decision.anomalies));
  });

  it("ignores isolated residential shared-IP repetition as low-trust metadata", () => {
    const risk = calculateMultiAccountRisk({
      signalType: "last_ip",
      userCount: 2,
      ipIntelligence: { providerType: "residential", reverseDns: "customer.example-telecom.net", asnOrg: "Example Telecom" },
    });
    assert.ok(risk.score < 20);
    assert.equal(risk.decision.recommendedAction, "ignore");
    assert.ok(risk.falsePositiveWarnings.some((x) => x.includes("IP")));
  });

  it("requires wallet + fingerprint + ASN/provider correlation before review_candidate", () => {
    const risk = calculateMultiAccountRisk({
      signalType: "device_fingerprint",
      userCount: 5,
      ipIntelligence: { providerType: "hosting", reverseDns: "vm1.example-hosting.net", asnOrg: "Example Hosting" },
      sameWalletCount: 1,
      sameDeviceCount: 1,
    });
    assert.equal(risk.correlation.mandatorySatisfied, true);
    assert.equal(risk.identityVectorCount, 3);
    assert.equal(risk.decision.recommendedAction, "review_candidate");
    assert.equal(risk.decision.destructiveAllowed, false);
  });

  it("uses high_confidence_cluster instead of ban_candidate when many vectors coincide", () => {
    const risk = calculateMultiAccountRisk({
      signalType: "device_fingerprint",
      userCount: 12,
      ipIntelligence: {
        providerType: "vpn_proxy",
        reverseDns: "exit.vpn-provider.net",
        asnOrg: "Example VPN",
        proxyDetected: true,
        proxyType: "VPN",
      },
      sameWalletCount: 1,
      sameDeviceCount: 1,
      shortCreationWindow: true,
      similarIdentityCount: 4,
    });
    assert.equal(risk.correlation.mandatorySatisfied, true);
    assert.equal(risk.decision.destructiveAllowed, false);
    assert.equal(risk.decision.recommendedAction, "high_confidence_cluster");
    assert.equal(risk.decision.confidence, "High");
  });

  it("blocks destructive action when the mandatory correlation is incomplete", () => {
    const risk = calculateMultiAccountRisk({
      signalType: "asn",
      userCount: 12,
      ipIntelligence: { providerType: "hosting", reverseDns: "host.example.net", asnOrg: "Example Hosting" },
      sameWalletCount: 1,
      shortCreationWindow: true,
    });
    assert.equal(risk.correlation.mandatorySatisfied, false);
    assert.equal(risk.decision.destructiveAllowed, false);
    assert.notEqual(risk.decision.recommendedAction, "ban_candidate");
  });

  it("emits false-positive alert when coherent geolocation conflicts with suspicious IP", () => {
    const risk = calculateMultiAccountRisk({
      signalType: "registration_ip",
      userCount: 3,
      ipIntelligence: {
        providerType: "vpn_proxy",
        reverseDns: "edge.vpn-provider.net",
        asnOrg: "Example VPN",
        proxyDetected: true,
      },
      geolocation: { countryCode: "BR", confidence: "high" },
    });
    assert.ok(risk.alerts.includes("Alerta de Falso Positivo"));
    assert.ok(risk.falsePositiveWarnings.some((x) => x.includes("geolocalizacao coerente")));
    assert.equal(risk.decision.recommendedAction, "needs_more_signals");
  });

  it("treats ASN-only grouping as contextual, not automatic fraud", () => {
    const risk = calculateMultiAccountRisk({
      signalType: "asn",
      userCount: 8,
      ipIntelligence: { providerType: "hosting", reverseDns: "server.hosting.net", asnOrg: "Example Hosting" },
    });
    assert.ok(risk.falsePositiveWarnings.some((x) => x.includes("ASN")));
    assert.notEqual(risk.decision.recommendedAction, "ban_candidate");
  });

  it("downgrades mass same-IP registration clusters when reverse DNS looks like our nginx / Docker hop", () => {
    const risk = calculateMultiAccountRisk({
      signalType: "registration_ip",
      key: "177.18.0.7",
      userCount: 460,
      users: Array.from({ length: 3 }, (_, i) => ({
        id: i + 1,
        email: `u${i}@example.com`,
        username: `user${i}`,
        walletAddress: `0x${String(i + 1).padStart(40, "1")}`,
        userAgent: "Mozilla/5.0",
      })),
      ipIntelligence: { reverseDns: "block-miner-nginx-1.block-miner.default", providerType: "unknown" },
    });
    assert.ok(["ignore", "infrastructure_ignored", "shared_ip_low_confidence"].includes(risk.recommendedAction));
    assert.ok(risk.score <= 25);
    assert.ok(risk.falsePositiveWarnings.some((w) => /TRUST_PROXY|infra|proxy|nginx/i.test(w)));
  });

  it("downgrades mass same private IP clusters as infrastructure_ignored", () => {
    const risk = calculateMultiAccountRisk({
      signalType: "last_ip",
      key: "172.19.0.3",
      userCount: 100,
      users: [],
      ipIntelligence: null,
    });
    assert.equal(risk.recommendedAction, "infrastructure_ignored");
    assert.equal(risk.score, 0);
    assert.ok(risk.falsePositiveWarnings.length >= 1);
  });

  it("downgrades Docker bridge 172.18.0.1 even with few accounts", () => {
    const risk = calculateMultiAccountRisk({
      signalType: "registration_ip",
      key: "172.18.0.1",
      userCount: 3,
      users: [],
      ipIntelligence: { reverseDns: "host.backup.ubuntu", providerType: "unknown" },
    });
    assert.equal(risk.recommendedAction, "infrastructure_ignored");
    assert.equal(risk.score, 0);
  });

  it("does not treat shared withdrawal destination (ledger to-address) as duplicate profile wallet", () => {
    const risk = calculateMultiAccountRisk({
      signalType: "onchain_wallet",
      fraudKind: "shared_ledger_to_address",
      userCount: 11,
      sameWalletCount: 0,
      sameDeviceCount: 1,
      shortCreationWindow: true,
      ipIntelligence: { providerType: "unknown" },
    });
    assert.equal(risk.correlation.wallet, false);
    assert.equal(risk.correlation.fingerprint, false);
    assert.ok(risk.falsePositiveWarnings.some((w) => w.includes("exchange")));
    assert.ok(risk.score < 40);
    assert.notEqual(risk.decision.recommendedAction, "ban_candidate");
  });
});
