# Final TypeScript Migration Report — BlockMiner

**Date:** 2026-05-13  
**Environment:** Linux, Node ≥18, repo root `/home/gustavo/Documentos/BlockMiner 2.1`

This report reflects **commands actually executed** in the audit and validation pass used to produce it. Where a command was not run, that is stated explicitly.

---

## 1. Executive summary

The BlockMiner codebase has completed its **primary JavaScript → TypeScript migration** for the application core:

- **Backend (`server/`):** TypeScript only for authored sources; no `.js` sources under `server/` outside generated `dist` and dependencies. Entry compiles to **`dist/server/server.js`**. Internal resolution uses **`#server/*` → `./dist/server/*`** in root `package.json` and **NodeNext** with **`.js` extensions in import specifiers** in TS sources (emit resolves correctly).
- **Frontend (`client/src/`):** **No** `.js` / `.jsx` source files; **223** `.ts` / `.tsx` files. Vite config is **`client/vite.config.ts`**. Root UI is **`App.tsx`** / **`main.tsx`** with extensionless imports (bundler resolution).
- **Admin and user pages:** Under `client/src/pages/`, including `client/src/pages/admin/`, there are **zero** `.js` / `.jsx` files (verified via `find` and glob). Shared admin typing lives in **`admin.types.ts`** and **`admin.api.ts`**.
- **Quality gates (this session):** Client typecheck/build/tests, root Node tests, server typecheck, `build:server`, `build:backend`, and **`docker compose build --no-cache`** all completed **successfully** (exit code 0).
- **Remaining JavaScript:** Intentionally retained for **tooling, Hardhat/contracts, Node test runner scripts, maintenance scripts, static public assets, compiled `backend/dist` outputs, and the Telegram proof worker service**—listed and justified below. A naive repo-wide `find` that only prunes top-level `node_modules` still traverses **nested** `node_modules` and reports tens of thousands of third-party files; that is documented as a **measurement caveat**, not missing migration work.

---

## 2. Scope

### In scope (covered by this migration)

- `server/` — Express app, middleware, routes, controllers, services, models, utils, cron, jobs, `server/server.ts`, `server/src/*`, Prisma usage, sockets, etc.
- `client/src/` — React application (pages, components, hooks, games, tests co-located where present).
- `client/vite.config.ts` (replacement for legacy `vite.config.js`).
- Test import alignment and Node test runner usage (`scripts/run-node-tests.mjs` with `node --experimental-strip-types`).
- Scripts and services that remain JS by choice but are documented here (e.g. `services/telegram-proof-worker`, root `scripts/*.mjs`).

### Out of scope / explicitly excluded from “TS-only repo” claims

- `.deploy` snapshot tree (legacy packaging; pruned from some audits).
- **Hardhat / contracts** (`contracts/`, `.cjs` config, deploy scripts).
- **Tooling configs** that remain `.js` / `.cjs` (ESLint, PostCSS, Tailwind, Prisma config driver, etc.).
- **Static browser JS** under `client/public/` (e.g. broadcast helper).
- **Third-party** and **nested** `node_modules` trees when interpreting raw `find` counts.

---

## 3. Backend migration summary

### Layout and concerns

Authoritative TypeScript sources live under:

- `server/middleware/`, `server/routes/`, `server/controllers/`, `server/services/`, `server/models/`, `server/utils/`, `server/cron/`, `server/jobs/`, `server/src/` (db, mining engine, sockets, bootstrap, runtime helpers), plus **`server/server.ts`** as the main HTTP/Socket.IO entry.

### Build and runtime

| Topic | Detail |
|--------|--------|
| **Entry (source)** | `server/server.ts` |
| **Compile** | `npm run build:server` → `tsc -p tsconfig.server.json` |
| **Emitted entry** | `dist/server/server.js` |
| **Package main** | Root `package.json` → `"main": "dist/server/server.js"` |
| **Import map** | `"imports": { "#server/*": "./dist/server/*" }` |
| **Worker (example)** | `npm run worker:bullmq` → `node dist/server/jobs/runBlockminerWorker.js` |
| **Module mode** | `tsconfig.server.json`: `"module": "NodeNext"`, `"moduleResolution": "NodeNext"` |
| **allowJs** | **`false`** on the server project (no authored JS in `server/`) |
| **noImplicitAny** | **`false`** on `tsconfig.server.json` (stricter `any` policy than `backend/`; see §13) |
| **TS imports** | Sources use **`.js` suffixes** in relative imports (NodeNext emit pattern), e.g. `import prisma from "./src/db/prisma.js";` in `server/server.ts`. |
| **Prisma** | Schema under `server/prisma/`; `package.json` prisma seed runs **`node dist/server/prisma/seed.js`** after server build. Runtime uses generated client + `@prisma/adapter-pg` per project dependencies. |

### Audit: `.js` under `server/` (excluding `node_modules` and `dist`)

```bash
find server -name "*.js" -type f \
  -not -path "server/node_modules/*" \
  -not -path "server/dist/*" \
  | sort
```

**Result:** *(empty — no lines)*

---

## 4. Frontend migration summary

- **`client/src`:** **No** `.js` or `.jsx` files (`find` returned empty).
- **File counts:** **223** `.ts` / `.tsx` files under `client/src`.
- **Entry:** `client/src/main.tsx`, root layout/routing in **`client/src/app/App.tsx`**.
- **Bundler config:** **`client/vite.config.ts`**; **`client/tsconfig.json`** includes `"src"` and **`vite.config.ts`**.
- **Imports:** Extensionless imports for app modules; Vite **`moduleResolution: "bundler"`**.
- **Route prefetch:** `prefetchRoute` / `prefetchProtectedBootstrap` from `client/src/shared/utils/routePrefetch.ts` (used from `App.tsx` and `Sidebar.tsx`).
- **Tests:** Vitest in `client/`; **40** test files, **254** tests passed in `npm test` (client) for this report.

---

## 5. Admin migration summary

- **`client/src/pages/admin/`:** **0** `.js` / `.jsx` files.
- Representative migrated modules (non-exhaustive): **`AdminSupport`**, **`AdminSupportPlayerDossier`**, **`AdminOfferEvents`**, **`AdminOfferEventManage`**, **`AdminMetrics`**, **`AdminFinance`**, **`AdminUsers`**, plus dashboard, miners, fraud, streaming, backups, daily tasks, transparency, etc.
- **Bulk admin work** was completed as part of the staged migration (including the large admin batch referenced internally as **Step 19** in migration notes).
- **Shared types/API helpers:** **`admin.types.ts`**, **`admin.api.ts`**, plus domain-specific modules (e.g. `adminFinance.types.ts`, `adminDailyTasksModel.ts`).

---

## 6. User pages migration summary

**`client/src/pages/`** (excluding `admin/`) contains **only** `.tsx` / `.ts` (and colocated tests); **no** `.js` / `.jsx`.

Domains covered include, among others:

- `dashboard/` — dashboard UI + `dashboard.api.ts`
- `wallet/` — `WalletPage.tsx`, `wallet.api.ts`
- `shop/` — `ShopPage.tsx`, `shop.api.ts`
- `machines/` — `MachinesPage.tsx`, `machines.api.ts`
- `support/` — `SupportPage.tsx`, `support.api.ts`
- `checkin/` — `CheckinPage.tsx`, `checkin.api.ts`
- `tasks/` — `TasksPage.tsx`, task hooks and API/types
- **Rewards / earning style flows** — e.g. `ReadEarn.tsx`, `Shortlinks.tsx`, `Vault.tsx`, `Faucet.tsx`, `MiniPass.tsx`
- `stats/` — `StatsPage.tsx`, `stats.api.ts`, components
- `offers/` — `OffersPage.tsx`, `offers.api.ts`
- `auth/` — login, register, forgot password + tests
- **Other user-facing pages** — `Landing.tsx`, `Games.tsx`, `Settings.tsx`, legal pages, `InternalOfferwall.tsx`, etc.

**Architectural note (unchanged):** the frontend is **not** the source of truth for economy or authorization; the backend continues to validate critical actions.

---

## 7. Configs, scripts and tooling

| Area | Notes |
|------|--------|
| **Vite** | `client/vite.config.ts` |
| **Client ESLint** | `client/eslint.config.js` (tooling) |
| **PostCSS / Tailwind** | `client/postcss.config.js`, `client/tailwind.config.js` |
| **Root ESLint** | `eslint.config.cjs` (CJS tooling) |
| **Prisma** | `prisma.config.js` at repo root (Prisma 7 style config driver) |
| **Node test orchestration** | `scripts/run-node-tests.mjs` — spawns `node --experimental-strip-types --test ...` over `tests/*.test.{js,mjs}` |
| **Maintenance / ops scripts** | Examples: `scripts/clear-faucet-inventory-expiry.mjs`, `scripts/fraud-enrich-ips.mjs`, `scripts/security-audit.mjs`, many legacy `.js` scripts for one-off DB/inspect tasks |
| **Telegram worker** | `services/telegram-proof-worker/*.js` — separate small service, kept as JS for operational simplicity |
| **`.deploy`** | Legacy / snapshot packaging; excluded from strict TS migration claims |

---

## 8. Remaining JavaScript files and justification

### Mandatory audit command (as requested)

```bash
find . \
  \( -path "./node_modules" -o -path "./dist" -o -path "./client/dist" \
     -o -path "./server/dist" -o -path "./.git" -o -path "./.deploy" \) -prune -o \
  \( -name "*.js" -o -name "*.jsx" -o -name "*.cjs" -o -name "*.mjs" \) -type f -print | sort | wc -l
```

**Result:** **35 753** paths.

**Interpretation:** This prune set **does not exclude** `client/node_modules`, nested package `node_modules`, or other dependency trees. Almost all hits are **third-party** files inside those trees. **This number must not be read as “35k project JS files.”**

### Supplemental audit (recommended for “repo-owned” JS)

Same pattern with additional `-path` prunes for common dependency and artifact directories:

```text
./node_modules, ./client/node_modules, ./server/node_modules, ./contracts/node_modules,
./dist, ./client/dist, ./server/dist, ./.git, ./.deploy, ./coverage
```

**Result:** **151** files — the set that matters for migration status. Full sorted list:

```text
./app/routes/registerAppRoutes.js
./backend/dist/app/mount/adminApiRoutes.mount.js
./backend/dist/app/mount/publicSurfaceRoutes.mount.js
./backend/dist/app/mount/userApiRoutes.mount.js
./backend/dist/app/registerHttpRoutes.js
./backend/dist/app/setupExpressHttpStack.js
./backend/dist/modules/health/health.controller.js
./backend/dist/modules/health/health.routes.js
./backend/dist/modules/health/health.service.js
./backend/dist/modules/health/index.js
./backend/dist/shared/errors/httpErrors.js
./backend/dist/shared/http/apiErrorHandler.js
./backend/dist/shared/prisma/client.js
./client/eslint.config.js
./client/postcss.config.js
./client/public/crypto-broadcast/app.js
./client/scripts/landing-en.mjs
./client/scripts/landing-es.mjs
./client/scripts/landing-pt.mjs
./client/scripts/merge-landing-locales.mjs
./client/tailwind.config.js
./contracts/hardhat.config.cjs
./contracts/hardhat-tests/BlockMinerDeposit.js
./contracts/scripts/deploy.js
./eslint.config.cjs
./prisma.config.js
./scripts/apply-comprehensive-legal.mjs
./scripts/backup.js
./scripts/capture_prisma_error.js
./scripts/check_active_powers.js
./scripts/check-db-tables.js
./scripts/check_sqlite.js
./scripts/clear-faucet-inventory-expiry.mjs
./scripts/db_inspect.js
./scripts/fixDuplicateMinerImageUrls.js
./scripts/fix-image-paths.mjs
./scripts/fix-inventory-gpu-image.js
./scripts/fraud-enrich-ips.mjs
./scripts/generate-obsidian-vault.mjs
./scripts/inspect-faucet-inventory.js
./scripts/inspect-faucet.js
./scripts/migrateData.js
./scripts/migrate_test.js
./scripts/openrouter-ask.mjs
./scripts/ping_db.js
./scripts/read_sqlite_schema.js
./scripts/rpc-bench.js
./scripts/run-node-tests.mjs
./scripts/security-audit.mjs
./scripts/seed-rewards-data.js
./services/telegram-proof-worker/healthcheck.js
./services/telegram-proof-worker/telegramProofWorker.js
./tests/adminAccountCollisionService.test.mjs
./tests/adminAuditListService.test.mjs
./tests/adminFraudAuthValidation.test.mjs
./tests/adminFraudSignalsService.test.mjs
./tests/adminFraudUiSecurity.test.mjs
./tests/adminMinersService.test.mjs
./tests/adminMinersUiSecurity.test.mjs
./tests/adminPasswordResetPolicy.test.mjs
./tests/adminTelegramUiSecurity.test.mjs
./tests/adminUserManagementService.test.mjs
./tests/adminUsersUiSecurity.test.mjs
./tests/audit.query.test.js
./tests/audit.test.js
./tests/authNetworkSignalService.test.mjs
./tests/authTokens.test.js
./tests/autoMiningV2.domain.test.js
./tests/btcpayService.test.js
./tests/buildUserAuditSnapshotMinersSelect.test.mjs
./tests/bullmqQueue.test.mjs
./tests/checkinBalanceAuditLog.test.mjs
./tests/checkinBalanceGate.test.js
./tests/checkinChainAmounts.test.mjs
./tests/checkinEvaluateTxStrict.test.mjs
./tests/checkinPaymentEnforcement.test.mjs
./tests/checkinPeriodKeys.test.mjs
./tests/checkinReceiverResolve.test.js
./tests/checkinStreak.test.mjs
./tests/checkinWalletRequired.test.mjs
./tests/clientIp.test.mjs
./tests/contractDepositLog.test.js
./tests/dailyTaskDefinitionAdminValidation.test.js
./tests/dailyTaskProgressInternalOfferwallDestructuring.test.mjs
./tests/dailyTasks.period.test.js
./tests/databaseBackupService.test.mjs
./tests/depositsCron.test.js
./tests/emailTwoFactorService.test.mjs
./tests/faucetInventoryNoExpiry.test.mjs
./tests/game2048Constants.test.mjs
./tests/game2048Engine.test.mjs
./tests/httpErrors.test.mjs
./tests/i18nLanguage.test.mjs
./tests/iframeHostAllowlistCache.test.mjs
./tests/internalOfferwallLimitState.test.mjs
./tests/internalOfferwallMinViewLogic.test.mjs
./tests/internalOfferwallTaskMetadata.test.mjs
./tests/internalOfferwall.validateIframeUrl.test.mjs
./tests/ipIntelligenceService.test.mjs
./tests/logger.test.mjs
./tests/machineInstanceState.test.mjs
./tests/machinePlacementMapping.test.mjs
./tests/memoryGameConstants.test.js
./tests/miningCronHashrateSync.test.js
./tests/miningEngineRewards.test.js
./tests/miniPass.adminValidation.test.mjs
./tests/miniPass.i18n.test.mjs
./tests/miniPass.levelMath.test.mjs
./tests/miniPassPeriod.test.mjs
./tests/miniPassSeasonLive.test.mjs
./tests/multiAccountRiskService.test.mjs
./tests/offerEvents.helpers.test.mjs
./tests/offerEvents.listQuery.test.mjs
./tests/offerEvents.publicList.test.mjs
./tests/openrouterAskScript.test.mjs
./tests/polygonDepositConfig.test.js
./tests/polygonHdConfig.test.mjs
./tests/polygonHdDepositScanner.test.mjs
./tests/polygonHdWallet.test.mjs
./tests/publicLiveStatsService.test.js
./tests/rackMinerRelease.test.js
./tests/readEarn.isLive.test.mjs
./tests/readEarnSchemas.test.mjs
./tests/registerBodySchema.test.mjs
./tests/requestPublicOrigin.test.js
./tests/rooms.test.js
./tests/shopControllerLogging.test.mjs
./tests/shopIdempotencyStore.test.mjs
./tests/sidebarNavPaths.test.js
./tests/sidebarNavRegistry.test.js
./tests/socketHandshakeAuthPolicy.test.mjs
./tests/stableRequestHash.test.mjs
./tests/streamAdminValidation.test.js
./tests/streamRestartPolicy.test.mjs
./tests/streamRunner.pendingRestart.test.mjs
./tests/streamSecrets.test.js
./tests/supportMessagePayload.test.mjs
./tests/supportPlayerDossierService.test.js
./tests/telegramProofWorker.test.mjs
./tests/token.test.js
./tests/transactionLocks.test.mjs
./tests/transparency.test.mjs
./tests/transparencyWalletService.test.mjs
./tests/turnstile.resolveSecret.test.mjs
./tests/userActivityAuditMiddleware.test.mjs
./tests/vaultSchemas.test.mjs
./tests/verify_security_fix.mjs
./tests/walletDeposit.test.js
./tests/walletValidation.test.js
./tests/walletWithdraw.test.js
./tests/withdrawalTelegramService.test.mjs
```

**Group justification:**

- **`backend/dist/**`** — compiled output of the **`backend/`** TypeScript package (separate from `server/`); checked in or produced for deployment pipelines depending on workflow—still `.js` on disk.
- **`app/routes/registerAppRoutes.js`** — legacy/app-shell bridge; outside `server/` tree.
- **`client/eslint.config.js`, `postcss.config.js`, `tailwind.config.js`** — ecosystem defaults / tooling.
- **`client/public/**`** — static assets for the browser.
- **`client/scripts/*.mjs`** — locale / landing merge utilities.
- **`contracts/**`** — Hardhat and chain scripts.
- **`eslint.config.cjs`, `prisma.config.js`** — root tooling.
- **`scripts/**`** — operational and one-off maintenance; mix of `.mjs` and `.js`.
- **`tests/**`** — Node’s native test runner prefers explicit `.js` / `.mjs` files; TypeScript tests in client use Vitest.
- **`services/telegram-proof-worker/**`** — small dedicated worker service.

---

## 9. TypeScript configuration

| Project | File | Highlights |
|---------|------|------------|
| **Server** | `tsconfig.server.json` | `module` / `moduleResolution`: **NodeNext**; `rootDir`: `server`; `outDir`: `dist/server`; **`allowJs`: false**; `strict`: true; **`noImplicitAny`: false** |
| **Backend package** | `backend/tsconfig.json` | NodeNext; **`noImplicitAny`: true**; `paths` include **`#server/...` stubs** under `backend/src/types/stubs/` for compile-time boundary typing |
| **Client** | `client/tsconfig.json` | `module`: ESNext; **`moduleResolution`: bundler**; **`jsx`: react-jsx**; **`allowJs`: true** (legacy gradual typing at project edge—not used for `client/src` pages anymore); **`include`**: `["src", "vite.config.ts"]` |
| **Import map (runtime)** | Root `package.json` | `"#server/*": "./dist/server/*"` |

---

## 10. Runtime and Docker

| Item | Status |
|------|--------|
| **HTTP app** | Production path: **`node dist/server/server.js`** (after `build:server` + `build:backend` as per npm scripts). |
| **Workers** | Example: **`node dist/server/jobs/runBlockminerWorker.js`**. |
| **`docker compose build --no-cache`** | **Executed successfully** (exit code 0). Images **`block-miner-app:latest`** and **`block-miner-worker:latest`** built; log ended with `app Built` / `worker Built`. Duration ~**7.4 minutes** in this environment. |
| **`docker compose up`** | **Not executed** for this report (no guarantee of a safe, non-production `.env`; starting the stack is left to the operator in a controlled environment). |

---

## 11. Tests and validation

All commands below were run **after** the working tree was in the state used for this report (including the one-line doc fix in `server/controllers/adminController.ts`).

| Command | Result |
|---------|--------|
| `cd client && npm run typecheck` | **OK** (exit 0) |
| `cd client && npm run build` | **OK** (exit 0; Rollup chunk size **warnings** only) |
| `cd client && npm test` | **OK** (exit 0; **40** files, **254** tests) |
| `npm test` | **OK** (exit 0; **465** tests, **465** pass, **0** fail) |
| `npm run typecheck:server` | **OK** (exit 0) |
| `npm run build:server` | **OK** (exit 0) |
| `npm run build:backend` | **OK** (exit 0) |
| `docker compose build --no-cache` | **OK** (exit 0) |

---

## 12. Security notes

- **Secrets:** This report does not reproduce environment secrets. **Do not** commit `.env` files with production credentials (standard project hygiene).
- **No recreated `server/` JS sources:** Audit shows **no** `.js` sources under `server/` outside `dist`/dependencies.
- **`@ts-ignore` / `@ts-nocheck` / `as any` / `: any` grep:** The mandated recursive grep over `server` + `client/src` yielded **one** line: `server/middleware/admin.ts` — log message *“any logged-in user…”* — **English prose, not TypeScript `any`.** No `@ts-ignore` or `@ts-nocheck` hits in that scan.
- **Admin / support payloads:** Types consolidated in admin modules reduce accidental shape drift; **authorization and validation remain server-side**.
- **Client trust model:** The UI continues **not** to be the authority for balances, purchases, or privileged admin operations; backend validation remains mandatory.

---

## 13. Known technical debt

- **`.deploy/`** — legacy snapshot / packaging material; keep out of “clean TS core” metrics or delete/archive after operational sign-off.
- **Server `noImplicitAny: false`** — allows implicit `any` in `server/` stricter cleanup could be a future incremental effort.
- **Client `allowJs: true`** — harmless for current all-TS `src`, but could be tightened later if desired.
- **`backend/tsconfig.json` path stubs** for `#server/*` — pragmatic compile-time boundaries; **TypeScript project references** or generated shared DTO types could reduce stub maintenance (see §16).
- **Large bundles** — client build warns on chunk sizes; future code-splitting work is performance UX debt, not TS migration debt.
- **Lint** — root `npm run lint` is ESLint over `.js` per `package.json`; full-repo TS lint policy may differ from TS compiler gates.

---

## 14. Commands executed

### Audits

```bash
find server -name "*.js" -type f \
  -not -path "server/node_modules/*" \
  -not -path "server/dist/*" | sort

find client/src \( -name "*.js" -o -name "*.jsx" \) -type f | sort

find client/src \( -name "*.ts" -o -name "*.tsx" \) -type f | sort | wc -l

find server \( -name "*.ts" -o -name "*.tsx" \) -type f | sort | wc -l

find . \( -path "./node_modules" -o -path "./dist" -o -path "./client/dist" \
  -o -path "./server/dist" -o -path "./.git" -o -path "./.deploy" \) -prune -o \
  \( -name "*.js" -o -name "*.jsx" -o -name "*.cjs" -o -name "*.mjs" \) -type f -print | sort | wc -l

# Supplemental (not in original one-liner but used for §8):
find . \( -path "./node_modules" -o -path "./client/node_modules" -o -path "./server/node_modules" \
  -o -path "./contracts/node_modules" -o -path "./dist" -o -path "./client/dist" \
  -o -path "./server/dist" -o -path "./.git" -o -path "./.deploy" -o -path "./coverage" \) -prune -o \
  \( -name "*.js" -o -name "*.jsx" -o -name "*.cjs" -o -name "*.mjs" \) -type f -print | sort | tee /tmp/blockminer-find-js-pruned.txt | wc -l

grep -R "\.jsx" . \
  --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx" \
  --include="*.mjs" --include="*.cjs" \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git --exclude-dir=.deploy || true

grep -R "@ts-ignore\|@ts-nocheck\| as any\|: any" server client/src \
  --include="*.ts" --include="*.tsx" || true
```

### Validation

```bash
cd client && npm run typecheck
cd client && npm run build
cd client && npm test
npm test
npm run typecheck:server
npm run build:server
npm run build:backend
docker compose build --no-cache
```

### Grep classification (`.jsx`)

Hits were **comments**, **legacy test descriptions**, or **tooling string literals** (e.g. `scripts/generate-obsidian-vault.mjs` listing extensions). **No** live `.jsx` import paths in application code were identified in this scan.

---

## 15. Final acceptance checklist

- [x] `server/` sem `.js` fonte (excl. `node_modules`, `dist`) — **verified (empty `find`)**
- [x] `client/src` sem `.js/.jsx` — **verified (empty `find`)**
- [x] Admin sem `.js/.jsx` em `client/src/pages/admin` — **verified**
- [x] User pages sem `.js/.jsx` em `client/src/pages` — **verified**
- [x] Server typecheck OK — **`npm run typecheck:server`**
- [x] Server build OK — **`npm run build:server`**
- [x] Backend build OK — **`npm run build:backend`**
- [x] Client typecheck OK — **`npm run typecheck`**
- [x] Client build OK — **`npm run build`**
- [x] Client tests OK — **`npm test` (client)**
- [x] Root tests OK — **`npm test` (root)**
- [x] Docker build OK — **`docker compose build --no-cache`**
- [x] No `@ts-ignore` / `@ts-nocheck` introduced — **none found in mandated grep** (see §12 for `any` false positive)
- [x] No source JS recreated in `server/` — **audit empty**

---

## 16. Recommended next steps

1. **Decide the fate of `.deploy/blockminer-test-package`** (archive, document-only, or remove if obsolete).
2. **Evaluate TypeScript project references** or a narrow shared package to replace **`backend` `#server` path stubs** with real cross-package typing.
3. **Generate shared API/DTO types** (OpenAPI, zod inference export, or similar) for selected endpoints to tighten client/server contracts.
4. **Manual QA pass** on Admin and high-traffic user pages (wallet, shop, check-in, tasks) in a staging environment.
5. Run **`docker compose up`** with a **non-production `.env`** in a safe lab and smoke-test health checks, worker connectivity, and DB migrations.
6. Revisit **client chunk size** warnings (`npm run build` in `client`) if Web Vitals regress.
7. **Tag or merge-commit** this migration milestone before large new features so diffs stay attributable.

---

### Appendix: tiny documentation fix applied during report generation

- `server/controllers/adminController.ts`: comment reference updated from **`AdminMetrics.jsx`** to **`AdminMetrics.tsx`** so documentation matches the migrated tree.
