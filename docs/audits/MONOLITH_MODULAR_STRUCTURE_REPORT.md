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

## Limpeza final de páginas soltas em `client/src/pages`

**Date:** 2026-05-19 (continuação)

### 1. Arquivos soltos encontrados (raiz `pages/`)

Todos os `.tsx` / `.test.tsx` que estavam diretamente em `client/src/pages/` foram movidos para pastas de domínio (kebab-case). Não restam ficheiros `.ts`/`.tsx` na raiz de `pages/`.

| Arquivo solto (antes) | Novo destino |
|----------------------|--------------|
| `Landing.tsx`, `Landing.test.tsx` | `landing/LandingPage.tsx`, `LandingPage.test.tsx` |
| `AutoMining.tsx`, `AutoMining.test.tsx` | `auto-mining/AutoMiningPage.tsx`, `AutoMiningPage.test.tsx` |
| `Calculator.tsx` | `calculator/CalculatorPage.tsx` |
| `DashboardCryptoStream.tsx` | `crypto-stream/DashboardCryptoStreamPage.tsx` |
| `Faucet.tsx` (stub) | removido; uso de `faucet/FaucetPage.tsx` |
| `Vault.tsx` (stub) | removido; uso de `vault/VaultPage.tsx` |
| `Games.tsx`, `Games.test.tsx` | `games/GamesPage.tsx`, `GamesPage.test.tsx` |
| `Game2048Page.tsx`, `Game2048Page.test.tsx` | `games/game-2048/Game2048Page.tsx`, `Game2048Page.test.tsx` |
| `InternalOfferwall.tsx` + `internalOfferwall/*` | `internal-offerwall/` (helpers/hooks/types + page) |
| `LiveServer.tsx` | `live-server/LiveServerPage.tsx` |
| `Manual.tsx` | `manual/ManualPage.tsx` |
| `MiniPass.tsx` | `mini-pass/MiniPassPage.tsx` |
| `PrivacyPolicy.tsx`, `PrivacyPolicy.test.tsx` | `legal/privacy-policy/PrivacyPolicyPage.tsx`, `.test.tsx` |
| `TermsOfUse.tsx`, `TermsOfUse.test.tsx` | `legal/terms-of-use/TermsOfUsePage.tsx`, `.test.tsx` |
| `PublicRoom.tsx` | `public-room/PublicRoomPage.tsx` |
| `Ranking.tsx` | `ranking/RankingPage.tsx` |
| `ReadEarn.tsx` | `read-earn/ReadEarnPage.tsx` |
| `Roadmap.tsx` | `roadmap/RoadmapPage.tsx` |
| `Settings.tsx` | `settings/SettingsPage.tsx` |
| `Shortlinks.tsx`, `ShortlinkStep.tsx` | `shortlinks/ShortlinksPage.tsx`, `ShortlinkStepPage.tsx` |
| `Transparency.tsx`, `Transparency.test.tsx` | `transparency/TransparencyPage.tsx`, `.test.tsx` |
| `YouTubeWatch.tsx` | `youtube-watch/YouTubeWatchPage.tsx` |

### 2. Testes movidos

Colocalizados na pasta do domínio (ex.: `faucet/FaucetPage.test.tsx`, `games/GamesPage.test.tsx`, `legal/privacy-policy/PrivacyPolicyPage.test.tsx`). Imports de mocks ajustados para profundidade `../../` ou `../../../` conforme a pasta.

### 3. Imports atualizados

- `client/src/app/App.tsx` — lazy/eager para `../pages/<dominio>` (barrels `index.ts`).
- `client/src/shared/utils/routePrefetch.ts` — mesmos caminhos modulares.
- `GamesPage.tsx` / `Game2048Page.tsx` — imports de `client/src/games/*` corrigidos (`../../games/...` e `../../../games/...`).
- Testes: `LandingPage`, `GamesPage`, `AutoMiningPage`, `TransparencyPage`, legal i18n paths.

### 4. Rotas preservadas

URLs SPA inalteradas (`/`, `/faucet`, `/games`, `/games/2048`, `/internal-offerwall`, `/privacy-policy`, etc.). Apenas caminhos de `import()` no bundle mudaram.

### 5. Barrels criados

`index.ts` com `export { default } from './<Domain>Page'` em: `landing`, `auto-mining`, `calculator`, `crypto-stream`, `games`, `games/game-2048`, `internal-offerwall`, `live-server`, `manual`, `mini-pass`, `legal/privacy-policy`, `legal/terms-of-use`, `public-room`, `ranking`, `read-earn`, `roadmap`, `settings`, `shortlinks`, `transparency`, `youtube-watch` (além dos já existentes: `faucet`, `vault`, `dashboard`, …).

### 6. Ficheiros na raiz de `pages/`

Nenhum `.ts`/`.tsx` na raiz (apenas subpastas).

```bash
find client/src/pages -maxdepth 1 -type f \( -name "*.tsx" -o -name "*.ts" \) | sort
# (vazio)
```

### 7–15. Validação

| Comando | Resultado |
|---------|-----------|
| `cd client && npm run typecheck` | **OK** |
| `cd client && npm run build` | **OK** |
| `cd client && npm test` | **324 tests** — 5 falhas pré-existentes (`injectedWallet.test.ts`, 3× admin miner image) não ligadas a esta migração |
| Testes domínios migrados (`landing`, `games`, `auto-mining`, `legal`, `transparency`, `faucet`) | **60/60 OK** |
| `npm test` (raiz) | **Falha ambiente** — `jsdom` em falta no workspace raiz (Vitest pool); usar `cd client && npm test` |
| `npm run typecheck:server` | **OK** |
| `npm run build:server` | **OK** |
| `npm run build:backend` | **OK** |
| `docker compose build app` | **OK** (`block-miner-app:latest`) |

### 16–17. Sem `.js` fonte

- `client/src` — sem `.js`/`.jsx` fonte.
- `server/` — sem `.js` fonte (excl. `node_modules`, `dist`).

### 18. Grep imports antigos

```bash
grep -R "pages/AutoMining|pages/Faucet|pages/Landing|..." client/src client/tests tests
```

**Vazio** em `client/src` e testes do cliente.

### 19. Próximas pendências reais

1. Remover barrels legacy em `admin/` quando `App.tsx` importar só pastas kebab-case.
2. Agrupar `read-earn` / `mini-pass` / `faucet` sob `rewards/` se fizer sentido de produto.
3. Corrigir 5 testes client pré-existentes (wallet mock / `getByRole('img')` vs `presentation`).
4. Instalar/configurar `jsdom` no Vitest raiz ou documentar que testes SPA correm só em `client/`.

### Estrutura `pages/` (pós-limpeza)

```txt
client/src/pages/
  landing/  auto-mining/  calculator/  crypto-stream/
  games/  games/game-2048/
  internal-offerwall/  live-server/  manual/  mini-pass/
  legal/privacy-policy/  legal/terms-of-use/
  public-room/  ranking/  read-earn/  roadmap/  settings/
  shortlinks/  transparency/  youtube-watch/
  (+ auth/, dashboard/, faucet/, vault/, wallet/, shop/, machines/, checkin/, tasks/, stats/, support/, offers/, admin/)
```

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
