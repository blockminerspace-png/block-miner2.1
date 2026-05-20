#!/usr/bin/env node
/**
 * Dry-run recalculation of multi-account risk groups (no DB writes, no bans).
 * Usage:
 *   node scripts/recompute-fraud-signals-safe.mjs
 *   CONFIRM=YES node scripts/recompute-fraud-signals-safe.mjs --apply
 */
import { calculateMultiAccountRisk } from "#server/services/multiAccountRiskService.js";

const samples = [
  { label: "docker_bridge", signalType: "registration_ip", key: "172.18.0.1", userCount: 120 },
  { label: "private_lan", signalType: "last_ip", key: "172.19.0.3", userCount: 80 },
  { label: "residential_shared", signalType: "last_ip", key: "177.54.12.9", userCount: 2, ipIntelligence: { providerType: "residential" } },
  {
    label: "strong_cluster",
    signalType: "device_fingerprint",
    key: "198.51.100.2",
    userCount: 8,
    sameWalletCount: 1,
    sameDeviceCount: 1,
    ipIntelligence: { providerType: "hosting", asnOrg: "Example Hosting" },
  },
];

const apply = process.argv.includes("--apply");
if (apply && process.env.CONFIRM !== "YES") {
  console.error("Refusing --apply without CONFIRM=YES");
  process.exit(1);
}

let banCandidate = 0;
let infrastructureIgnored = 0;

for (const sample of samples) {
  const risk = calculateMultiAccountRisk(sample);
  const action = risk.recommendedAction || risk.decision?.recommendedAction;
  if (action === "ban_candidate") banCandidate += 1;
  if (action === "infrastructure_ignored") infrastructureIgnored += 1;
  console.log(
    JSON.stringify({
      label: sample.label,
      key: sample.key,
      userCount: sample.userCount,
      score: risk.score,
      level: risk.level,
      action,
      destructiveAllowed: risk.decision?.destructiveAllowed ?? false,
    }),
  );
}

console.log(
  JSON.stringify({
    mode: apply ? "apply_noop" : "dry_run",
    samples: samples.length,
    ban_candidate: banCandidate,
    infrastructure_ignored: infrastructureIgnored,
    note: "Fraud signals are computed on read; this script only validates scoring rules.",
  }),
);

if (banCandidate > 0) {
  console.error("Unexpected ban_candidate in samples — review scoring before deploy.");
  process.exit(2);
}
