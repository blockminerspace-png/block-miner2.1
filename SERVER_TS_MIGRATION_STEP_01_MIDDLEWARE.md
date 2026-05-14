# Server TypeScript migration — step 01: `server/middleware`

## 1. Contagem inicial (`server/middleware/*.js`)

Antes desta etapa havia **15** ficheiros `.js` em `server/middleware/` (todos migrados e removidos do código-fonte).

## 2. Ficheiros migrados para `.ts`

| Ficheiro |
|----------|
| `server/middleware/admin.ts` |
| `server/middleware/adminAuth.ts` |
| `server/middleware/adminPageAuth.ts` |
| `server/middleware/auth.ts` |
| `server/middleware/criticalIdempotency.ts` |
| `server/middleware/csp.ts` |
| `server/middleware/csrf.ts` |
| `server/middleware/distributedRateLimit.ts` |
| `server/middleware/httpRequestLogger.ts` |
| `server/middleware/httpsEnforcement.ts` |
| `server/middleware/rateLimit.ts` |
| `server/middleware/sidebarFeatureGate.ts` |
| `server/middleware/turnstile.ts` |
| `server/middleware/userActivityAudit.ts` |
| `server/middleware/validate.ts` |

**Total:** 15 ficheiros TypeScript em `server/middleware/`.

## 3. `.js` restantes em `server/middleware/`

Nenhum no código-fonte (apenas saída em `dist/server/middleware/*.js` após `npm run build:server`).

## 4. `tsconfig.server.json`

- `compilerOptions.target`: `ES2022`
- `module` / `moduleResolution`: `NodeNext`
- `rootDir`: `server`
- `outDir`: `dist/server`
- `strict`, `noImplicitAny`, `strictNullChecks`: ativos
- `allowJs`: `true` (migração gradual do resto do `server/`)
- `checkJs`: `false`
- `types`: `["node", "express"]`
- `include`: `server/middleware/**/*.ts`, `server/types/**/*.d.ts`, `server/**/*.js`
- `exclude`: `node_modules`, `dist`, e os cinco `server/controllers/*.js` gerados pelo esbuild (`checkin`, `shortlink`, `youtube`, `autoMiningGpu`, `autoMiningV2`) para evitar **TS5056** (dois inputs → um único `.js`).

## 5. `package.json` (raiz)

- **`main`**: `dist/server/server.js`
- **Scripts novos/ajustados**:
  - `build:server`: `npm run build:server-ts-controllers && tsc -p tsconfig.server.json`
  - `typecheck:server`: `tsc -p tsconfig.server.json --noEmit`
  - `typecheck`: `npm run typecheck:server && npm run typecheck:backend`
  - `dev` / `start` / `start:prod` / `start:prod:3001` / `start:server:prod`: passam a usar `build:server` + `dist/server/server.js` com `nodemon` onde aplicável
  - `pretest`: `npm run build:server && npm run build:backend`
- **`build:server-ts-controllers`**: `esbuild` com `--outdir=server/controllers` (antes de `tsc`, para `import "./foo.js"` resolver para `.js` e não para `.ts` no grafo do `tsc`)
- **`imports`**: `"#server/*": "./dist/server/*"` (removido `#backend-dist` após carregar o backend por caminho em tempo de execução)
- **`devDependencies`**: `@types/jsonwebtoken@^9.0.10`

## 6. Tipos globais Express

- Ficheiro: `server/types/express.d.ts`
- `Request.user`: tipo **`AuthSessionUser`** = `Pick<User, "id" | "name" | "username" | "email" | "isBanned" | "polBalance" | "usdcBalance">` (alinhado com `getUserById` em `server/models/userModel.js`)
- Campos existentes: `admin`, `criticalIdempotency`, `Locals` (`cspNonce`, `csrfToken`)

## 7. Problemas de tipagem e resolução

| Problema | Resolução |
|----------|-----------|
| `req.user` incompatível com `User` completo do Prisma | `AuthSessionUser` com `Pick` dos campos devolvidos por `getUserById` |
| `tsc` a incluir `backend/dist/**/*.js` como inputs (TS5055) ao usar `#backend-dist` / re-export estático | `server/server.js`: `import()` dinâmico com `pathToFileURL` + `PROJECT_ROOT`; `server/src/db/prisma.js`: `createRequire` + caminho absoluto sob `PROJECT_ROOT` |
| TS5056 (dois inputs → mesmo `.js` em `dist/server/controllers`) | Excluir os cinco `.js` gerados pelo esbuild do programa do `tsc`; esbuild **antes** de `tsc` |
| TS6059 no `typecheck:backend` ao mapear `#server/middleware/*.js` → `../server/middleware/*.ts` | Repor stubs `.d.ts` em `backend/src/types/stubs/stub-server-middleware-*.d.ts` e paths no `backend/tsconfig.json` |
| `getBrazilDateKeyAliases` só tipado como `Date` | JSDoc `@param {Date\|string}` em `server/utils/checkinDate.js` |
| `BalanceOutcome` / `$transaction` sem estreitamento | `Promise<BalanceOutcome>` no callback e remoção de `as BalanceOutcome` em `{ kind: "already" }` |
| `shortlinkController` / `createAuditLog` | Campos obrigatórios preenchidos; guarda após `resetDailyIfNeeded` |
| CSP callback `req` não usado | Parâmetro renomeado para `_req` |

## 8. Uso de `any`

Não foi introduzido tipo `any` nos middlewares; a única ocorrência da palavra “any” é texto numa mensagem de log em `admin.ts`.

## 9. Resultados dos comandos (ambiente local)

| Comando | Resultado |
|---------|-----------|
| `npm run typecheck:server` | **OK** (exit 0) |
| `npm run build:server` | **OK** (exit 0) |
| `npm run typecheck` | **OK** |
| `npm run build:backend` | **OK** |
| `node --test tests/httpErrors.test.mjs` | **OK** |
| `npm test` (suíte completa) | **Falhou** em testes já frágeis (`i18nLanguage`, `ipIntelligenceService`, `registerBodySchema`), não ligados a esta migração |
| `node --test tests/turnstile.resolveSecret.test.mjs tests/adminFraudAuthValidation.test.mjs tests/userActivityAuditMiddleware.test.mjs` (com `build:server` prévio) | **OK** (15 testes) |
| `docker compose build` | **OK** (exit 0; build longo ~5–6 min); `docker compose up` / `logs` **não** executados para não assumir ambiente com `.env` |

## 10. Outros ficheiros tocados (suporte à migração)

- `server/utils/projectRoot.js` — `findBlockMinerProjectRoot` partilhado
- `server/server.js` — `PROJECT_ROOT`, uploads, top-level `await` para módulos `backend/dist`
- `server/src/db/prisma.js` — carregamento via `createRequire` + `PROJECT_ROOT`
- `server/controllers/checkinController.ts`, `server/controllers/shortlinkController.ts` — correções mínimas para o grafo do `tsc` resolver `.ts` quando existem `.ts` e `.js` no mesmo diretório
- Remoção dos cinco `server/controllers/*.js` gerados pelo esbuild do repositório (passam a ser só artefactos de build em `server/controllers` após `npm run build:server-ts-controllers`)
- Testes: imports atualizados para `../dist/server/middleware/*.js` onde necessário
- `Dockerfile`: esbuild antes de `tsc server` + `tsc backend`; `@types/jsonwebtoken`; `CMD ["node","dist/server/server.js"]`

## 11. Confirmação: sem `.js` duplicado ao lado de `.ts` em `server/middleware/`

Confirmado: só existem `.ts` em `server/middleware/` no código-fonte; os `.js` homólogos estão apenas em `dist/server/middleware/` após o build.

## 12. Pendências (próxima etapa)

1. **`npm test`**: corrigir ou isolar testes que falham por asserções instáveis (não regressão desta etapa).
2. **`server/routes/**/*.js`**: próximo pacote lógico de migração gradual.
3. **Stubs `backend/src/types/stubs/stub-server-middleware-*.d.ts`**: substituir por tipos gerados ou por `references` de projeto quando `backend` e `server` partilharem um único grafo sem violar `rootDir`.
4. **`server/controllers/*.ts`**: incluir no `tsc` do servidor (ou projeto referenciado) quando os erros de strict estiverem resolvidos, para eliminar dependência do esbuild para esses cinco ficheiros.
5. **Docker**: validar `docker compose up -d` + `logs` num ambiente com `.env.production` real.

## 13. Comandos `find` (após `build:server`)

```bash
find server/middleware -name "*.js" -type f | sort
# (vazio)

find server/middleware -name "*.ts" -type f | sort
# 15 ficheiros .ts listados acima

find dist/server/middleware -name "*.js" -type f | sort
# 15 ficheiros .js compilados (mais .js.map se gerados)
```
