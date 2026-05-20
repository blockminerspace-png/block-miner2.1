# Client structure cleanup report

**Date:** 2026-05-19  
**Scope:** Organize `client/` so generated output is not treated as source; preserve `public/`, build, deploy, and tests.

---

## 1. Initial state of `client/`

Top-level layout (source + generated + tooling):

```txt
client/
  public/          # static assets (source for Vite)
  scripts/         # client helpers
  src/             # React/TypeScript app
  tests/           # auth integration tests (Vitest)
  coverage/        # Vitest coverage output (local only, may be absent)
  dist/            # Vite production build (local only)
  node_modules/
  index.html
  package.json
  tsconfig.json
  vite.config.ts
  tailwind.config.js
  postcss.config.js
  eslint.config.js
  .env.example
  README.md
  .gitignore       # dist, coverage (relative paths)
```

No stray `.js`/`.jsx` under `client/src/` (0 files).

---

## 2. Source vs generated

| Path | Role |
|------|------|
| `client/src/` | Application source (TS/TSX) |
| `client/public/` | Public static assets copied into build root |
| `client/scripts/` | Client-side scripts |
| `client/tests/` | Page-level tests (auth) outside `src/` |
| `client/index.html` | Vite entry HTML |
| `client/dist/` | **Generated** — `npm run build` / Vite |
| `client/coverage/` | **Generated** — `npm test` / Vitest coverage |
| `client/node_modules/` | **Generated** — `npm install` |

`client/dist/` and `client/coverage/` must not be versioned or edited as source.

---

## 3. `.gitignore` updates (repo root)

Ensured (no duplicate rules):

```gitignore
client/dist/
client/coverage/
coverage/
dist/
```

Also present: `/dist/` (repo-root compiled server), `server/dist/`, `backend/dist/`.

`client/.gitignore` already contains `dist`, `dist-ssr`, and `coverage` for work inside `client/`.

---

## 4. VS Code / Cursor visibility

**`.vscode/settings.json`** (committable via `!.vscode/settings.json` in root `.gitignore`):

- `files.exclude` / `search.exclude` — hide `client/dist`, `client/coverage`, `node_modules`, repo `dist`/`coverage`
- `files.watcherExclude` — reduce watcher load on large trees

Reload the window if generated folders still appear in the explorer.

---

## 5–7. Git tracking of `dist` / `coverage`

| Artifact | Tracked in Git? | Notes |
|----------|-----------------|-------|
| `client/dist/` | **No** | `git ls-files` count **0** |
| `client/coverage/` | **No** | Not tracked |

`git rm -r --cached client/dist client/coverage` — not required (nothing tracked).

`git status --short | grep -E "client/dist|client/coverage|coverage-summary"` — **empty** (OK).

Local `client/dist/` exists after build; `client/coverage/` may appear after `npm run test:coverage`.

---

## 8. `client/public/` audit (24 files)

All preserved; none removed.

| Asset / path | Usage |
|--------------|--------|
| `favicon.ico`, `icon.png` | `index.html`, `BrandLogo`, admin fallbacks |
| `walletconnect-logo.svg` | Wallet UI |
| `machines/*.png` | `machine.ts`, Faucet, Calculator, admin |
| `icons/*.png` | Crypto / landing visuals |
| `crypto-broadcast/*` | Kiosk board; iframe `/crypto-broadcast/`; `DashboardCryptoStream`, `AdminStreaming` |
| `Silvio/Banner*.jpg` | Marketing banners |
| `vite.svg` | Default Vite asset |

---

## 9. `public` vs `dist` duplication

- `comm -12` on **full paths** between `client/public` and `client/dist`: **0** identical paths (roots differ).
- **Logical** duplication: Vite copies `public/` into `dist/` on build (`favicon.ico`, `machines/`, `crypto-broadcast/`, etc. at `dist/` root + hashed bundles under `dist/assets/`).
- **Do not** delete `dist/` copies manually; regenerate with `npm run build`. **Do not** commit `dist/`.

---

## 10–12. Tests in `client/src`

**49** colocated `*.test.ts(x)` files under `src/` (utils, pages, store, web3, games).

**3** tests under `client/tests/auth/` (`LoginPage`, `RegisterPage`, `twoFactorOptional`).

**Decision:** No mass moves in this pass. Colocated tests match current Vitest config (`vite.config.ts` default glob). Moving would risk import/path churn without benefit for this cleanup.

---

## 13. Files changed

| File | Change |
|------|--------|
| `.gitignore` | `client/coverage/`, `coverage/`, `dist/`; allow `.vscode/settings.json` |
| `.vscode/settings.json` | Hide generated folders in explorer/search/watcher |
| `CLIENT_STRUCTURE_CLEANUP_REPORT.md` | This report |

No changes to `client/public/`, routes, endpoints, or application UI code.

---

## 14–20. Validation (2026-05-19)

Commands run with project-local tooling (`node` + `node_modules/.bin`; `npm` not on system PATH).

| Command | Result |
|---------|--------|
| `cd client && npm run typecheck` | **PASS** (exit 0) |
| `cd client && npm run build` | **PASS** (exit 0, Vite 7.3.2) |
| `cd client && npm test` | **PASS** — 53 files, 296 tests |
| `npm test` (root) | **PASS** (exit 0, `scripts/run-node-tests.mjs`) |
| `npm run typecheck:server` | **PASS** (exit 0) |
| `npm run build:server` + `build:backend` | **PASS** (exit 0) |
| `docker compose build --no-cache app` | **PASS** — image `block-miner-app:latest` |

---

## 21–22. Source extensions

| Check | Result |
|-------|--------|
| `client/src` `.js`/`.jsx` | **0** |
| `server/` stray `.js` source | **0** (excluding `node_modules`, `dist`) |

`grep` for `@ts-ignore`, `@ts-nocheck`, ` as any`, `: any` in `server` + `client/src`: no problematic matches (one log string contains the word “any” in `server/middleware/admin.ts`).

---

## 23. Recommended next cleanup (optional)

1. Add a short “Source vs generated” pointer in `client/README.md` linking to this report.
2. Run `npm run test:coverage` locally only when needed; `client/coverage/` remains gitignored.
3. Long term: move large **page** tests to `client/tests/<domain>/` only when touching those modules (not a big-bang move).
4. Confirm CI does not publish `client/coverage` as artifacts unless required.

---

## Acceptance checklist

| Criterion | Met |
|-----------|-----|
| `client/dist/` not versioned | Yes |
| `client/coverage/` not versioned | Yes |
| Both in `.gitignore` | Yes |
| IDE can hide generated dirs | Yes |
| `public/` audited, nothing removed | Yes |
| `client/src` without `.js/.jsx` | Yes |
| `server/` without stray `.js` source | Yes |
| Typecheck/build/test pass | Yes |
| Docker build pass | Yes |
| Report created/updated | Yes |
