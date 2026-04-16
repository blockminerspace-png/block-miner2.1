/**
 * Feature flags for custodial Polygon HD deposit addresses (see docs/polygon-hd-deposit-service-spec.md).
 */

export function isPolygonHdDepositEnabled() {
  if (process.env.POLYGON_HD_DEPOSIT_ENABLED !== "1") {
    return false;
  }
  const hasRemote = Boolean((process.env.PHD_SERVICE_URL || "").trim());
  const hasLocalMnemonic = Boolean((process.env.POLYGON_HD_MNEMONIC || "").trim());
  return hasRemote || hasLocalMnemonic;
}
