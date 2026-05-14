# BlockMiner — security audit (single report)

**Canonical copy:** update this file only. Do not add parallel reports such as `SECURITY-*-<date>.md` or duplicate root-level security markdown.

**Last updated:** 2026-04-17  
**Scope:** Server (`server/`), security middleware, wallet/deposit flows, Prisma usage, client-facing headers (CSP). Not a full penetration test; no live exploit attempts.

---

## Executive summary

The application uses a **solid baseline**: **Helmet** (including CSP), **HTTPS + HSTS** in production, **CORS** configuration module, **CSRF** double-submit cookie for mutating API calls, **Postgres-backed sliding-window rate limits** on sensitive routes, **Prisma** for most persistence, **audit context** middleware on `/api`, and **structured security logging** for CSRF failures and rate limits.

Main residual risks: **(1)** legacy `server/models/db.js` exposes **raw SQL helpers** (`$queryRawUnsafe`) if ever called with string-concatenated SQL; **(2)** **CSP script hashes** for Reown/AppKit must be **updated when the wallet SDK changes**; **(3)** **WalletConnect `projectId`** must be real at **Vite build** time or the wallet UI gets **403** from Reown (not a CSP issue); **(4)** global API limiter **skips** some high-frequency paths — confirm they are read-only and abuse-resistant; **(5)** review **Socket.IO** handlers for authorization on every privileged action.

**Production ops:** if you still need `/api/auth/reset-password-manual` or `/api/auth/admin/force-password-reset`, set **`ALLOW_ADMIN_PASSWORD_RESET_API=1`** (otherwise they return 404).

**Hygiene (operations):** keep secrets out of Git (`.env`, exports, DB dumps); rotate anything ever exposed; prefer a secrets manager for production.

---

## Findings checklist (living)

| ID | Area | Severity | Finding | Status / action |
|----|------|----------|---------|-----------------|
| F1 | SQL | Medium (if used) | `server/models/db.js` exposes `$queryRawUnsafe` | Ban new usages; grep for `run\|get\|all` with dynamic SQL; migrate to Prisma |
| F2 | CSP | Low–Med | Inline Reown scripts need **fixed hashes** in `csp.js` | Update hashes when upgrading `@reown/appkit` |
| F3 | Build / UX | Low | Missing `VITE_WALLETCONNECT_PROJECT_ID` → Reown **403** | Document in deploy; validate in CI |
| F4 | Rate limit | Low | Global limiter **skips** some `/api` paths | Re-review skips quarterly |
| F5 | Realtime | Medium | Socket.IO events must re-verify identity | Per-event auth checklist + tests |
| F6 | CSRF | Low | New POST routes need correct skip or CSRF | Code review template |
| F7 | Headers | Low | Optional `Referrer-Policy` / `Permissions-Policy` | Helmet tuning |
| R1 | Auth | Medium | Admin shared secret compared with `===` (timing) | **Fixed:** SHA-256 digest + `timingSafeEqual` (`server/routes/auth.js`) |
| R2 | Auth | Medium | Legacy password reset / admin-key routes without dedicated limits | **Fixed:** IP limiters on legacy completion + admin-key routes |
| R3 | SQL / ORM | Low–Med | `game2048Service` row lock via `$queryRaw` flagged by tooling | **Hardened:** bounded user id + `Prisma.sql` (`server/services/game2048Service.js`) |
| R4 | Input | Medium | Loose `Number` / `parseInt` on admin & vault paths | **Fixed:** strict digit-parsing helpers (`server/phdServer.js`, `server/routes/admin.js`, `server/controllers/vaultController.js`) |
| R5 | Path | Low | Backup download path must stay inside backup dir | **Fixed:** `resolve` + `relative` + `realpath` (`server/services/databaseBackupService.js`) |
| R6 | Process | Low | `spawn` with `shell: true` in backup utilities | **Fixed:** `shell: false`; `tar` as argv array; cloud hook via `sh -c`/`cmd` without `shell: true` option (`server/utils/backup.js`) |
| R7 | Crypto | Low | `Math.random()` for minigame board shuffle | **Fixed:** Fisher–Yates + `crypto.randomInt` (`server/src/socket/registerGamesSocketHandlers.js`) |
| R8 | Auth | High | `forgot-password` returned `resetToken` in JSON when SMTP was off | **Fixed:** generic response only; no token in body (`server/routes/auth.js`) |
| R9 | Auth | High | Admin-key password reset always reachable in production | **Fixed:** `ALLOW_ADMIN_PASSWORD_RESET_API=1` required in production (`server/routes/auth.js`) |
| R10 | Upload / XSS | Med | SVG uploads + static `/uploads` | **Fixed:** disallow new SVG uploads in admin multer; serve `.svg` as `application/octet-stream` + CSP (`server/routes/admin.js`, `server/server.js`) |
| R11 | Realtime | Med | Clients could open Socket.IO with bogus `auth.token` | **Fixed:** `io.use` rejects invalid explicit JWT (`server/server.js`) |
| R12 | Authz noise | Low | Unused XOR “Iron Dome” headers on `requireAuth` | **Removed:** (`server/middleware/auth.js`) |
| R13 | Vault / UX | Med | Turnstile on `/vault/move-to-vault` blocked rack→inventory flows without a widget | **Removed:** Turnstile middleware from vault write routes; auth + rate limit + idempotency remain (`server/routes/vault.js`) |

---

## Code remediations (2026-04-16)

Batch aligned with internal findings review:

1. **2048 user row lock:** validate `userId` range; `Prisma.sql` for the `FOR UPDATE` probe.
2. **Password / admin key routes:** timing-safe comparison of `ADMIN_SECURITY_CODE`; stricter distributed rate limits on legacy reset completion and admin-key reset endpoints.
3. **PHD service:** decimal-only string parsing for `userId` with safe integer bounds.
4. **Admin API:** strict positive integer parsing for user/machine ids and quantity.
5. **Vault controller:** strict coercion for vault ids, rack ids, inventory ids, slot index (0–79).
6. **Backup download:** canonical path + `realpath` containment under configured backup directory.
7. **Backup subprocess:** remove `shell: true` from `spawn` options; non-shell `tar` invocation.
8. **Games socket:** CSPRNG-based shuffle and symbol picks for memory / match-3.

Unit test added: `tests/databaseBackupService.test.mjs` (`resolveBackupDownloadPath` rejects invalid names).

---

## Transport & HTTP headers

| Control | Location | Notes |
|--------|-----------|--------|
| HTTPS redirect + HSTS | `server/middleware/httpsEnforcement.js` | Uses `X-Forwarded-Proto` when trust proxy is set. Env: `FORCE_HTTPS`, `HSTS_*`. |
| Helmet | `server/server.js` | `contentSecurityPolicy` from `server/middleware/csp.js`, `crossOriginOpenerPolicy: same-origin-allow-popups` (Wallet popups). |
| CSP (production) | `server/middleware/csp.js` | `script-src`: `'self'`, **per-request nonce**, `'unsafe-eval'` (Vite/bundlers), **fixed sha256 hashes** for Reown inline bootstraps, Turnstile + CDNs. `connect-src` includes WalletConnect / Reown hosts. |
| Trust proxy | `server/server.js` `applyTrustProxy` | Required for correct IP + HTTPS behind Nginx. |

**Gap:** `unsafe-eval` remains for compatibility with the SPA toolchain — acceptable trade-off for many stacks; tighten only if build allows.

---

## Authentication & authorization

- **JWT** access/refresh patterns in `server/utils/authTokens.js` and auth routes (`server/routes/auth.js`).
- **Admin** routes under `/api/admin` with separate admin JWT verification (`verifyAdminJwtToken`).
- **Account lockout:** progressive lockout on failed **login** via `server/services/accountLockoutService.js` (not the same as password-reset rate limits; both matter).
- **Socket.IO** miners/support: handlers receive `verifyAccessToken` / admin verifiers — **verify** each event payload cannot impersonate another `userId`.

**Recommendation:** Document a short checklist for **new Socket.IO events** (auth + idempotency + rate limit).

---

## CSRF

- **Middleware:** `server/middleware/csrf.js` — cookie `blockminer_csrf`, header `x-csrf-token`, must match for `POST`/`PUT`/`DELETE`/`PATCH`.
- **Exemptions:** `/api/payments/btcpay/webhook` (HMAC on raw body), `/socket.io/*` (non-browser or separate auth).

**Risk:** Any **new** server-to-server `POST` route must be added to the skip list **or** use a different auth mechanism (signed secret), not accidental CSRF bypass.

---

## Rate limiting

- **Global:** `createDistributedRateLimiter` on `/api` — `server/server.js` (high ceiling; skips heartbeat, wallet balance, checkin status).
- **Per-router:** Auth, wallet (read vs write buckets), shop, vault, internal offerwall, etc.

**Recommendation:** Periodically review **skip list** for abuse (automated balance polling + large fleet of IPs).

---

## Injection & data access

- **Primary ORM:** Prisma — parameterized queries by default.
- **Tagged raw SQL:** `transactionLocks.js`, `pgAdvisoryLocks.js`, `game2048Service.js`, `databaseBackupService.js` — use Prisma parameter binding (`` $queryRaw`...${scalar}` `` or `Prisma.sql`); never concatenate user-controlled SQL fragments.
- **Legacy:** `server/models/db.js` — `$queryRawUnsafe` / `$executeRawUnsafe` — **high risk if callers concatenate user input into SQL**. Grep for uses of `run`/`get`/`all` before trusting.

---

## Wallet, deposits & fraud

| Control | Notes |
|---------|--------|
| Duplicate `txHash` | Partial unique index `transactions_deposit_txhash_uq` (migration `20260417130000_*`). |
| Race on submit | `submitDeposit` handles Prisma `P2002` idempotently. |
| HD auto-scan | Polygonscan + verifier; requires valid API key on server. |
| BTCPay webhook | Raw body + rate limiter before `express.json`; verify HMAC in controller. |

---

## Webhooks & uploads

- **BTCPay:** dedicated route with `express.raw`, size cap `4mb`.
- **JSON body:** `JSON_BODY_LIMIT` default `1mb` — review if large JSON uploads are added.

---

## Client / build-time security

- **CSP nonces** injected in `server/server.js` when serving `index.html` (`__CSP_NONCE__`, Turnstile bootstrap).
- **WalletConnect:** `VITE_WALLETCONNECT_PROJECT_ID` baked at build — placeholder IDs cause **403** from Reown APIs (user-visible); not a server vulnerability but breaks wallet UX.

---

## Dependency & operations

- Run **`npm audit`** on a schedule (CI).  
- Secrets: never commit `.env`; rotate any key pasted in chat.  
- **Backups:** keep parameterized / validated paths for any raw SQL or filesystem access.

## Coverage CI gate (≥80% lines, scoped)

CI runs **`npm run coverage:gate`** after unit tests (see `.github/workflows/ci.yml`).

- **Server (`c8`):** `server/utils/**` with **≥80% line** coverage; **`mailer.js`**, **`cryptoPrice.js`**, and **`checkinStreak.js`** are excluded (SMTP / network / time-heavy — cover with integration tests, not the gate).
- **Client (`vitest`):** with **`COVERAGE_GATE=1`**, only the curated **`src/utils/*`** list in `client/vite.config.ts` is measured, **line** threshold **80%** (same modules that already have focused unit tests).

This is **not** “whole `client/src` at 80%” (that would require a large UI test push); it locks a **high-signal minimum** on shared utils + server helpers. Expand the include lists as you add tests.

---

## Suggested next steps (priority)

1. **Grep audit:** confirm **zero** callers pass user-controlled strings into `db.run` / `db.get` / `db.all`.  
2. **CSP automation:** script or doc step to recompute Reown inline **sha256** after `@reown/appkit` upgrades.  
3. **Socket.IO security review:** per-event auth + rate limits for costly actions.  
4. **Security headers:** optional `Referrer-Policy`, `Permissions-Policy` via Helmet if not already defaulted.  
5. **E2E tests:** CSRF rejection on mutating routes without header.

---

## Historical themes (older broad review, April 2026)

Earlier narrative reports highlighted **environment and key hygiene** (JWT admin withdrawal SMTP keys), **CSP** (`unsafe-inline` / `unsafe-eval` trade-offs), **cookies** (`SameSite`), **CORS** null-origin behavior, and **horizontal scaling** of rate limits. Treat those as ongoing policy questions; **verify against current code** before acting — several server paths have changed since (e.g. CSP is custom middleware + Helmet integration as described above).

---

## Sign-off

This document reflects **static code review** and tracked remediations. Re-run after major refactors (auth, wallet, CSP, Prisma schema).

---

## OpenRouter (free model) — external review

*Prompt run via `node scripts/openrouter-ask.mjs` from repo root on 2026-04-16. The model may suggest generic filenames; map ideas to this tree (`server/`, `client/`).*

**Priorities the model emphasized**

- **CI guardrails:** automate checks that CSP inline hashes match built assets (or fail the pipeline when Reown boot scripts change).
- **Rate limiting:** treat “skip” paths as high-risk configuration — document who can hit them and re-audit when adding routes.
- **Socket.IO:** validate JWT (or session) in a **connection** middleware before accepting privileged events; add tests for pre-auth emits.
- **CSRF / webhooks:** keep webhook routes explicitly documented as HMAC-verified exceptions; avoid widening CSRF skip lists casually.
- **Supply chain:** run `npm audit` (or OSV) in CI on a schedule; block merges on critical issues when practical.
- **Production artifacts:** if source maps are ever enabled for prod builds, strip `*.map` from the image or restrict debug images.

**Fact checks against this repo**

- **BTCPay raw body:** `server/server.js` registers `/api/payments/btcpay/webhook` with `express.raw` **before** `express.json` — HMAC over raw bytes is structurally correct.
- **HSTS preload:** `server/middleware/httpsEnforcement.js` adds `; preload` only when `HSTS_PRELOAD=1` (default off). Enable deliberately if the domain is submitted to the preload list.
- **CSRF cookie `Secure`:** `server/middleware/csrf.js` sets `Secure` when `NODE_ENV === 'production'`.

**Ideas worth a follow-up pass (not all implemented)**

- Router factory / lint to ensure new mutating routes get CSRF (or explicit documented exceptions).
- Optional `Referrer-Policy` / `Permissions-Policy` via Helmet.
- Webhook-specific rate limits (BTCPay route already has a dedicated limiter in `server.js` — confirm ceiling vs abuse scenarios).
