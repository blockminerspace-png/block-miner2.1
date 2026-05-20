# Check-in dateKey / period reset fix

## 1. Root cause

`getCheckinPeriodKey` used **Option A** (period start calendar day): before 21:00 BRT the key was **yesterday’s** date. A check-in after 21:00 on day D was stored as `D`, and the next morning (still before 21:00) the **same key** was used → `todayCheckedIn: true` even though the user perceived “yesterday evening / today morning” as different days.

`getDailyRowForToday` also queried by **civil calendar aliases** (`getBrazilDateKeyAliases(now)`), not by period keys, which could mismatch status in edge paths.

## 2. Old dateKey

Option A: period key = calendar day at period **start** (before `CHECKIN_RESET_HOUR`, subtract one civil day).

## 3. New dateKey

**Option B**: period key = civil day when the period **ends** (at `CHECKIN_RESET_HOUR`).

Example (`CHECKIN_RESET_HOUR=21`, `America/Sao_Paulo`):

| Window | dateKey |
|--------|---------|
| 2026-05-19 21:00 → 2026-05-20 20:59:59 | `2026-05-20` |

## 4. Timezone

`CHECKIN_TIMEZONE` (default `America/Sao_Paulo`) via `getCheckinTimezone()`.

## 5. Reset hour

`CHECKIN_RESET_HOUR` (default `21`).

## 6. Before / after examples

| Now (BRT) | Old key | New key | Checked in last night (stored `2026-05-19` legacy) |
|-----------|---------|---------|-----------------------------------------------------|
| 2026-05-20 10:00 | `2026-05-19` | `2026-05-20` | **Not** same period → can check in |
| 2026-05-20 22:00 | `2026-05-20` | `2026-05-21` | New period |

## 7. `todayCheckedIn`

`true` only if a confirmed row exists for `currentPeriod.dateKey` (lookup includes legacy start-key alias via `getCheckinPeriodLookupKeys`).

## 8. `canCheckin`

`!todayCheckedIn && !pending` — never derived from `recentCheckins` history.

## 9. Legacy logs

Rows stored as `2026-05-19` (Option A) still match the period ending `2026-05-20` through `isSameCheckinPeriod` / lookup aliases. No data deleted.

## 10. Streak / grace

`checkinStreak.ts` uses `isSameCheckinPeriod`, `isPreviousPeriodEndKey`, and `periodHasConfirmedKey` so legacy keys do not break consecutive-day math.

## 11. Rewards / milestones

Unchanged; still keyed off streak after confirm.

## 12. Code changes

- `server/modules/checkin/checkin.calendar.ts` — single calendar module
- `server/utils/checkinPeriod.ts` — re-exports
- `checkin.controller.ts` — status `currentPeriod`, `lastCheckin`, period lookup
- `client` — period UI + i18n

## 13. Builds

Run locally:

```bash
npm run typecheck:server && npm run build:server && npm run build:backend
cd client && npm run typecheck && npm run build
node --test tests/checkinCalendar.test.mjs
```

## 14. Docker / deploy

```bash
BLOCKMINER_DOCKER_BUILD_NO_CACHE=1 python3 scripts/vm-deploy-local-over-ssh.py
```

## 15. Manual test

1. Last check-in yesterday evening → button available this morning.
2. After check-in in current period → “Já resgatado neste período”.
3. History shows old dates; status uses API only.
4. Double-click → idempotent.
5. Grace/milestones still OK.
