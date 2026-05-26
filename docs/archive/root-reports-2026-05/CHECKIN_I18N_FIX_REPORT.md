# Check-in i18n fix report

## 1. Hardcoded strings found

| Source | Examples |
|--------|----------|
| DB `display_title` / `description` on `checkin_streak_milestone` | `Day 1 bonus`, `Day 3 supply crate`, `Day 7 Estelar`, `Day 14 rig`, `Basic miner reward`, `Advanced miner reward` |
| `CheckinPage.tsx` | Used `m.displayTitle` and `m.description` directly in JSX |
| `formatMilestoneReward` | `defaultValue` fallbacks in English (`Mining machine`, `+N Estelar`) when keys were missing |
| Backend `buildUpcomingMilestones` | `label: displayTitle \|\| rewardType + value` (English) |

## 2. Components corrected

- `client/src/pages/checkin/CheckinPage.tsx` — milestone cards use i18n helpers only
- `client/src/pages/checkin/checkinMilestoneI18n.ts` — new typed helpers (`normalizeCheckinRewardType`, title/description/status/day)
- `client/src/pages/checkin/checkinMilestoneI18n.test.ts` — unit tests
- `client/src/pages/checkin/CheckinPage.test.tsx` — guard against `displayTitle` / English literals in page source

## 3. pt-BR keys added

Under `checkin.milestones`:

- `title`, `description`, `days_one`, `days_other`
- `status.blocked`, `status.claimed`, `status.unlocked`, `status.unlockedNextCheckin`
- `reward.{pol,item,stelar,zer,machine,hashrate,none,unknown}.title` + `.description`

## 4. en keys added

Same structure as pt-BR (English copy per spec).

## 5. es keys added

Same structure for locale bundle parity.

## 6. Backend DTO changes

`server/modules/checkin/checkin.rewards.ts` — `buildMilestoneStatusForUser` now returns:

- `milestoneDay`, `rewardType`, `amount`, `itemCode`, `minerId`, `status` / `state`, `labelKey`
- **Removed** `displayTitle` and `description` from API payload (admin DB fields unchanged)

`buildUpcomingMilestones` returns structured fields + `labelKey` instead of English `label`.

## 7. rewardType → translated text

Frontend: `getCheckinMilestoneTitle(t, milestone)` → `t('checkin.milestones.reward.<type>.title', { day, amount, code })`.

`balance` → `pol`; server may still send `stelar` for legacy `zer` rows.

## 8. status → translated text

| API `state` | i18n key |
|-------------|----------|
| `locked` | `checkin.milestones.status.blocked` |
| `eligible` | `checkin.milestones.status.unlockedNextCheckin` |
| `claimed` | `checkin.milestones.status.claimed` |

## 9. Grep audit (`client/src/pages/checkin`)

```bash
grep -R "Day 1|supply crate|Blocked|Unlocked|welcome bonus|miner reward" client/src/pages/checkin --include="*.tsx"
```

**Result:** no matches in JSX (only test fixtures referencing `displayTitle` as ignored legacy field).

## 10. Builds

| Step | Result |
|------|--------|
| `tsc -p tsconfig.server.json` | OK (outDir `/tmp/blockminer-dist-build`) |
| Client vitest | Skipped in agent env (missing `jsdom`); source guards + `localesBundle.test.ts` updated |
| Client `npm run build` | Run on deploy host (local agent has no `npm` global) |

## 11. Docker build

Included in VM deploy script (`BLOCKMINER_DOCKER_BUILD_NO_CACHE=1`).

## 12. Manual test checklist

1. Open `/checkin` with language **pt-BR** — cards must show Portuguese only.
2. Verify: Bônus do dia 1, Caixa de suprimentos do dia 3, Máquina do dia 14/30, Bloqueado, Desbloqueado — resgate no próximo check-in.
3. Switch to **en** — full page English.
4. Reload — language persists via `i18nextLng` in localStorage.

## 13. PT/EN mix

**Fixed:** UI no longer reads English `displayTitle` / `description` from API. All milestone copy is derived from `rewardType` + `state` + i18n keys.

## Economy / rules

No changes to check-in rewards, streak logic, balances, or machine grants.
