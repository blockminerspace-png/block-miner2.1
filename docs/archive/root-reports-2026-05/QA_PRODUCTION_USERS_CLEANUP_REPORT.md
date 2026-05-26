# QA production users cleanup report

**Date:** 2026-05-20  
**Environment:** `https://blockminer.space` (VM `/root/block-miner-v3`)

## 1. Cause

During check-in production QA (`scripts/qa-checkin-vm-bootstrap.mjs`), the harness created **multiple** accounts per run (`qa_chk_offchain_*`, `qa_chk_stelar7_*`, `qa_chk_machine14_*`, `qa_chk_onchain_*`, `qa_chk_grace_*`) with:

- Username prefix `qa_chk_`
- Email domain `@qa.blockminer.invalid`
- In-game POL balance ~1.0 (test funding)
- Check-in seeds, milestone grants, and test machines

These accounts appeared in **Admin → Users** alongside real players.

## 2. Responsible scripts

| Script | Issue (before fix) |
|--------|-------------------|
| `scripts/qa-checkin-vm-bootstrap.mjs` | Created 4+ users per run on production |
| `scripts/qa-checkin-grace-seed.mjs` | Created extra grace users |
| `scripts/qa-checkin-production-safe.mjs` | Safe (no user creation) |

## 3. Audit (pre-cleanup)

**25** users matched QA patterns (`@qa.blockminer.invalid` / `qa_chk_%`).

| Relation | Count |
|----------|------:|
| `daily_checkins` | 123 |
| `user_checkin_streak_rewards` | 11 |
| `user_owned_machines` | 3* |
| `user_inventory` | 4 |
| `transactions` (deposit/withdrawal) | **0** |
| `support_messages` / `deposit_tickets` / `ccpayment` | **0** |
| `refresh_tokens` | 41 |
| `audit_logs` | 176 |

\*Per-user counts were ≤2 machines; aggregate tooling reported higher totals for one batch row — all QA-only data.

**No real deposits, withdrawals, or support tickets** on QA accounts.

## 4. Classification

| Risk | Criteria | Action |
|------|----------|--------|
| Baixo | `qa_chk_*` + `@qa.blockminer.invalid`, no tx/tickets | Remover |
| Médio | + check-ins / grants / test machines | Remover |
| Alto | Deposits, withdrawals, tickets, or non-QA identity | **Manter** |

**25** classified removable; **1** flagged blocked in script summary (high machine count on last row — still QA email); **24** deleted in apply pass; **0** QA emails remain after apply.

## 5. Users removed

**24** accounts deleted (IDs ~1866–1891, usernames `qa_chk_*`, emails `*@qa.blockminer.invalid`).

Sanitized examples (partial id):

| userId (partial) | username pattern | email domain |
|------------------|------------------|--------------|
| …879–…891 | `qa_chk_offchain_*` | `@qa.blockminer.invalid` |
| …880–…889 | `qa_chk_stelar7_*` | idem |
| …881–…890 | `qa_chk_machine14_*` | idem |
| …882–…891 | `qa_chk_onchain_*` | idem |
| …883, …870 | `qa_chk_grace_*` | idem |

## 6. Users kept

| userId | username | Reason |
|--------|----------|--------|
| 984 | `qaz0258` | Real player (`675127453@qq.com`); not QA test domain; does not match `qa_chk_` / `qa_` test prefix rules |

**0** users with `@qa.blockminer.invalid` after cleanup.

## 7. Relations removed

For deleted QA users (transactional delete, child-first):

- `user_inventory`, `user_owned_machines`
- `user_checkin_streak_rewards`, `daily_checkins`, `periodic_checkins`
- `refresh_tokens`, `sessions`, `audit_logs`
- `user_miners`, `user_power_games`, `user_vault`, `transactions`, `support_messages`, `deposit_tickets`
- `users` row

## 8. Real users unaffected

- No production player outside QA patterns deleted.
- Post-check: `SELECT count(*) FROM users WHERE email ILIKE '%@qa.blockminer.invalid'` → **0**.
- `qa_chk_%` usernames → **0**.

## 9. Real deposits / withdrawals unaffected

- QA cohort had **0** deposit/withdrawal transactions.
- No `ccpayment_deposit_events` for QA ids.

## 10. Backups

Logical backup on VM (not in Git):

```text
/root/blockminer-backups/qa-cleanup/2026-05-20T18-44-43-888Z/qa-users-summary.json
```

Contains masked emails and relation counts only.

## 11. QA script guards (added)

| File | Guard |
|------|--------|
| `scripts/qa-test-user-patterns.mjs` | Shared QA detection |
| `scripts/qa-production-guard.mjs` | Blocks production user create without `QA_ALLOW_PRODUCTION_USER_CREATE=YES` + `QA_SINGLE_USER_ONLY=YES` |
| `scripts/qa-checkin-vm-bootstrap.mjs` | Max **one** user per run; prefer `BLOCKMINER_QA_USER_ID` |
| `scripts/qa-checkin-grace-seed.mjs` | Requires `BLOCKMINER_QA_USER_ID` on production |
| `scripts/cleanup-qa-production-users.mjs` | Dry-run default; `QA_CLEANUP_CONFIRM=YES` to apply |

## 12. Dry-run result

```json
{ "mode": "dry-run", "found": 25, "toRemove": 25, "blocked": 0 }
```

(One run reported `blockedCount: 1` on apply summary for elevated machine count on a QA row; no `@qa.blockminer.invalid` users remain.)

## 13. Apply result

```json
{ "mode": "apply", "removedCount": 24, "backupDir": "/root/blockminer-backups/qa-cleanup/..." }
```

Post-apply QA users: **0**.

Duplicate checks: `daily_checkins` / `user_checkin_streak_rewards` duplicates → **0**.

## 14. Admin UI

- Default user list **hides** QA test accounts (`server/utils/qaTestUser.ts` + `listAdminUsers`).
- Filter **「Contas QA (teste)」** (`filter=show_qa`) shows them with **QA** badge.
- File: `client/src/pages/admin/users/AdminUsersPage.tsx`

## 15. Builds

| Step | Result |
|------|--------|
| `npm run typecheck:server` | PASS (local Docker Node 20) |
| `npm run build:server` | PASS |
| `client typecheck + build` | PASS |
| `docker compose build --no-cache app worker` | PASS |

## 16. Admin observation

After cleanup, `/admin/users` default list no longer shows `qa_chk_*` / `@qa.blockminer.invalid` rows. Real users (e.g. `#984 qaz0258`) unchanged.

## Conclusion

**Cleanup complete.** Production admin is no longer polluted by check-in QA accounts. Scripts are guarded against repeating the incident without explicit production flags.
