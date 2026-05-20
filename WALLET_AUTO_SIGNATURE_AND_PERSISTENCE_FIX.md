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

**Not run in this environment** (no browser/Rabby in agent sandbox). Recommended checklist:

1. Open `/wallet` — Rabby must not open.
2. Click **Connect wallet** — Rabby connect only.
3. Click **Save / link wallet** — single signature.
4. Reload `/wallet` — linked address shown, no signature.
5. Revisit tab — no signature.

## 13. Build results

| Command | Result |
|---------|--------|
| `npm run typecheck:server` | **Skipped** — `npm` not available in agent shell |
| `npm run build:server` | **Skipped** |
| `npm run build:backend` | **Skipped** |
| `client` `npm run typecheck` | **Skipped** |
| `client` `npm run build` | **Skipped** |

IDE/linter: no issues reported on edited TS/TSX files.

## 14. Docker build

**Not run** (requires `npm` / Docker in environment).

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
