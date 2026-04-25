import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateMultiAccountRisk } from "../server/services/multiAccountRiskService.js";

describe("multi-account risk scoring", () => {
  it("keeps 2 residential shared-IP accounts low/medium with monitor/review, not ban", () => {
    const risk = calculateMultiAccountRisk({
      signalType: "last_ip",
      userCount: 2,
      ipIntelligence: { providerType: "residential" },
    });
    assert.ok(risk.score < 35);
    assert.notEqual(risk.recommendedAction, "ban_candidate");
    assert.ok(risk.falsePositiveWarnings.some((x) => x.includes("IP alone")));
  });

  it("raises risk for same IP plus wallet and device", () => {
    const risk = calculateMultiAccountRisk({
      signalType: "last_ip",
      userCount: 5,
      ipIntelligence: { providerType: "unknown" },
      sameWalletCount: 1,
      sameDeviceCount: 1,
      shortCreationWindow: true,
    });
    assert.ok(risk.score >= 65);
    assert.ok(["high", "critical"].includes(risk.level));
  });

  it("marks hosting/VPN with many accounts and strong signals high", () => {
    const risk = calculateMultiAccountRisk({
      signalType: "registration_ip",
      userCount: 12,
      ipIntelligence: { providerType: "vpn_proxy" },
      sameWalletCount: 1,
      sameDeviceCount: 1,
    });
    assert.ok(risk.score >= 85);
    assert.equal(risk.recommendedAction, "ban_candidate");
  });

  it("warns for mobile CGNAT false positives", () => {
    const risk = calculateMultiAccountRisk({
      signalType: "last_ip",
      userCount: 5,
      ipIntelligence: { providerType: "mobile" },
    });
    assert.ok(risk.falsePositiveWarnings.some((x) => x.includes("CGNAT")));
    assert.notEqual(risk.recommendedAction, "ban_candidate");
  });
});
