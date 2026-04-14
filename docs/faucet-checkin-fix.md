# Faucet display vs check-in wallet alignment

## Root causes

### Faucet “24 hour” expiration

- **Backend behavior:** Faucet claims create `UserInventory` rows via `createInventoryWithOwnedMachineTx` without passing `expiresAt`, so the inventory row does not get a time-to-live. This matches shop-style permanent hardware (cleanup jobs that remove expired rows only target rows with `expiresAt` in the past).
- **Frontend bug:** The Faucet page showed a hard-coded **1440 minutes** label next to a clock icon, which users reasonably interpreted as a **24-hour miner expiry**. That value was not read from the API or database; it was misleading UI only.

### Check-in wallet dependency

- **Backend behavior:** `claimCheckin` already returned `400` with code `WALLET_REQUIRED` when `user.walletAddress` was empty (wallet must be linked on the Wallet page).
- **Gaps addressed:** API clients could still hit `POST /checkin/claim` without going through the UI; logging for denied and successful attempts was added for operational visibility. The free-claim handler on the client now refuses to call the API if `walletLinked` is false, avoiding pointless errors when local state is stale.

## Fixes applied

1. **Faucet API (`GET /api/faucet/status`):** `reward` now includes `inventoryPermanent: true` and `inventoryExpiresAt: null` so the client can render persistence consistently with the server.
2. **Faucet claim logging:** After a successful transaction, the server logs structured lines (`Faucet` child logger + `faucet_inventory_reward_created` security event) including `inventoryExpiresAt: null`.
3. **Faucet UI:** Replaced the hard-coded 1440m display with an i18n “permanent (no expiry)” label (with a fallback path for a hypothetical future `inventoryPermanent: false`). Loading text is fully i18n (en / pt-BR / es).
4. **Check-in logging:** `checkin_claim_missing_wallet` on denied claims; `checkin_free_claim_success` after a successful free claim for the day.
5. **Check-in UI:** `handleClaimFree` blocks when `!status.walletLinked` before calling the API.

## Before vs after

| Area | Before | After |
|------|--------|-------|
| Faucet prize metadata | Showed “1440m” as if TTL | Shows translated “Permanent (no expiry)” unless API marks temporary |
| Faucet status JSON | No explicit persistence fields | `inventoryPermanent` / `inventoryExpiresAt` on `reward` |
| Check-in audit | Little visibility on wallet-less API attempts | Structured security logs for missing wallet and success |
| Check-in client | Relied on UI branch only | Extra guard before `POST /checkin/claim` |

## Security notes

- **Wallet “validation” model:** Check-in requires a **verified linked wallet** stored on the user record (`walletAddress`), not merely a browser extension connection. That prevents claiming with a transient in-memory address that is not bound to the account.
- **Abuse prevention:** Logging supports detection of scripted attempts to claim without a linked wallet. Backend enforcement remains the source of truth; the UI guard is defense in depth.

## Tests

- `tests/faucetInventoryNoExpiry.test.mjs` — static guarantees: no 24h TTL in faucet claim path; status exposes permanent flags.
- `tests/checkinWalletRequired.test.mjs` — static guarantees: `WALLET_REQUIRED` path and logging hooks present.

## Operational notes

- Search logs for `faucet_inventory_reward_created`, `checkin_claim_missing_wallet`, and `checkin_free_claim_success` (security channel / aggregation depending on logger wiring).
