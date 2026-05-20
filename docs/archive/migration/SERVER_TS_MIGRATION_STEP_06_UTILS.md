# Server TypeScript migration — Step 06: `server/utils/**/*.ts`

## Summary

All backend utilities under `server/utils/` are now TypeScript sources (`.ts`). Legacy `.js` siblings were removed when `.ts` equivalents were added. Imports continue to use the NodeNext `.js` extension where they resolve to compiled output under `dist/server/`.

## Counts

| Metric | Value |
|--------|------:|
| `.js` files in `server/utils/` before this step (renamed/migrated) | 38 |
| `.ts` files already present before bulk rename | 1 (`criticalMutationIdempotency.ts`) |
| `.ts` files in `server/utils/` after this step | 39 |
| `.js` files remaining in `server/utils/` (source) | 0 |

## Migrated files (complete list)

1. `adminPasswordResetPolicy.ts`
2. `authTokens.ts`
3. `autoMiningGpuUtils.ts`
4. `backup.ts`
5. `checkinDate.ts`
6. `checkinStreak.ts`
7. `clientIp.ts`
8. `corsConfig.ts`
9. `criticalMutationIdempotency.ts` (already TS; kept)
10. `cryptoPrice.ts`
11. `game2048Constants.ts`
12. `logger.ts`
13. `logParser.ts`
14. `machineInstanceState.ts`
15. `mailer.ts`
16. `memoryGameConstants.ts`
17. `minerUtils.ts`
18. `miningRewardsLogger.ts`
19. `nonceManager.ts`
20. `normalizeIdempotencyKey.ts`
21. `pgAdvisoryLocks.ts`
22. `prismaSafeError.ts`
23. `projectRoot.ts`
24. `rackMinerRelease.ts`
25. `readEarnConstants.ts`
26. `readEarnSchemas.ts`
27. `requestPublicOrigin.ts`
28. `rpcClient.ts`
29. `secretValue.ts`
30. `securityErrors.ts`
31. `securityLogger.ts`
32. `securityStoreMode.ts`
33. `socketHandshakeAuthPolicy.ts`
34. `socketStateSanitize.ts`
35. `stableRequestHash.ts`
36. `supportMessagePayload.ts`
37. `token.ts`
38. `transactionLocks.ts`
39. `vaultSchemas.ts`

## Remaining `.js` in `server/utils/`

None. `find server/utils -name "*.js" -type f` returns empty.

## Audit table (per file)

> **Legend:** “Usado por” lists primary consumers (routes, controllers, services, models, cron, jobs, tests, scripts). “Prisma direto” = file imports `@prisma/client` or uses `prisma` from a local module.

| Arquivo JS (→ `.ts`) | Usado por (principal) | Tipo | Prisma | Econômico crítico | env/secrets | FS/path | Rede/API | Risco | Status |
|------------------------|------------------------|------|--------|-------------------|-------------|---------|----------|-------|--------|
| adminPasswordResetPolicy | admin auth / routes | security | não | não | sim | não | não | baixo | migrado |
| authTokens | auth, session | crypto/token | não | não | sim | não | não | **alto** (JWT) | migrado |
| autoMiningGpuUtils | dev/debug (GPU) | other | via model | sim (GPU) | não | não | não | médio | migrado |
| backup | `scripts/backup.js`, ops | infra | não | não | sim | sim | cloud hook | médio | migrado |
| checkinDate | check-in, game2048, sockets | format/parser | não | não | não | não | não | médio | migrado |
| checkinStreak | check-in services | economic | não | sim | não | não | não | alto | migrado |
| clientIp | middleware, logger | security/infra | não | não | não | não | não | médio | migrado |
| corsConfig | app bootstrap | security/infra | não | não | sim | não | não | baixo | migrado |
| criticalMutationIdempotency | critical mutations | economic | não | sim | não | não | não | alto | já era TS |
| cryptoPrice | shop / POL pricing | economic | não | sim | não | não | sim (CoinGecko) | médio | migrado |
| game2048Constants | game2048 | other | não | não | sim | não | não | baixo | migrado |
| logger | global | logger | não | não | sim | sim (logs) | não | médio | migrado |
| logParser | admin / tooling (log UI) | parser | não | não | não | sim | não | baixo | migrado |
| machineInstanceState | inventory / machines | validator | não | não | não | não | não | médio | migrado |
| mailer | auth / notifications | infra | não | não | sim | não | SMTP | médio | migrado |
| memoryGameConstants | memory game | other | não | não | sim | não | não | baixo | migrado |
| minerUtils | gameplay | format | não | não | não | não | não | baixo | migrado |
| miningRewardsLogger | legacy SQLite rewards | economic | não | sim | não | não | não | médio | migrado |
| nonceManager | chain tx helpers | crypto/infra | não | sim | não | não | RPC | alto | migrado |
| normalizeIdempotencyKey | idempotency | security | não | sim | não | não | não | alto | migrado |
| pgAdvisoryLocks | DB locking | infra | não | sim | não | não | não | alto | migrado |
| prismaSafeError | services | parser | sim | não | não | não | não | baixo | migrado |
| projectRoot | Docker/build | infra | não | não | sim | sim | não | médio | migrado |
| rackMinerRelease | inventory / racks | economic | sim | sim | não | não | não | alto | migrado |
| readEarnConstants / readEarnSchemas | read-earn | validator | não | não | não | não | não | médio | migrado |
| requestPublicOrigin | HTTP / sockets | security | não | não | sim | não | não | médio | migrado |
| rpcClient | Polygon RPC | infra | não | não | sim | não | sim | médio | migrado |
| secretValue | env helpers | security | não | não | sim | não | não | alto | migrado |
| securityErrors | API errors | security | não | não | não | não | não | baixo | migrado |
| securityLogger | security events | logger | não | não | não | sim | não | médio | migrado |
| securityStoreMode | env | security | não | não | sim | não | não | baixo | migrado |
| socketHandshakeAuthPolicy | Socket.IO | security | não | não | não | não | não | alto | migrado |
| socketStateSanitize | Socket.IO state | security | não | não | não | não | não | alto | migrado |
| stableRequestHash | idempotency | crypto | não | sim | não | não | não | alto | migrado |
| supportMessagePayload | support tickets | validator | não | não | não | não | não | médio | migrado |
| token | auth | crypto | não | não | não | não | não | alto | migrado |
| transactionLocks | payments / shop | economic | sim | sim | não | não | não | alto | migrado |
| vaultSchemas | vault API | validator | não | sim | não | não | não | alto | migrado |

## Collateral changes (non-utils scope, required for green `tsc` / tests)

| Area | Change | Reason |
|------|--------|--------|
| `server/utils/checkinDate.ts` | `getBrazilDateKeyAliases(input: Date \| string = new Date())` | Strict callers pass `Date \| string`; previous default inferred `Date` only. |
| `server/utils/supportMessagePayload.ts` | Typed `serializeSupportPayload` / `sanitizeAttachment` / `parseSupportPayload` | Removed `never[]` default on `attachments` and narrowed `unknown` safely. |
| `tests/*.mjs`, `tests/*.js` | `../server/utils/…` → `#server/utils/…` | After migration, only compiled `.js` exists under `dist/server/utils/`; package `imports` maps `#server/*` → `./dist/server/*`. |
| `scripts/backup.js` | ESM + `#server/...` imports; `npm run backup` runs `build:server` first | Backup module is emitted as ESM; CLI must load compiled output. |
| `package.json` | `"backup"` script; `coverage:gate:server` globs `*.ts` | Align scripts and coverage with `.ts` sources. |
| `eslint.config.cjs` | Removed legacy CJS overrides for migrated utils | Files are ESM + TypeScript-checked. |

## Typing highlights

- **Logger:** Explicit `Request` from Express; optional `details` / `req` on `error` / `warn` / `info` / `debug` / `security`; `logUnhandledError` narrows `unknown`.
- **RPC / nonce / backup / mailer:** `unknown` in `catch` handled via `errMsg` from `server/types/tsNarrowing.ts` (no `any`).
- **logParser:** ESM `__dirname` via `import.meta.url`; structured `ParsedLogLine`, `LogSummaryResult`.
- **rpcClient:** Typed JSON-RPC payload; `buildRpcUrls` / `uniqueRpcUrls` accept `string | readonly string[]` to avoid `never[]` inference.
- **authTokens:** `SignOptions` assertion for `expiresIn` string vs `StringValue` in `@types/jsonwebtoken` (see below — not `any`).

## Problems found and fixes

| Issue | Resolution |
|-------|------------|
| Logger methods required 3 args under `checkJs`-style inference | Explicit optional parameters and class field `category: string`. |
| `jwt.sign` / `expiresIn` type mismatch | `const signOptions = { … } as SignOptions` (narrowing gap between env string TTL and `StringValue`). |
| `supportMessagePayload` `never[]` default | Typed `attachments` parameter array. |
| `socketStateSanitize` optional `leaderboard` | Return `{ ...base, leaderboard }` only when present. |
| `mailer` `transporter` inferred `null` | `Transporter \| null`. |
| `rpcClient` `never` from `[]` default | Typed `uniqueRpcUrls` / `BuildRpcUrlsInput`. |
| `backup` / `miningRewardsLogger` / `logParser` / `nonceManager` CJS | Converted to ESM `import` / `export { }`. |
| `Request.auditContext` missing on Express type | Cast `(req as Request & { auditContext?: { correlationId?: string } })`. |
| Tests importing `server/utils/*.js` | Switched to `#server/utils/*.js` after `build:server`. |

## Use of `any`

None added as a blanket escape. **`as SignOptions`** is used once for JWT sign options so `ACCESS_TOKEN_TTL` (plain `string` from `process.env`) satisfies `SignOptions["expiresIn"]` (`StringValue \| number \| undefined` from typings). Runtime behavior unchanged.

## `@ts-ignore` / `@ts-nocheck`

Confirmed absent in `server/utils/**/*.ts`:

```bash
grep -R "@ts-ignore\|@ts-nocheck\| as any\|: any" server/utils --include="*.ts" || true
```

(empty).

## Validation results

| Command | Result |
|---------|--------|
| `npm run typecheck:server` | **Pass** |
| `npm run build:server` | **Pass** |
| `npm run typecheck` | **Pass** (server + backend) |
| `npm run build:backend` | **Pass** |
| `node --test tests/httpErrors.test.mjs` | **Pass** |
| Utils-focused batch | **Pass:** `vaultSchemas`, `stableRequestHash`, `supportMessagePayload`, `httpErrors` (18 tests) |
| `npm test` (full suite) | **Fails** for tests that still import **non-utils** paths such as `../server/controllers/walletController.js` (TS-only sources). This is **outside Step 06 utils**; same class of breakage as earlier controller migration until tests are pointed at `dist` or `#server`. |
| `docker compose build --no-cache` | **Pass** (`app` and `worker` images built; exit code 0). |
| `docker compose up` | **Not run** (no guarantee of safe `.env` in this workspace). |

## `find` verification

```bash
find server/utils -name "*.js" -type f | sort
# (empty)

find server/utils -name "*.ts" -type f | sort
# 39 files — see list above

find dist/server/utils -name "*.js" -type f | sort
# Emits compiled `.js` for each util (expected)
```

## Duplicate `.js` + `.ts` in `server/utils/`

None. Only `dist/server/utils/*.js` coexists with `server/utils/*.ts`.

## Risks / follow-ups (utils-related)

1. **`authTokens`:** `as SignOptions` documents a typings friction between env-driven TTL strings and `jsonwebtoken`’s `StringValue`; runtime unchanged.
2. **`miningRewardsLogger`:** Still targets legacy **SQLite** `run` API; if the product is fully on PostgreSQL/Prisma for rewards, confirm call sites — file compiles and behavior preserved.
3. **`rpcClient` / `nonceManager`:** Used for chain operations; multi-URL fallback and in-process nonce state remain worker-local (cluster caveat unchanged).
4. **`backup` / cloud template:** Still executes configured shell commands — security model unchanged; keep env gated.

## Next step (not executed here)

Per plan: migrate `server/cron/**/*.js` and `server/jobs/**/*.js` to TypeScript in a later step.

## `tsconfig.server.json`

`include` contains `"server/utils/**/*.ts"` (glob). `allowJs` / `checkJs` unchanged for remaining JS elsewhere.
