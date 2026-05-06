import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateMultiAccountRisk } from "../server/services/multiAccountRiskService.js";

describe("multi-account risk scoring", () => {
  it("hard-kills technical anomalies before score processing", () => {
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
    assert.equal(risk.score, 100);
    assert.equal(risk.level, "critical");
    assert.equal(risk.decision.recommendedAction, "ban_candidate");
    assert.equal(risk.decision.reason, "Technical anomalies/Environment spoofing");
    assert.ok(Array.isArray(risk.decision.anomalies));
    assert.ok(risk.decision.anomalies.some((x) => x.includes("private_or_loopback_network_marker")));
    assert.ok(risk.decision.anomalies.some((x) => x.includes("platform_self_reference")));
    assert.ok(risk.decision.anomalies.some((x) => x.includes("script_garbage")));
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

  it("requires wallet + fingerprint + ASN/provider correlation before escalating to restrict", () => {
    const risk = calculateMultiAccountRisk({
      signalType: "device_fingerprint",
      userCount: 5,
      ipIntelligence: { providerType: "hosting", reverseDns: "vm1.example-hosting.net", asnOrg: "Example Hosting" },
      sameWalletCount: 1,
      sameDeviceCount: 1,
    });
    assert.equal(risk.correlation.mandatorySatisfied, true);
    assert.equal(risk.identityVectorCount, 3);
    assert.equal(risk.decision.recommendedAction, "restrict");
    assert.equal(risk.decision.confidence, "High");
  });

  it("only allows destructive recommendation when at least three identity vectors coincide", () => {
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
    assert.equal(risk.decision.destructiveAllowed, true);
    assert.equal(risk.decision.recommendedAction, "ban_candidate");
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
    assert.ok(["review", "monitor"].includes(risk.decision.recommendedAction));
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
    assert.equal(risk.recommendedAction, "ignore");
    assert.ok(risk.score <= 15);
    assert.ok(risk.falsePositiveWarnings.some((w) => /TRUST_PROXY/i.test(w)));
  });

  it("downgrades mass same private IP clusters as proxy misconfiguration", () => {
    const risk = calculateMultiAccountRisk({
      signalType: "last_ip",
      key: "172.19.0.3",
      userCount: 100,
      users: [],
      ipIntelligence: null,
    });
    assert.equal(risk.recommendedAction, "ignore");
    assert.ok(risk.falsePositiveWarnings.length >= 1);
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
