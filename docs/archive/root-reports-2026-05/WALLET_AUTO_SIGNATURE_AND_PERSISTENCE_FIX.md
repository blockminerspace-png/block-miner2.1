# Wallet auto-signature and persistence fix

## 1. Root cause of automatic signature

Opening `/wallet` mounted `useWallet()`, which ran a `useEffect` whenever WalletConnect/AppKit reported `kitConnected` + `kitAddress`. That effect called `syncKitWalletWithServer()` → `verifyWithServer()` → `personal_sign` / `signMessageAsync` without any user click.

Injected connect path `connectInjectedAndVerify()` also called `verifyWithServer()` immediately after `eth_requestAccounts`, so the header **Connect** button triggered connect **and** sign in one step.

## 2. File / hook that triggered signature

| Location | Behavior (before) |
|----------|-------------------|
| `client/src/shared/hooks/useWallet.ts` | `useEffect` on `[kitConnected, kitAddress, …]` → `syncKitWalletWithServer` |
| `client/src/shared/hooks/useWallet.ts` | `connectInjectedAndVerify()` → `verifyWithServer()` after connect |
| `client/src/shared/hooks/useWallet.ts` | `connect()` when WC already connected → `syncKitWalletWithServer` |

## 3. Passive detection (after)

- `client/src/pages/wallet/useWalletLink.ts` — mount only calls `loadSavedWallet()` (`GET /api/wallet/me`) and `getInjectedWalletProviders()` (EIP-6963 / provider list, no RPC permission).
- `useWallet.ts` — `checkConnection()` uses `eth_accounts` only (via `safeEthAccounts`), not `eth_requestAccounts`.
- Replaced WC auto-sync effect with session mirror only (`setAccount` / `setIsConnected`), no signature.

## 4. Action that connects wallet (user click)

- Header: **Connect wallet** → `useWalletLink.connectWallet()` → `connectInjectedWallet()` → `eth_requestAccounts`.
- Deposits (unchanged economy): deposit tab buttons → `useWallet.connect()` / `connectWalletConnect()` — connect only, no auto-verify on mount.

## 5. Action that requests signature (user click)

- Header: **Save / link wallet** → `useWalletLink.linkWallet()`:
  1. `POST /api/wallet/link/challenge`
  2. `personal_sign` in browser
  3. `POST /api/wallet/link/verify`

## 6. Backend challenge

- `POST /api/wallet/link/challenge` — `createWalletLinkChallengeForUser()` in `wallet.service.ts`.
- Nonce + message stored in `CallbackQueue` (`WALLET_LINK_CHALLENGE`), TTL 10 minutes, scoped per `userId` + address hash.
- Message format:

```text
BlockMiner wallet link
User: {userId}
Address: {checksum address}
Nonce: {hex}
IssuedAt: {iso}
```

## 7. Backend signature validation

- `POST /api/wallet/link/verify` — `verifyAndLinkWalletForUser()`.
- Loads pending challenge, `ethers.verifyMessage`, compares recovered address (case-insensitive).
- Marks challenge completed; invalidates other pending challenges for same user/address.
- Legacy `POST /api/wallet/update-address` still supported via `verifyLegacyWalletOwnership()` for older clients (not used by new UI).

## 8. Backend persistence

- `wallet.repository.ts` → `saveUserWallet()` updates `User.walletAddress` (Prisma).
- `GET /api/wallet/me` returns saved address via `getWalletMeForUser()`.
- `DELETE /api/wallet/link` clears `walletAddress`.

## 9. Frontend loads saved wallet

- Mount: `walletApi.getWalletMe()` → `savedWallet` state.
- After successful link: refresh `savedWallet` + `fetchWalletData()` for balance/header consistency.
- `profileWalletAddress` synced from `savedWallet.walletAddress` for withdraw prefill.

## 10. Guarantee: opening `/wallet` does not sign

- No `personal_sign` / `signMessage` in any `useEffect` on wallet page or `useWalletLink`.
- Header no longer calls `useWallet.connect()` on load.
- WC kit effect no longer calls `syncKitWalletWithServer`.

## 11. Guarantee: reload `/wallet` does not sign

- Saved wallet shown from `GET /api/wallet/me`; no challenge/sign unless user clicks **Save / link wallet**.

## 12. Manual Rabby test

**Not executable in the agent environment** (no Rabby/browser extension in automated browser). Checklist for the account owner:

1. Open `https://blockminer.space/wallet` — Rabby must not open.
2. No signature prompt on load.
3. Click **Connect wallet** — Rabby opens for connection only.
4. Connect — address shows as connected (amber state).
5. Click **Save / link wallet** — exactly one signature.
6. Success toast / linked state (green).
7. Reload `/wallet` — linked address without new signature.
8. Close tab, reopen `/wallet` — still no auto Rabby/signature.

## 13. Build results (Docker Node 20 — real run)

Host shell has no `npm`; validation used `docker run node:20-bookworm-slim` with repo mount + `npx prisma generate`.

| Command | Result |
|---------|--------|
| `npm run typecheck:server` | **PASS** (after `prisma generate`) |
| `npm run build:server` | **PASS** |
| `npm run build:backend` | **PASS** |
| `client` `npm run typecheck` | **PASS** |
| `client` `npm run build` | **PASS** (~14.6s) |
| `client` vitest `src/pages/wallet/` | **PASS** (3 files, 7 tests) |

## 14. Docker build

| Run | Result |
|-----|--------|
| Local `docker compose --env-file .env.production build --no-cache app worker` | **PASS** (images `block-miner-app`, `block-miner-worker`) |
| VM `scripts/vm-deploy-local-over-ssh.py` @ `242deec8` + re-run @ `e8093aee` | **PASS** — 5 containers healthy, migrations up to date |

Post-deploy smoke (no session, 2026-05-20):

| URL | Status | Content-Type |
|-----|--------|----------------|
| `GET /api/wallet/me` | **401** | `application/json` |
| `GET /api/auth/session` | **401** | `application/json` |
| `GET /login` | **200** | `text/html` |

Production SPA: wallet link API strings live in lazy chunk `assets/index-Da4pbaFy.js` (`wallet/me`, `link/challenge`); header strings in main bundle (`connect_browser_wallet`). `syncKitWalletWithServer` not referenced from mount path in served bundles.

## 15. `$queryRawUnsafe`

Grep: only comment reference in `server/models/db.ts` — **0 runtime usage**.

## 16. PrismaClient

Grep `new PrismaClient` under `server/modules/`: **0 matches** (central `server/src/db/prisma.js`).

## 17. Server source `.js`

No new `.js` source files under `server/` (TypeScript modules only).

## 18. Client `client/src` `.js` / `.jsx`

No `.js`/`.jsx` under `client/src/pages/wallet` or new wallet link code.

## Audit grep (client wallet + shared)

- `personal_sign`: only in `useWalletLink.ts` (`signLinkMessage`, called from `linkWallet` click handler).
- `useWallet.ts` still has `personal_sign` inside `verifyWithServer` (legacy/deposit path only; not called on mount).
- `eth_requestAccounts`: only via `connectInjectedWallet()` from explicit connect handlers.

## API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/wallet/me` | Saved wallet for session user |
| POST | `/api/wallet/link/challenge` | Issue sign message |
| POST | `/api/wallet/link/verify` | Verify + persist |
| DELETE | `/api/wallet/link` | Unlink |
| POST | `/api/wallet/update-address` | Legacy verify (kept) |

## Files changed

- `server/modules/wallet/*` — link flow, repository, routes
- `client/src/pages/wallet/useWalletLink.ts` — new hook
- `client/src/pages/wallet/wallet.api.ts`, `wallet.types.ts`
- `client/src/pages/wallet/WalletPage.tsx` — header UX
- `client/src/shared/hooks/useWallet.ts` — remove auto-sign on mount/connect

---

## Validação final pós-deploy

1. **Commit validado:** `242deec8` (`fix: prevent automatic wallet signatures and persist linked wallet`); docs follow-up `e8093aee`.
2. **Branch:** `chore/dead-code-cleanup`.
3. **Comandos typecheck/build:** `npx prisma generate --schema=server/prisma/schema.prisma`, `npm run typecheck:server`, `npm run build:server`, `npm run build:backend`, `cd client && npm run typecheck && npm run build` — all inside `docker run --rm -v $PWD:/app -w /app node:20-bookworm-slim`.
4. **Caminho:** Docker Node 20 (host sem `npm`); Docker Compose para imagens `app`/`worker`.
5. **Docker build:** `--no-cache app worker` local **PASS**; VM deploy **PASS** (stack 5/5).
6. **Curls públicos:** `/api/wallet/me` e `/api/auth/session` → 401 JSON; `/login` → 200 HTML; sem 502 após warm-up.
7. **Rabby (manual):** pendente confirmação humana no browser com extensão Rabby (agente não tem extensão). Código + bundle + API cobrem o fluxo esperado.
8. **`/wallet` não assina no mount:** `useWalletLink` `useEffect` só `loadSavedWallet` + `getInjectedWalletProviders`; `personal_sign` apenas em `linkWallet` handler.
9. **`/wallet` não conecta no mount:** `eth_requestAccounts` só em `connectWallet` handler (`connectInjectedWallet`); header não chama `useWallet.connect()` no load.
10. **Persistência backend:** integração **PASS** — `WALLET_LINK_SERVICE_OK` (Postgres via `docker compose` + `prisma db push`): challenge → sign → verify → `GET` me → unlink → me null.
11. **Reload sem assinatura:** garantido por design (só `GET /api/wallet/me` no mount); requer confirmação Rabby no passo 7.
12. **Pendências reais:** única pendência = checklist Rabby 16 passos feita por humano com sessão autenticada; testes `tests/wallet/*.js` antigos têm 2 falhas pré-existentes não relacionadas ao link flow.

### Fase 1 — Auditoria de código (2026-05-20)

```bash
git log --oneline -3
# e8093aee docs: update wallet fix report with production deploy smoke
# 242deec8 fix: prevent automatic wallet signatures and persist linked wallet
```

| Check | Result |
|-------|--------|
| `personal_sign` em `client/src/pages/wallet` | só `useWalletLink.ts` → `signLinkMessage` → `linkWallet` |
| `eth_requestAccounts` em wallet pages | nenhum; só `injectedWallet.ts` via `connectInjectedWallet` |
| `useEffect` dispara sign/connect | **não** — `useWalletLink` mount passivo; `useWallet` WC effect só `setAccount` |
| `$queryRawUnsafe` | **0** runtime (comentário em `db.ts` apenas) |
| `new PrismaClient` em `server/modules` | **0** |
| `syncKitWalletWithServer` em `useEffect` | **removido** (função mantida para legado deposit, não chamada no mount) |
