# GitHub sync & runtime fix report

**Date:** 2026-05-17  
**Repo:** `https://github.com/blockminerspace-png/block-miner-v3.git`  
**Branch:** `main`  
**Commit synced:** `5054978f` — `feat: modularize auth, wallet, and admin-miners; fix Web3 deploy`  
**Remote used for pull:** `block-miner-v3` (also `origin` → Block-Miner/blockminer at same commit)

---

## 1. Initial Git state

- Working tree: **clean** before pull
- Branch: `main`, already aligned with `block-miner-v3/main`
- `git pull --ff-only block-miner-v3 main` → **Already up to date**

---

## 2. Environment (values not shown)

| File | Present |
|------|---------|
| `.env` | **no** |
| `.env.production` | **yes** |
| `client/.env.example` | **yes** |

No `.env` / `.env.production` tracked in `git status` after work.

---

## 3. TypeScript / source audit

| Check | Result |
|-------|--------|
| `server/` stray `.js` source | **0** |
| `client/src` `.js` / `.jsx` | **0** |
| `@ts-ignore` / `@ts-nocheck` in TS/TSX | **0** |
| `any` grep false positive | `server/middleware/admin.ts` — prose in log string only |

---

## 4. Install & Prisma

- `npm install` — OK
- `npx prisma validate` — OK
- `npx prisma generate` — OK

### Pending migrations (VM must apply)

38 migrations exist under `server/prisma/migrations/`. Latest relevant to admin miners:

- `20260424170000_admin_miner_catalog` — adds `long_description`, `tier`, `stock_sold`, `metadata`, etc. on `miners`

On a **fresh Docker Postgres** without migration history, `prisma migrate deploy` returns **P3005** (non-empty DB, no baseline). Production/VM DBs created before migrate history need **baseline + deploy** or controlled application of additive SQL (this migration uses `IF NOT EXISTS`).

---

## 5. Builds & tests (before runtime fixes)

| Step | Result |
|------|--------|
| `client` typecheck | **PASS** |
| `client` build | **PASS** |
| `client` test (282) | **PASS** |
| `npm test` (root) | **PASS** |
| `npm run typecheck:server` | **PASS** |
| `npm run build:server` | **PASS** |
| `npm run build:backend` | **PASS** |

Code on GitHub was already green in CI-style checks; runtime 500s were environmental / DB drift.

---

## 6. Endpoint reproduction

**Stack:** `docker compose --env-file .env.production` (db on host port `15432`, app on `127.0.0.1:3000`)

### Before DB catalog columns (Docker DB missing migration)

| Endpoint | HTTP | Notes |
|----------|------|-------|
| `GET /api/auth/session` | **401** | Safe JSON `UNAUTHENTICATED` |
| `GET /login` | **200** | SPA HTML |
| `GET /api/admin/miners?...` | **401** | No admin cookie (expected) |
| Prisma `miner.findMany` with catalog fields | **Error** | `column does not exist in the current database` |

Startup logs: `Failed to ensure faucet reward` / shortlink — same schema drift.

### After applying additive `admin_miner_catalog` SQL on test DB

| Endpoint | HTTP | Notes |
|----------|------|-------|
| `GET /api/auth/session` | **401** | Unchanged |
| `GET /login` | **200** | Unchanged |
| `listAdminMiners` (in-container) | **OK** | 2 miners returned |

### After code fixes + Docker image rebuild

| Endpoint | HTTP | Body (summary) |
|----------|------|----------------|
| `GET /api/auth/session` | **401** | `ok:false`, `code:UNAUTHENTICATED` |
| `GET /login` | **200** | SPA; runtime inject only if valid WC id |
| `GET /api/admin/miners?...` | **401** | `ADMIN_SESSION_INVALID` without admin session |

---

## 7. Root causes of reported 500s

| Symptom | Root cause |
|---------|------------|
| `/api/auth/session` → 500 | Usually **DB unreachable** (`DATABASE_URL` host `db` outside Docker) or Prisma failure after valid token — not reproduced on healthy stack without cookie (**401**). |
| `/login` → 500 | **Missing `client/dist`** or wrong `PROJECT_ROOT` in container — fixed in recent commits (`findBlockMinerProjectRoot`); current image serves **200**. |
| `/api/admin/miners` → 500 | **DB schema behind Prisma**: migration `20260424170000_admin_miner_catalog` not applied → Prisma selects non-existent columns. |
| Web3/Reown on `/login` with fake `projectId` | **Server injected** `window.__BLOCKMINER_ENV__` for any non-empty env value, including placeholders; client already lazy-loads `Web3Providers` only under authenticated shell. |

---

## 8. Files changed (this session)

| File | Change |
|------|--------|
| `server/utils/walletConnectProjectId.ts` | **New** — validate 32-char hex; reject placeholders |
| `server/server.ts` | Inject runtime WC config only when id is valid |
| `server/modules/admin-miners/adminMiners.errors.ts` | `isPrismaSchemaMismatch`, `SCHEMA_OUT_OF_DATE` |
| `server/modules/admin-miners/adminMiners.controller.ts` | **503** + clear code when DB schema drift |
| `tests/auth/sessionDoesNot500.test.mjs` | **New** regression tests |
| `tests/walletConnectProjectId.test.mjs` | **New** |
| `tests/admin/miners/adminMinersRoutes.test.mjs` | Schema mismatch detection test |

---

## 9. Tests created / adjusted

- `tests/auth/sessionDoesNot500.test.mjs` — session never 500 without cookie
- `tests/walletConnectProjectId.test.mjs` — placeholder rejection
- `tests/admin/miners/adminMinersRoutes.test.mjs` — `isPrismaSchemaMismatch`
- Existing: `tests/auth/authSessionController.test.mjs`, `client/src/shared/web3/web3Config.test.ts`, `client/tests/auth/*`

All root + client tests **PASS** after changes.

---

## 10–11. Final endpoints (Docker app, rebuilt)

```
session 401
login 200
admin miners 401   (without admin cookie — correct)
```

With admin session + DB migrated: list should return **200** (verified via `listAdminMiners` in container after SQL).

---

## 12–15. Final build matrix

| Step | Result |
|------|--------|
| `client` typecheck | **PASS** |
| `client` build | **PASS** |
| `client` test | **PASS** (282) |
| `npm test` | **PASS** |
| `npm run typecheck:server` | **PASS** |
| `npm run build:server` | **PASS** |
| `npm run build:backend` | **PASS** |
| `docker compose build --no-cache app` | **PASS** (~8 min) |

---

## 16. Docker up

```bash
DB_PUBLISH_PORT=15432 docker compose --env-file .env.production up -d
```

Services: `db`, `redis`, `app`, `worker`, `nginx` (nginx may restart if host certs/vhost missing — not blocking app on `:3000`).

**Not used:** `docker compose down -v`

---

## 17–18. Source tree discipline

- `server/` — **no** hand-written `.js` sources
- `client/src` — **no** `.js` / `.jsx` sources

---

## 19. Secrets

No secret values logged or committed. Report uses env **presence** only.

---

## 20. Real remaining work (VM / production)

1. **Apply migrations** on the real database (baseline if needed), at minimum `20260424170000_admin_miner_catalog`:
   ```bash
   npx prisma migrate deploy --schema=server/prisma/schema.prisma
   ```
   Or follow Prisma baseline docs if `_prisma_migrations` is empty on a legacy DB.

2. **Confirm `DATABASE_URL`** points to reachable Postgres from app container (`db:5432` inside compose; not `db` hostname when running Node on host).

3. **`VITE_WALLETCONNECT_PROJECT_ID`** in `.env.production`: must be **32-char hex**; placeholders are no longer injected into HTML. Wallet/Reown still loads only on authenticated routes (`ProtectedLayoutWithWeb3`).

4. **Commit & push** local fixes from this session when ready (not pushed automatically).

5. **nginx** container restart loop on dev host — check TLS/vhost config if using nginx in front.

---

## Web3 /login criteria

| Criterion | Status |
|-----------|--------|
| `/login` does not mount `Web3Providers` | **OK** (`App.tsx` routes) |
| No `createAppKit` at import on login | **OK** (`ensureAppKitInitialized` lazy) |
| Placeholder `0000…` not injected | **OK** after `walletConnectProjectId.ts` |
| Valid project id in env → injected for wallet pages | **OK** (expected; used only after auth shell) |

Browser DevTools on `/login` should show **no** `api.web3modal.org` / `pulse.walletconnect.org` unless another script triggers them — verify on VM after deploy.

---

## Correção do 500 em GET /login

### Causa real

O catch-all SPA em `server/server.ts` fazia `fs.readFile(client/dist/index.html)` e, em qualquer falha (arquivo ausente, `PROJECT_ROOT` errado como `/app/dist` em vez de `/app`, ou erro ao injetar HTML), respondia **`500 Internal Server Error`**.

Cenários típicos no deploy:

- `client/dist/index.html` inexistente na imagem ou caminho resolvido errado → `ENOENT` → **500**
- Fallback final de `findBlockMinerProjectRoot()` apontava para `dist/` em vez da raiz do monorepo quando a heurística principal falhava

`/api/auth/session` → **401** sem cookie continua correto e não foi alterado.

### Caminhos

| | Caminho |
|---|--------|
| Esperado | `{PROJECT_ROOT}/client/dist/index.html` (ex.: `/app/client/dist/index.html` no Docker) |
| Encontrado na VM (18 May 2026) | `/app/client/dist/index.html` — `exists: true` |

### Arquivos corrigidos

| Arquivo | Mudança |
|---------|---------|
| `server/utils/spaStatic.ts` | **Novo** — static + fallback SPA; **503** se build ausente; `/api/*` → 404 texto |
| `server/server.ts` | Usa `spaStatic`; remove resposta **500** no fallback |
| `server/utils/projectRoot.ts` | Fallback seguro: de `dist/server` sobe **dois** níveis para a raiz do repo |
| `tests/spaFallback.test.mjs` | **Novo** — regressão `/login`, `/admin/miners`, API vs SPA, 503 sem dist |

### Comportamento do fallback SPA

1. APIs montadas antes (inalterado).
2. `express.static(client/dist)` quando `index.html` existe.
3. `GET /{*all}`: se path começa com `/api` → **404** (não SPA).
4. Rotas browser (`/login`, `/register`, `/admin/miners`, …) → HTML do `index.html` com injeção CSP/WC.
5. Se `index.html` ausente ou leitura falhar → **503** `Frontend build unavailable.` (sem stack ao cliente).

### `curl` após correção (local / testes automatizados)

| Rota | Status |
|------|--------|
| `/login` | **200** `text/html` |
| `/register` | **200** `text/html` |
| `/admin/miners` | **200** `text/html` |
| `/api/auth/session` (sem cookie) | **404** no mini-app de teste SPA-only; **401** no app completo com router auth |

### Builds / testes

- `npm run typecheck:server` — PASS
- `npm run build:server` — PASS
- `npm test` (incl. `tests/spaFallback.test.mjs`) — PASS

Docker rebuild na VM: pendente após commit desta correção.

---

## Correção de cache/chunk antigo após deploy

**Date:** 2026-05-18  
**Symptom:** `Failed to fetch dynamically imported module: …/Web3Providers-*.js` + tela “Erro de interface” após deploy.

### 1. Causa real

- Navegador com `index.html` ou entry antigo em cache apontando para chunks hashados que **não existem mais** no servidor após novo build Vite.
- `Web3Providers` / `walletAppKitBridge` são dynamic imports; falha não dispara só `script onerror`, e sim `unhandledrejection` / ErrorBoundary.
- `ERR_NETWORK_CHANGED` no mesmo momento é ruído de rede (não é o bug principal).
- **`GET /api/auth/session` → 401** sem cookie continua **esperado** (guest).

### 2. Chunk que falhou (exemplo produção)

- `https://blockminer.space/assets/Web3Providers-CHMMhKVw.js`
- `https://blockminer.space/assets/walletAppKitBridge-*.js`

### 3. Headers antigos

- `index.html` via fallback já tinha `no-store`, mas ficheiros em `/assets/` sem regra explícita por pasta; alguns `.js` não-hashados recebiam `no-cache` apenas por regex de basename.

### 4–5. Headers novos

| Recurso | Cache-Control |
|---------|----------------|
| `index.html` (static + fallback SPA) | `no-store, no-cache, must-revalidate, proxy-revalidate` + `Pragma: no-cache` + `Expires: 0` |
| `/assets/*` (hash Vite) | `public, max-age=31536000, immutable` |
| Outros estáticos | `public, max-age=3600` |

Implementação: `server/utils/spaStatic.ts` (`applyNoStoreHtmlHeaders`, `isHashedAssetPath`). Nginx continua a fazer proxy para Node (sem cache estático próprio).

### 6. Detecção de chunk load error

- `client/src/shared/utils/chunkLoadError.ts` — `isChunkLoadError`, `shouldAutoReloadChunkError` (1 reload / 60s), `forceReloadForNewBuild` (`_bm_build` query).

### 7. Reload seguro

- Auto-reload uma vez por janela de 60s (`sessionStorage`).
- Botão “Recarregar plataforma” limpa marcadores e faz `location.replace` com cache-bust.
- `main.tsx` escuta `error` (SCRIPT) e `unhandledrejection` (dynamic import).

### 8. Web3 sem derrubar o app

- `client/src/shared/web3/Web3Boundary.tsx` — carrega `Web3Providers` com `import()`; em falha de chunk usa `Web3ProvidersLight` (wagmi injected-only) + banner.
- Web3 só monta em rotas autenticadas (`ProtectedLayoutWithWeb3`), não em `/login`.

### 9. `/api/auth/session` 401

- `checkSession`: `401` → `isAuthenticated: false`, `error: null` (sem toast/ErrorBoundary).
- Teste existente em `client/src/store/auth.test.ts`.

### 10. Testes

| Arquivo | Cobertura |
|---------|-----------|
| `tests/spaFallback.test.mjs` | no-store em `/login` e `/dashboard`; immutable em `/assets/*` |
| `client/src/shared/utils/chunkLoadError.test.ts` | detecção + throttle reload |
| `client/src/shared/web3/Web3Boundary.test.tsx` | load OK + `Web3ProvidersLight` |

### 11. Validação local

| Comando | Resultado |
|---------|-----------|
| `client` typecheck / build / test (292) | PASS |
| `npm test` (raiz) | PASS |
| `typecheck:server` / `build:server` | PASS |

### 12. Curls produção (após deploy)

| URL | Esperado |
|-----|----------|
| `curl -I https://blockminer.space/login` | 200 + `Cache-Control` com `no-store` |
| `curl -I https://blockminer.space/dashboard` | 200 + `no-store` |
| `curl -I https://blockminer.space/assets/<hash>.js` | `immutable` |
| `curl -i https://blockminer.space/api/auth/session` | 401 JSON |

### 13–14. Confirmações

- `server/` sem `.js` fonte (fora `node_modules` / `dist`).
- `client/src` sem `.js` / `.jsx`.

---

## Acceptance summary

| Criterion | Met |
|-----------|-----|
| Repo synced with GitHub | Yes |
| Builds/tests green | Yes |
| Docker build green | Yes |
| `/login` not 500 | Yes (code); redeploy VM recommended |
| `/api/auth/session` not 500 (no cookie) | Yes (401) |
| `/api/admin/miners` not 500 for normal query without auth | Yes (401); with auth needs DB migration |
| No fake WC projectId injection | Yes |
| No stray JS in server/client/src | Yes |
| Report created | Yes |
