# Check-in reliability, grace period, and milestone rewards

## 1. Why users could not pay / check in via wallet

| Issue | Detail |
|-------|--------|
| `POST /api/checkin/claim` | Always returned `PAYMENT_REQUIRED` — never performed offchain/balance check-in |
| Balance path | Required linked wallet even when user only wanted in-game POL debit |
| Wallet path | Depends on `CHECKIN_RECEIVER` / `CHECKIN_CONTRACT_ADDRESS` + RPC; failures surfaced as `BLOCKCHAIN_UNAVAILABLE` with no fallback in UI |
| Streak | Calendar-day only; no grace after reset hour — easy to lose streak after missing one boundary |

## 2. Check-in modes (`CHECKIN_MODE`)

| Mode | Wallet on-chain | Offchain / balance |
|------|-----------------|-------------------|
| `hybrid` (default) | Yes (`/confirm`, `/wallet`, `/claim/onchain`) | Yes (`/claim`, `/balance`) — wallet not required for balance |
| `offchain` | Disabled | Yes |
| `onchain` | Yes | Disabled |

Env: `CHECKIN_MODE=hybrid|offchain|onchain`

## 3. Reset rule

- `CHECKIN_RESET_HOUR` (default **21**, America/São_Paulo): daily period key rolls at that hour, not midnight.
- `getCheckinPeriodKey()` drives today’s check-in row key.
- `nextResetAt` returned in `GET /api/checkin/status`.

## 4. Grace period

- `CHECKIN_GRACE_HOURS` (default **6**): after a missed period ends, user can still check in and keep streak.
- `usedGrace` stored on `daily_checkins` when grace is consumed.
- `CHECKIN_MAX_GRACE_USES_PER_MONTH` (default **2**).
- `graceEndsAt` in status when applicable.

## 5. Streak freeze

- `CHECKIN_STREAK_FREEZE_ENABLED` (default **true**).
- `CHECKIN_MAX_FREEZE_USES_PER_MONTH` (default **1**).
- `usedFreeze` on `daily_checkins` when applied.
- Logic in `computeStreakAfterCheckin()` (`server/utils/checkinStreak.ts`).

## 6. How streak is calculated

- Display: `computeCheckinStreak()` walks consecutive confirmed `checkinDate` keys with grace-aware cursor.
- On confirm: `computeStreakAfterCheckin()` sets `streak`, `usedGrace`, `usedFreeze` on the new row.
- Existing confirmed rows and streak values are **not** wiped.

## 7. Idempotency

- `@@unique([userId, checkinDate])` on `daily_checkins`.
- `txHash` unique — replay rejected (`TX_ALREADY_USED`).
- Per-user advisory lock `checkin:{userId}` in transactions.
- Milestone grants: `@@unique([userId, milestoneId])` on `user_checkin_streak_rewards`.
- Double click → `alreadyCheckedIn` or `CHECKIN_CONFLICT`, no duplicate rewards.

## 8. txHash validation

Unchanged core path in `checkin.contract.ts` + `evaluateCheckinPayment()`:

- Format, receipt success, chainId, contract/treasury destination, sender = linked wallet, minimum POL.

## 9. Wallet fallback (hybrid)

- Frontend: wallet errors suggest balance path when `allowsOffchainCheckin`.
- Backend: `checkinBalance` skips `WALLET_REQUIRED` when `requiresWalletForOffchainCheckin()` is false (default in hybrid).
- `POST /api/checkin/claim` delegates to balance/offchain flow.

## 10. Milestones structure

Existing tables (extended, not replaced):

- `checkin_streak_milestones` — rules (`day_threshold`, `reward_type`, …)
- `user_checkin_streak_rewards` — audit of grants

New columns: `miner_id`, `item_code`, `metadata_json` on milestones; `used_grace`, `used_freeze` on daily checkins.

## 11. Reward types supported

| Type | Backend handler |
|------|-----------------|
| `pol` / `balance` | `polBalance` increment |
| `stelar` / `zer` | `zerBalance` (Estelar) increment |
| `hashrate` | Temporary `user_powers_games` bonus |
| `machine` | `createInventoryWithOwnedMachineTx` + miner catalog snapshot |
| `item` | Inventory via `itemCode` + optional `metadataJson` |
| `none` | Claim row only |

Implementation: `server/modules/checkin/checkin.rewards.ts`

## 12. Machine delivery

- Loads active `Miner` by `milestone.minerId`.
- Creates `UserOwnedMachine` + `UserInventory` with `acquisitionSource: "checkin_milestone"`, snapshot name/hash/image/price.

## 13. Estelar / balance / item

- Estelar → `zerBalance` ledger field on `User`.
- POL → `polBalance`.
- Item → inventory row via `itemCode` / metadata (hashRate, minerName, etc.).

## 14. Migration

`server/prisma/migrations/20260520180000_checkin_grace_milestone_rewards/migration.sql` — additive only.

## 15. No duplicate rewards

Transactional milestone grant + unique (user, milestone). P2002 swallowed on race.

## 16. No streak wipe

No migration clears `daily_checkins` or user streak fields. New logic only affects new confirmations.

## 17. Builds (Docker Node 20, 2026-05-20)

| Step | Result |
|------|--------|
| `npm run typecheck:server` | PASS |
| `npm run build:server` | PASS |
| `client npm run typecheck` | PASS |
| `client npm run build` | PASS |

## 18. Docker build

Not re-run in this session after check-in commit (run `docker compose build --no-cache app worker` before deploy).

## 19. Manual test

Recommended on staging/production with `CHECKIN_MODE=hybrid`:

1. Check-in via balance without wallet linked (hybrid).
2. Double-click balance — single reward.
3. Wallet check-in with valid tx.
4. Invalid tx rejected.
5. Grace: miss one period, check in within `graceEndsAt` — `usedGrace=true`, streak continues.
6. Milestone day N — machine in inventory / Estelar on balance.

## 20. Real pendencies

- Deploy migration `20260520180000_checkin_grace_milestone_rewards` on production DB.
- Seed/admin: configure milestones with `minerId` / `stelar` in admin panel.
- Full controller → service/repository split deferred (logic remains in `checkin.controller.ts` with new modules for config/rewards/repository).
- Manual Rabby/wallet E2E on production after deploy.

## API summary

| Method | Path | Role |
|--------|------|------|
| GET | `/api/checkin/status` | Status + grace + mode + upcoming milestones |
| POST | `/api/checkin/claim` | Offchain/balance (hybrid/offchain) |
| POST | `/api/checkin/claim/onchain` | Wallet tx confirm |
| POST | `/api/checkin/confirm` | Legacy wallet confirm |
| POST | `/api/checkin/balance` | Balance debit |
| POST | `/api/checkin/wallet` | Alias confirm |
| GET | `/api/checkin/rewards` | Milestone list |
| GET | `/api/checkin/history` | Recent confirmed rows |

## Env reference

```bash
CHECKIN_MODE=hybrid
CHECKIN_RESET_HOUR=21
CHECKIN_GRACE_HOURS=6
CHECKIN_STREAK_FREEZE_ENABLED=true
CHECKIN_MAX_GRACE_USES_PER_MONTH=2
CHECKIN_MAX_FREEZE_USES_PER_MONTH=1
CHECKIN_OFFCHAIN_REQUIRES_WALLET=false
```
