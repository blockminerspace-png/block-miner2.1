# Runtime assets, Socket.IO, and wallet balance fix

**Date:** 2026-05-19  
**Scope:** Production MIME/`text/html` on missing JS chunks, `/socket.io` WebSocket noise, `/api/wallet/balance` 502 handling, wallet polling backoff.

---

## 1. Root cause — MIME `text/html` on module scripts

**Symptom:** `Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html"` for hashed files such as `wifi-Cknu6UMX.js`, `index-C0nSzMRA.js`.

**Cause:** After deploy, the browser kept an old `index.html` referencing removed Vite chunks. Requests to `/assets/<old-hash>.js` missed `express.static` and hit the SPA catch-all (`app.get("/{*all}")`), which returned `index.html` with `Content-Type: text/html`.

**Chunks on disk:** Stale hashes from a previous build do not exist in the new `client/dist/assets/` tree — expected after deploy.

---

## 2. Fix — `/assets/*` never SPA fallback

**File:** `server/utils/spaStatic.ts`

| Path | Behaviour |
|------|-----------|
| `/assets/*` existing file | `200` + `application/javascript` (or correct type) + `immutable` cache |
| `/assets/*` missing | `404` JSON `ASSET_NOT_FOUND` — **never** `index.html` |
| `*.js` / `*.css` / `*.wasm` at other paths (missing) | `404` JSON `ASSET_NOT_FOUND` |
| `/api/*`, `/uploads/*`, `/socket.io/*` on GET catch-all | `404` JSON `ROUTE_NOT_FOUND` |
| `/wallet`, `/login`, … | `200` `text/html` + `no-store` |

`express.static` uses `fallthrough: true`; dedicated `app.use("/assets", …)` handles misses.

---

## 3. Stale chunk UX (client)

**Files:** `client/src/shared/utils/chunkLoadError.ts`, `client/src/main.tsx`, `client/src/shared/components/ErrorBoundary.tsx`

- Detects MIME/`text/html` module script errors.
- Auto-reload once per 60s via `_bm_build` query param.
- Error boundary: “A plataforma foi atualizada” + **Recarregar plataforma**.

---

## 4. Socket.IO / WebSocket

**Symptom:** `WebSocket connection to 'wss://blockminer.space/socket.io/…' failed`.

**Notes:**

- Socket.IO is mounted on the same `http.Server` as Express (`server/server.ts`).
- Nginx proxies `/socket.io/` with `Upgrade` / `Connection` + `proxy_read_timeout 60s` (`nginx/nginx.conf`).
- Client uses `transports: ['polling', 'websocket']` (polling first) in `client/src/store/game.ts`.
- Catch-all no longer returns HTML for `/socket.io/*` (404 JSON if request reaches Express without Engine.IO).

**Polling smoke (no auth):** `GET /socket.io/?EIO=4&transport=polling` should hit Engine.IO on the app process (not SPA HTML). During app restart/deploy, transient failures are expected.

---

## 5. `/api/wallet/balance` 502

**Typical causes of 502:**

- Nginx upstream unavailable while `app` container restarts (deploy).
- App crash / timeout (less common for this route).

**Backend change:** `getBalance` unexpected errors → `503` JSON `WALLET_BALANCE_UNAVAILABLE` (not empty 502 from proxy).

**Auth:** No session → `401` JSON via `requireSessionUser` (unchanged).

**Frontend:** `WalletPage` uses adaptive polling with backoff on `502`/`503`, stops on `401`, single toast for unavailable state (`wallet.balance_unavailable`).

---

## 6. Tests

| Test | Coverage |
|------|----------|
| `tests/spaFallback.test.mjs` | Missing `/assets/*.js` → 404 JSON; API/socket.io not SPA |
| `tests/wallet/walletBalanceRoutes.test.mjs` | Handshake auth policy |
| `client/src/pages/wallet/walletBalancePolling.test.ts` | 401/502/503 classification, backoff |
| `client/src/shared/utils/chunkLoadError.test.ts` | MIME text/html detection |

---

## 7. Validation (local)

| Command | Result |
|---------|--------|
| `tsc -p tsconfig.server.json` | OK |
| `node --test tests/spaFallback.test.mjs` | 10/10 pass |
| `cd client && npm run typecheck` | OK |
| `cd client && vitest run walletBalancePolling + chunkLoadError` | 7/7 pass |
| `cd client && npm run build` | OK |

---

## 8. Production checks (2026-05-19 deploy)

| URL | Result |
|-----|--------|
| `GET /wallet` | `200` `text/html` |
| `GET /assets/arquivo-inexistente.js` | `404` `application/json` — `ASSET_NOT_FOUND` (not HTML) |
| `GET /assets/wifi-Cknu6UMX.js` (stale hash) | `404` JSON (old deploy chunk) |
| `GET /api/auth/session` (no cookie) | `401` JSON |
| `GET /api/wallet/balance` (no cookie) | `401` JSON (not 502) |
| `GET /socket.io/?EIO=4&transport=polling` | `200` Engine.IO payload (`sid`, `upgrades`) |

**Deploy:** `/tmp/blockminer-deploy-20260519-1545.zip` → `/root/block-miner-v3`, Docker rebuild OK.

**User action:** `Ctrl+Shift+R` on `/wallet` so `index.html` matches new hashed assets in `client/dist`.

---

## 9. Source hygiene

- `client/src` — no `.js`/`.jsx` source added.
- `server/` — no new `.js` source files (compiled to `server/dist` via `tsc`).

---

## 10. Remaining / operational

1. **Hard refresh** (`Ctrl+Shift+R`) after each deploy to drop stale `index.html` / service worker cache.
2. **502 during deploy** — wait for `app` healthy; polling backs off automatically.
3. **Reown `Discarding cache for address`** — informational AppKit log; not a BlockMiner API failure.
