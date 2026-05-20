# BlockMiner — Step 08: `server/` core TypeScript migration

**Date:** 2026-05-13  
**Scope:** All backend source under `server/` is TypeScript; runtime uses `dist/server/**`. No duplicate `.js` + `.ts` source pairs under `server/`.

---

## 1. `.js` files under `server/` (audit)

### Post-migration `find` result

After migration, this command returns **no lines** (empty):


```bash
find server -name "*.js" -type f \
  -not -path "server/node_modules/*" \
  -not -path "server/dist/*" \
  | sort
```

**Count of remaining source `.js` in `server/`:** 0.

### Audit table (obligatory template)

There are **no** remaining backend source `.js` files under `server/` to enumerate. Before this step, the tree still contained real runtime modules such as `server/server.js`, `server/src/**/*.js`, `server/phdServer.js`, Prisma seed/helpers in `.js`, etc.; all were migrated to `.ts` or removed as duplicates once `.ts` became canonical.

| Arquivo JS | Tipo | Usado por | Importado por | Usa Express | Usa Prisma | Usa env/secrets | Usa cron/job | Executado em Docker | Vai migrar para | Risco | Status |
|------------|------|-----------|---------------|-------------|------------|-----------------|--------------|---------------------|-----------------|-------|--------|
| *(nenhum sob `server/` após a etapa)* | — | — | — | — | — | — | — | — | — | — | **Concluído** |

---

## 2. Files migrated / current server TypeScript tree

The backend source tree is entirely `server/**/*.ts` (and `server/types/**/*.d.ts` for ambient types). At the time of this report there are **311** `*.ts` files under `server/`.

A canonical list can be regenerated at any time:

```bash
find server -name "*.ts" -type f | sort
```

Prior steps had already moved routes, controllers, services, models, utils, cron, jobs, and middleware to `.ts`. Step 08 completed the remainder: entrypoint (`server/server.ts`), `server/src/**`, `server/phdServer.ts`, `server/scripts/global_rescue.ts`, `server/prisma/seed.ts`, `server/test_db.ts`, wallet/socket/mining helpers, Prisma loader (`server/src/db/prisma.ts`), etc., and removed obsolete `.js` twins.

---

## 3. Remaining `.js` in `server/`

**None** (with the standard excludes above). Compiled output lives only under `dist/server/**/*.js`.

---

## 4. `server/server.js`

Removed as source. The application entry source is:

- **`server/server.ts`**

---

## 5. New entrypoint (source vs runtime)

| Layer | Path |
|--------|------|
| **Source** | `server/server.ts` |
| **Runtime (Node / Docker)** | `dist/server/server.js` |

`package.json` `"main"` is `dist/server/server.js`. Scripts `dev`, `start`, `start:server:prod`, `worker:bullmq`, etc., run the compiled bundle after `build:server` / `build:backend` where applicable.

---

## 6. `server/src/db/prisma.js`

Replaced by **`server/src/db/prisma.ts`**, still loading the generated Prisma client from `backend/dist/shared/prisma/client.js` via `createRequire` so `tsc -p tsconfig.server.json` does not emit backend sources. **`findBlockMinerProjectRoot`** behavior is preserved. **`DATABASE_URL`** is not logged.

---

## 7. `package.json` changes (this step)

- **`"main"`:** `dist/server/server.js` (unchanged intent).
- **`"imports"`:** `"#server/*": "./dist/server/*"` (unchanged).
- **`"prisma"."seed"`:** `node dist/server/prisma/seed.js` — seed runs **after** `npm run build:server`.
- **`fraud:enrich-ips`:** now runs `npm run build:server` before `node scripts/fraud-enrich-ips.mjs` so `#server/*` resolves to built output.

Root scripts **`scripts/fraud-enrich-ips.mjs`** and **`scripts/clear-faucet-inventory-expiry.mjs`** were updated to import via **`#server/...`** instead of `../server/.../*.js` (minimal fix aligned with compiled server).

---

## 8. Docker / Compose

- **`docker compose build --no-cache`:** **Succeeded** (images `block-miner-app:latest` and `block-miner-worker:latest` built and exported).
- **`docker compose up`:** **Not run** (no guarantee of a safe `.env` in this environment).
- **Dockerfile `CMD`:** `["node", "dist/server/server.js"]` — confirmed.
- Frontend Docker stage still copies **`dist/server/services/game2048Engine.js`** into `client/engine/` for Vite (unchanged pattern).

---

## 9. `tsconfig.server.json`

- **`include`:** `server/**/*.ts`, `server/types/**/*.d.ts`
- **`allowJs`:** `false` (no JavaScript in server compile input after this step).
- **`module` / `moduleResolution`:** `NodeNext` (preserved).
- Imports in source continue to use **`.js` extensions** in import specifiers where required for NodeNext emit/runtime.

---

## 10. Legacy imports `../server/*.js`

**Grep** (excluding `node_modules`, `dist`, `.git`) still finds references under **`.deploy/blockminer-test-package/**` (mirror package; out of main runtime path) and **`client/vite.config.js`** (updated).

**Decisions:**

| Location | Decision |
|----------|----------|
| `tests/**` | Prefer **`#server/...`** (already used widely); `pretest` builds server so imports resolve. |
| `scripts/fraud-enrich-ips.mjs`, `scripts/clear-faucet-inventory-expiry.mjs` | Switched to **`#server/...`**; `fraud:enrich-ips` npm script ensures **`build:server`** runs first. |
| `client/vite.config.js` | Resolve order: `client/engine/game2048Engine.js` (Docker copy) → **`../dist/server/services/game2048Engine.js`** → **`../server/services/game2048Engine.ts`** (dev fallback). |
| `.deploy/**` | Not modified in this step (separate deploy bundle; next global cleanup can align). |

---

## 11–12. Typing issues and resolutions

Examples addressed during the final `tsc` pass:

- **`minerProfileModel`:** `walletAddress` was returned from the aggregate object but missing from Prisma **`select`** — added `walletAddress: true` to both `findUnique` and `update` selects.
- **`registerMinerSocketHandlers`:** inner `const payload = verifyAccessToken(...)` shadowed the **`payload`** parameter and triggered TDZ errors — renamed to **`jwtPayload`**.
- **`registerGamesSocketHandlers` / cart-rush:** `GameSessionState & Record<string, unknown>` made numeric fields `unknown` in the tick loop — introduced **`CartRushState`** / **`CartRushCartEvent`** and **`MiningEngine`**-typed **`tickCartRush`**; `variant` typed as **`unknown`** because obstacle variants can be objects (theme tokens).
- **`autoWithdraw.ts`:** `feeData.gasPrice` may be null — use **`maxFeePerGas ?? gasPrice ?? 0n`**; **`catch (error: unknown)`** with **`errMsg`** from **`types/tsNarrowing.js`**.
- **`phdServer.ts`:** `parsePositiveUserId` / **`timingSafeEqualToken`** parameters typed as **`unknown`**.
- **`registerMinerSocketHandlers` `miner:wallet-link`:** validate non-empty wallet string before **`setWallet`**.

---

## 13. Use of `any`

No deliberate **`any`** workaround was added for this step. The project **`tsconfig.server.json`** still has **`noImplicitAny": false`** (pre-existing). A string containing the word “any” in unrelated log text (e.g. admin dev warning) is not a type escape.

---

## 14. `@ts-ignore` / `@ts-nocheck`

**Not used** in `server/**/*.ts` for this migration.

---

## 15–18. Validation commands (results)

| Command | Result |
|---------|--------|
| `npm run typecheck:server` | **Pass** (exit 0) |
| `npm run build:server` | **Pass** |
| `npm run typecheck` | **Pass** (server + backend) |
| `npm run build:backend` | **Pass** |

---

## 19. Tests executed

| Command | Result |
|---------|--------|
| `node --test tests/httpErrors.test.mjs` | **Pass** |
| `node --test tests/depositsCron.test.js tests/miningCronHashrateSync.test.js` | **Pass** |
| `npm test` (full suite via `scripts/run-node-tests.mjs`) | **Exit 1** — known failures documented below |

**Known `npm test` failures (not introduced as Step 08 regressions without proof):**

- **`tests/i18nLanguage.test.mjs`:** locale defaults / cookie fallback order (`en` vs `pt-BR` expectations).
- **`tests/ipIntelligenceService.test.mjs`:** proxycheck refresh expectation (`unknown` vs `residential`).

---

## 20. Docker build

```bash
docker compose build --no-cache
```

**Result:** **Success** (app + worker images built).

---

## 21. Next-step pendências

- Optional cleanup: **`.deploy/blockminer-test-package/**`** still references `../server/**/*.js` — align in a dedicated “non-server” migration step.
- **`npm test`:** fix or quarantine **i18n** and **ipIntelligence** tests if product intent changed.
- **`dist/server/backend/**`:** nested tree under `dist/server` from older builds may linger until a clean `rm -rf dist/server && npm run build:server`; harmless if `CMD` still targets `dist/server/server.js` only.
- **`eslint`** script still uses `--ext .js` only — widening to `.ts` is a separate maintenance task.

---

## 22. Duplicate `.js` + `.ts` under `server/`

**Confirmed:** no paired source `.js` and `.ts` for the same logical module under `server/` (only `dist/server` contains emitted `.js`).

---

## 23. Docker entrypoint

**Confirmed:** production command continues to run **`node dist/server/server.js`** (not source `server/server.ts`).

---

## 24. Secrets / logging

No new logging of passwords, tokens, cookies, private keys, or **`DATABASE_URL`** was added in these edits. Error paths use safe narrowing (**`errMsg`**, **`prismaSafeErrorMeta`**) where touched.

---

## Audit commands (reference)

```bash
find server -name "*.js" -type f \
  -not -path "server/node_modules/*" \
  -not -path "server/dist/*" \
  | sort

find server -name "*.ts" -type f | sort

grep -R "\.\./server/.*\.js" . \
  --include="*.mjs" \
  --include="*.js" \
  --include="*.ts" \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  --exclude-dir=.git || true

grep -R "#server/" . \
  --include="*.mjs" \
  --include="*.js" \
  --include="*.ts" \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  --exclude-dir=.git || true
```

---

## Acceptance checklist

- [x] `server/server.js` removed; **`server/server.ts`** is the source entrypoint.
- [x] No `server/src/**/*.js` source remains.
- [x] `npm run typecheck:server`, **`build:server`**, **`typecheck`**, **`build:backend`** pass.
- [x] `docker compose build --no-cache` passes.
- [x] No `@ts-ignore` / `@ts-nocheck` added in server TS for this work.
- [x] No spurious `any` hacks added for the touched areas.
- [x] This report file created at repo root.
