# Check-in milestone reward types fix

## 1. Legacy reward types found

| Type | Issue |
|------|--------|
| `item` | Fake inventory / supply crate — not a real game reward |
| `stelar` / `zer` | Token not used as official check-in milestone reward |
| `hashrate` | Valid temporary power, renamed to `temporary_power` |
| `none` | No reward — disallowed for new rules |
| `displayTitle` / `description` | English copy in DB (e.g. Day 3 supply crate) |

## 2. Why item / stelar / zer were removed

They are not part of the official reward catalog (POL, temporary power via `UserPowerGame`, catalog machines). Allowing them in admin created fake items and mixed-language UI.

## 3. Allowed reward types (final)

```txt
pol
temporary_power
machine
```

Legacy `hashrate` is normalized to `temporary_power` on read/apply.

## 4. Backend validation

- `server/modules/checkin/checkin.milestoneRules.ts` — `parseMilestoneBody`, miner catalog check, rejects `itemCode`
- `server/controllers/adminCheckinMilestoneController.ts` — only accepts the 3 types; clears `displayTitle` / `description`
- `server/modules/checkin/checkin.rewards.ts` — grants POL / `UserPowerGame` temporary boost / `UserOwnedMachine` snapshot only; skips invalid legacy rules on apply

## 5. Admin UI

- `client/src/pages/admin/AdminCheckinMilestones.tsx` — i18n, 3 reward types, miner dropdown from `GET /admin/miners`, no free-text `itemCode` or English title fields
- Table shows localized summary (e.g. Dia 14 — Máquina — Nome)

## 6. i18n

- `checkin.milestones.reward.{pol,temporaryPower,machine,unavailable}`
- `adminCheckinMilestones.*` in pt-BR, en, es

## 7. Machine catalog selection

Admin loads active miners via `/admin/miners?filter=active&limit=200`. Backend validates `minerId` with `isActive` + `!isArchived` before save and on grant.

## 8. Temporary power expiry

Uses existing `UserPowerGame` with `expiresAt` from `metadataJson.durationHours` (or `validityDays × 24` fallback). Included in hash-rate sync via existing game-power path.

## 9. Invalid legacy rules

Script `scripts/audit-and-clean-invalid-checkin-milestones.mjs`:

- Dry-run: lists invalid milestones + grant counts
- Apply (`CHECKIN_MILESTONE_CLEANUP_CONFIRM=YES`): sets `active=false` on invalid rules; optional `--migrate-hashrate` renames `hashrate` → `temporary_power`
- Does not delete user grants

## 10. Dry-run (VM production, 2026-05-19)

```json
{
  "mode": "dry_run",
  "total": 6,
  "invalid_count": 2,
  "invalid": [
    { "id": 5, "dayThreshold": 3, "rewardType": "item", "grantCount": 0 },
    { "id": 1, "dayThreshold": 7, "rewardType": "stelar", "grantCount": 95 }
  ]
}
```

## 11. Apply cleanup (VM production)

`CHECKIN_MILESTONE_CLEANUP_CONFIRM=YES` — deactivated 2 invalid milestones (`item` day 3, `stelar` day 7). **95 historical grants on stelar were not deleted.**

Script fix: uses shared `#server/src/db/prisma.js` (Prisma 7 adapter) instead of bare `new PrismaClient()`.

## 12. Builds

| Step | Result |
|------|--------|
| `tsc -p tsconfig.server.json` | OK (prior session) |

## 13. Docker

Deploy `scripts/vm-deploy-local-over-ssh.py` with `BLOCKMINER_DOCKER_BUILD_NO_CACHE=1` — **OK** (5 containers, no pending migrations).

## 14. Manual test

**Admin:** only POL / Poder temporário / Máquina; machine from dropdown; cannot save invalid miner.

**User `/checkin`:** cards use i18n; legacy invalid rules show “Recompensa indisponível”.

## 15. No fake items

`grantItemMilestone` removed from apply path; `itemCode` rejected on create/update.
