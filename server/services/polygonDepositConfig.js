/**
 * Shared POL deposit settings (env-driven, no schema changes).
 */

export function getMinDepositPol() {
  const v = parseFloat(String(process.env.MIN_DEPOSIT_AMOUNT || "0.01").trim());
  return Number.isFinite(v) && v > 0 ? v : 0.01;
}

export function getRequiredBlockConfirmations() {
  const n = parseInt(String(process.env.BLOCK_CONFIRMATIONS || "3").trim(), 10);
  return Number.isFinite(n) && n >= 1 ? n : 3;
}
