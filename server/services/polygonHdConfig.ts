/**
 * Feature flags for custodial Polygon HD deposit addresses (see docs/polygon-hd-deposit-service-spec.md).
 */

/** UI / API: operator turned the feature on (may still be missing secrets). */
export function isPolygonHdFeatureFlagged() {
  return process.env.POLYGON_HD_DEPOSIT_ENABLED === "1";
}

/**
 * When the feature flag is on but the server cannot allocate addresses yet.
 * @returns {string[]}
 */
export function listPolygonHdMissingEnvKeys() {
  if (!isPolygonHdFeatureFlagged()) {
    return [];
  }
  const missing: string[] = [];
  const hasRemote = Boolean((process.env.PHD_SERVICE_URL || "").trim());
  const hasToken = Boolean((process.env.PHD_INTERNAL_TOKEN || "").trim());
  const hasLocalMnemonic = Boolean((process.env.POLYGON_HD_MNEMONIC || "").trim());
  if (hasRemote) {
    if (!hasToken) {
      missing.push("PHD_INTERNAL_TOKEN");
    }
  } else if (!hasLocalMnemonic) {
    missing.push("POLYGON_HD_MNEMONIC or PHD_SERVICE_URL");
  }
  return missing;
}

/** Minimum POL credited for txs to the user's HD deposit address (default 1). */
export function getPolygonHdMinDepositPol() {
  const raw = String(process.env.POLYGON_HD_MIN_DEPOSIT_POL || "1").trim();
  const v = parseFloat(raw);
  return Number.isFinite(v) && v > 0 ? v : 1;
}

/** True when HD allocation and verification can run (secrets present). */
export function isPolygonHdDepositEnabled() {
  if (!isPolygonHdFeatureFlagged()) {
    return false;
  }
  return listPolygonHdMissingEnvKeys().length === 0;
}
