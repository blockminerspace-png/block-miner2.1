# Monolith modular structure report

**Date:** 2026-05-19  
**Branch:** `cursor/client-ignore-generated-client-output` (work in progress; commit separately)

---

## 1. Initial structure

**Backend:** Partial modularization — `auth`, `admin-miners`, `wallet` already under `server/modules/`. Most domains still used `server/routes/*.ts` + `server/controllers/*.ts`.

**Frontend:** Mixed — `dashboard`, `wallet`, `shop`, `machines`, `checkin`, `tasks`, `stats`, `support`, `auth/login|register` already in folders. Many **admin** pages and **Faucet/Vault** were flat files under `client/src/pages/`.

---

## 2. Scattered files found (before)

| Domain | Backend (before) | Frontend (before) |
|--------|------------------|-------------------|
| Check-in | `controllers/checkinController.ts` | `pages/checkin/` (OK) |
| Stats | `controllers/powerStatsController.ts` | `pages/stats/` (OK) |
| Shop | `controllers/shopController.ts` | `pages/shop/` (OK) |
| Machines | `controllers/machinesController.ts` | `pages/machines/` (OK) |
| Support | `controllers/supportController.ts` | `pages/support/` (OK) |
| Tasks | `controllers/dailyTasksController.ts` | `pages/tasks/` (OK) |
| Admin users | (in `routes/admin.ts`) | `AdminUsers.tsx` flat |
| Admin finance | (in `routes/admin.ts`) | `AdminFinance.tsx` flat |
| Admin support | (in `routes/admin.ts`) | `AdminSupport.tsx` flat |
| Admin metrics | (in `routes/admin.ts`) | `AdminMetrics.tsx` flat |
| Admin offer-events | `routes/admin-offer-events.ts` | flat `AdminOfferEvents*.tsx` |
| Faucet / Vault | `controllers/faucetController.ts` | flat `Faucet.tsx`, `Vault.tsx` |

---

## 3. Backend modules created / completed

New full module trees (routes + controller + service + repository + dto/schemas/types/errors + `index.ts`):

| Module | Path |
|--------|------|
| Check-in | `server/modules/checkin/` |
| Stats | `server/modules/stats/` |
| Shop | `server/modules/shop/` |
| Machines | `server/modules/machines/` |
| Support | `server/modules/support/` |
| Tasks (daily tasks) | `server/modules/tasks/` |

**Already present (unchanged layout):**

| Module | Path |
|--------|------|
| Auth | `server/modules/auth/` (+ `login/`, `register/`, `session/`, `shared/`) |
| Admin miners | `server/modules/admin-miners/` |
| Wallet | `server/modules/wallet/` |

**Not created (no dedicated controller surface):** `dashboard`, `rewards` — logic remains in shared controllers / other routes until extracted.

---

## 4. Frontend modules created / reorganized

| Domain | New / updated path |
|--------|-------------------|
| Admin users | `client/src/pages/admin/users/AdminUsersPage.tsx` |
| Admin finance | `client/src/pages/admin/finance/` |
| Admin support | `client/src/pages/admin/support/` |
| Admin metrics | `client/src/pages/admin/metrics/` |
| Admin offer-events | `client/src/pages/admin/offer-events/` |
| Admin dashboard | `client/src/pages/admin/dashboard/` |
| Faucet | `client/src/pages/faucet/FaucetPage.tsx` |
| Vault | `client/src/pages/vault/VaultPage.tsx` |
| Forgot password | `client/src/pages/auth/forgot-password/` |

**Barrel re-exports** at legacy paths preserve lazy imports in `App.tsx`:

- `client/src/pages/admin/AdminUsers.tsx` → `./users/AdminUsersPage`
- Same pattern for Finance, Support, Metrics, OfferEvents, Dashboard
- `client/src/pages/Faucet.tsx`, `Vault.tsx` → folder pages

**Already modular:** `auth/login`, `auth/register`, `dashboard`, `wallet`, `shop`, `machines`, `checkin`, `tasks`, `stats`, `support`, `offers`, `admin/miners`.

---

## 5. Files moved (summary)

### Backend (`git mv`)

- `server/controllers/checkinController.ts` → `server/modules/checkin/checkin.controller.ts`
- `server/controllers/powerStatsController.ts` → `server/modules/stats/stats.controller.ts`
- `server/controllers/shopController.ts` → `server/modules/shop/shop.controller.ts`
- `server/controllers/machinesController.ts` → `server/modules/machines/machines.controller.ts`
- `server/controllers/supportController.ts` → `server/modules/support/support.controller.ts`
- `server/controllers/dailyTasksController.ts` → `server/modules/tasks/tasks.controller.ts`

### Frontend (`git mv`)

- Admin pages listed above → domain subfolders
- `Faucet.tsx` / `Faucet.test.tsx` → `faucet/`
- `Vault.tsx` → `vault/`
- `ForgotPasswordPage.tsx` → `auth/forgot-password/`

---

## 6. Routes preserved

| Surface | Status |
|---------|--------|
| `/api/checkin/*` | `server/routes/checkin.ts` re-exports `checkinRouter` |
| `/api/stats/power` | `server/routes/stats.ts` → `statsRouter` |
| `/api/shop/*` | `server/routes/shop.ts` → `shopRouter` |
| `/api/machines/*` | `server/routes/machines.ts` → `machinesRouter` |
| `/api/support/*` | `server/routes/support.ts` → `supportRouter` (default export kept) |
| `/api/daily-tasks/*` | `server/routes/daily-tasks.ts` → `dailyTasksRouter` |
| `/api/wallet/*`, `/api/auth/*`, `/api/admin/miners` | Unchanged mount paths |
| SPA `/login`, `/dashboard`, `/wallet`, `/admin/miners`, etc. | Unchanged; barrels keep lazy import paths |

---

## 7. Imports adjusted

- Moved controllers: `../` → `../../` for `server/` imports.
- Shop: `notificationController` → `../../controllers/notificationController.js`.
- Support routes: uploads path `../../../uploads` from module depth.
- Frontend admin subfolders: `../../../store`, `../admin.api`, `../admin.types`.
- Tests reading **source** instead of dist shims: `checkinWalletRequired`, `adminMinersUiSecurity`, `adminUsersUiSecurity`, `adminTelegramUiSecurity`, `shopControllerLogging`.

**Compatibility shims** (no duplicated logic):

```txt
server/controllers/checkinController.ts      → re-export module
server/controllers/powerStatsController.ts
server/controllers/shopController.ts
server/controllers/machinesController.ts
server/controllers/supportController.ts
server/controllers/dailyTasksController.ts
```

---

## 8–9. Tests

**Moved with pages:** `faucet/FaucetPage.test.tsx` (mock paths fixed).

**Updated paths only:** `tests/adminUsersUiSecurity.test.mjs`, `adminTelegramUiSecurity.test.mjs`, `adminMinersUiSecurity.test.mjs`, `checkinWalletRequired.test.mjs`, `shopControllerLogging.test.mjs`.

**Colocated (unchanged):** 49 `*.test.ts(x)` under `client/src/` — utils, games, admin miners, wallet API, etc.

**`client/tests/auth/`:** Login, Register, 2FA — kept (integration-style).

---

## 10. DTOs / schemas

- **Wallet / admin-miners / auth:** Full DTO + Zod schemas (pre-existing).
- **New modules:** `*.dto.ts`, `*.schemas.ts`, `*.types.ts`, `*.errors.ts` stubs + `repository.ts` (prisma export) + `service.ts` (re-exports or delegates to existing `server/services/*` for tasks).

**Next refactor (optional):** Split large `checkin.controller.ts` (~900 lines) into service + repository without changing HTTP contracts.

---

## 11–12. Errors / performance

- No intentional 500 fixes in this pass.
- No UI/layout changes.
- No new request loops introduced.

---

## 13–20. Validation (2026-05-19)

| Command | Result |
|---------|--------|
| `client` typecheck | **PASS** |
| `client` build | **PASS** |
| `client` tests | **PASS** — 53 files, 296 tests |
| Root `npm test` | **PASS** |
| `typecheck:server` / `build:server` / `build:backend` | **PASS** |
| `docker compose build --no-cache app` | **PASS** |

---

## 21–22. Source extensions

| Check | Count |
|-------|-------|
| `client/src` `.js` / `.jsx` | **0** |
| `server/` stray `.js` source | **0** |

---

## 23. Backend module folders (final)

```txt
server/modules/
  admin-miners/
  auth/          (+ login/, register/, session/, shared/)
  checkin/
  machines/
  shop/
  stats/
  support/
  tasks/
  wallet/
```

---

## 24. Frontend page folders (final)

```txt
client/src/pages/
  auth/          (login/, register/, forgot-password/, shared/)
  dashboard/
  wallet/
  shop/
  machines/
  checkin/
  tasks/
  stats/
  support/
  offers/
  faucet/
  vault/
  admin/
    miners/
    users/
    finance/
    support/
    metrics/
    offer-events/
    dashboard/
    components/
```

---

## 25. Remaining work (real)

1. **Extract `server/modules/dashboard/`** when dashboard-specific API is isolated from `userController` / mining.
2. **Rewards** — unify ReadEarn / MiniPass / faucet under `pages/rewards/` or `modules/rewards/` (folder `pages/rewards/` exists but empty).
3. **Split checkin controller** into service + repository (logic still concentrated in controller).
4. **Admin domains** still flat: Fraud, Finance-adjacent logs, MiniPass, Streaming, etc. — migrate using same barrel pattern.
5. **Move page-level tests** to `client/tests/<domain>/` incrementally when touching modules.
6. **`server/routes/admin.ts`** — still large; split mounts per admin subdomain over time.

---

## Acceptance checklist

| Criterion | Met |
|-----------|-----|
| Real backend domain folders | Yes (9 modules) |
| Real frontend domain folders | Yes (priority set + barrels) |
| Login/register separate | Yes |
| Admin miners folder | Yes (FE + BE) |
| Wallet folder | Yes (FE + BE) |
| Dashboard/stats folders | Yes (FE); stats BE module added |
| Check-in folder | Yes (FE + BE) |
| Shop/machines folders | Yes (FE + BE) |
| Tasks/support folders | Yes (FE + BE) |
| Routes still work | Yes |
| typecheck/build/test | Yes |
| Docker build | Yes |
| No `.js` source in client/src or server | Yes |
| Report created | Yes |
