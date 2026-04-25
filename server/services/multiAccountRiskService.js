const LEVELS = [
  { min: 85, level: "critical" },
  { min: 65, level: "high" },
  { min: 35, level: "medium" },
  { min: 0, level: "low" },
];

function clampScore(score) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function levelFor(score) {
  return LEVELS.find((x) => score >= x.min)?.level || "low";
}

function recommendedAction(score, strongSignals, providerType) {
  if (score >= 85 && strongSignals >= 2) return "ban_candidate";
  if (score >= 65 && strongSignals >= 1) return providerType === "residential" ? "review" : "restrict";
  if (score >= 35) return "review";
  if (score >= 15) return "monitor";
  return "ignore";
}

export function calculateMultiAccountRisk(group) {
  const reasons = [];
  const falsePositiveWarnings = [];
  const providerType = group.ipIntelligence?.providerType || "unknown";
  const userCount = Number(group.userCount || group.users?.length || 0);
  let score = 0;
  let strongSignals = 0;

  if (group.signalType === "profile_wallet" || group.signalType === "onchain_wallet") {
    score += group.signalType === "onchain_wallet" ? 70 : 62;
    strongSignals += 1;
    reasons.push(group.signalType === "onchain_wallet" ? "Same on-chain wallet appears on multiple accounts." : "Same profile wallet appears on multiple accounts.");
  }

  if (group.signalType === "registration_ip" || group.signalType === "last_ip" || group.signalType === "ip_network" || group.signalType === "asn") {
    if (userCount >= 10) {
      score += 28;
      reasons.push(`${userCount} accounts share the same network signal.`);
    } else if (userCount >= 4) {
      score += 18;
      reasons.push(`${userCount} accounts share the same network signal.`);
    } else {
      score += 8;
      reasons.push("Small shared-IP cluster; IP alone is not proof of fraud.");
    }
  }

  if (group.sameWalletCount > 0) {
    score += 34;
    strongSignals += 1;
    reasons.push("Repeated wallet signal inside the group.");
  }
  if (group.sameDeviceCount > 0) {
    score += 30;
    strongSignals += 1;
    reasons.push("Same device/fingerprint appears inside the group.");
  }
  if (group.shortCreationWindow) {
    score += 14;
    reasons.push("Accounts were created close together.");
  }
  if (group.similarIdentityCount > 0) {
    score += 10;
    reasons.push("Email or username patterns look similar.");
  }

  if (providerType === "hosting" || providerType === "vpn_proxy" || providerType === "tor") {
    score += providerType === "hosting" ? 24 : 32;
    reasons.push(providerType === "hosting" ? "IP intelligence suggests datacenter/hosting network." : "IP intelligence suggests VPN/proxy/Tor.");
  }

  if (providerType === "residential") {
    score -= 16;
    falsePositiveWarnings.push("Residential ISP: same household or shared Wi-Fi is plausible.");
  }
  if (providerType === "mobile") {
    score -= 20;
    falsePositiveWarnings.push("Mobile/CGNAT carrier: many unrelated users can share an IP.");
  }
  if (providerType === "corporate" || providerType === "education" || providerType === "public_wifi") {
    score -= 12;
    falsePositiveWarnings.push("Shared organization/public network: review before action.");
  }
  if ((group.signalType === "registration_ip" || group.signalType === "last_ip") && strongSignals === 0) {
    falsePositiveWarnings.push("Shared IP alone should not be used as automatic fraud proof.");
  }
  if (userCount <= 3 && strongSignals === 0) {
    score -= 8;
    falsePositiveWarnings.push("Only 2-3 accounts and no repeated wallet/device signal.");
  }

  score = clampScore(score);
  const confidence = strongSignals >= 2 || score >= 85 ? "high" : strongSignals >= 1 || score >= 45 ? "medium" : "low";
  return {
    score,
    level: levelFor(score),
    confidence,
    reasons: reasons.length ? reasons : ["No strong multi-account signal found."],
    falsePositiveWarnings,
    recommendedAction: recommendedAction(score, strongSignals, providerType),
  };
}
