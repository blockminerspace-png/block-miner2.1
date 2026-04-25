/**
 * Shared POL deposit settings (env-driven, no schema changes).
 */

export function getMinDepositPol() {
  const raw = String(
    process.env.DEPOSIT_MIN_AMOUNT || process.env.MIN_DEPOSIT_AMOUNT || "0.01"
  ).trim();
  const v = parseFloat(raw);
  return Number.isFinite(v) && v > 0 ? v : 0.01;
}

export function getRequiredBlockConfirmations() {
  const raw = String(process.env.CONFIRMATION_BLOCKS || process.env.BLOCK_CONFIRMATIONS || "3").trim();
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : 3;
}
