# BlockMiner — Auditoria monolito modular + TypeScript total

**Data:** 2026-05-20  
**Commit local:** `b39892f4` (working tree com refactors de páginas em curso)  
**Escopo:** Estrutura backend `server/modules/`, frontend `client/src/pages/`, Prisma, Express, builds — **sem features novas**, **sem testes novos**.

---

## 1. Estado do backend modular

O backend segue um **monolito modular em migração**: domínios críticos já vivem em `server/modules/<domain>/` com rotas, controllers, services, repositories, DTOs, schemas, types e errors. Rotas legadas em `server/routes/*.ts` **reexportam** vários módulos (compatibilidade). Outros domínios (mining, vault, faucet, admin finance, offer-events, etc.) ainda usam `server/controllers/` + `server/routes/` + `server/models/` diretamente.

**Prisma:** um único cliente via `server/src/db/prisma.ts` → `backend/dist/shared/prisma/client.js` (pool centralizado).  
**Express:** 100% em ficheiros `.ts` no código fonte de `server/` (zero `.js` fonte).

---

## 2. Módulos backend existentes (`server/modules/`)

| Módulo | Ficheiros padrão | Rotas legadas reexportam? |
|--------|------------------|-------------------------|
| `auth` | routes, controllers (login/register/session), shared service/repository, dto, schemas, types, errors | `server/routes/auth.ts` → sim |
| `wallet` | completo + `wallet.security.ts` | `server/routes/wallet.ts` → sim |
| `checkin` | completo + `checkin.contract.ts` | `server/routes/checkin.ts` → sim |
| `stats` | completo | `server/routes/stats.ts` → sim |
| `shop` | completo | `server/routes/shop.ts` → sim |
| `machines` | completo | `server/routes/machines.ts` → sim |
| `support` | completo | `server/routes/support.ts` → sim |
| `tasks` | completo (daily-tasks) | `server/routes/daily-tasks.ts` → sim |
| `admin-miners` | completo + `adminMiners.upload.ts` | via `server/routes/admin.ts` (admin agregado) |

**Domínios ainda sem módulo dedicado** (permanecem em controllers/models legados): inventory, vault, faucet, mining, racks, rooms, games, offer-events, ranking, read-earn, mini-pass, shortlink, ptp, youtube, broadcast, chat, deposit-tickets, swap, notification, admin (users/finance/logs/…), etc.

Contagem atual: **~40** ficheiros `server/routes/*.ts`, **~55** `server/controllers/*.ts`, **9** `server/modules/*/index.ts`.

---

## 3. Arquivos backend fora do padrão modular

| Área | Situação | Risco |
|------|----------|-------|
| Controllers em `server/modules/*/…controller.ts` com `prisma` direto | `auth`, `checkin`, `stats`, `shop`, `machines`, `wallet`, `support`, `admin-miners` | Regra de negócio + SQL no controller; repository existe mas não é usado de forma consistente |
| `server/models/*.ts` | Ainda usados por machines, shop, wallet, inventory, etc. | Camada paralela ao repository dos módulos |
| `server/models/db.ts` | Wrapper legado com **`$queryRawUnsafe`** | SQL dinâmico; migrar callers para Prisma tipado |
| `server/scripts/global_rescue.ts` | `new PrismaClient()` + `$queryRawUnsafe` | Script ops; aceitável isolado, não é HTTP |
| `server/prisma/seed.ts` | `new PrismaClient({ adapter })` | Seed only; não duplica pool de runtime |
| Rotas sem reexport modular | ~32 rotas ainda montam controllers legados | Duplicação potencial se alguém editar rota antiga em vez do módulo |

**Padrão aceitável já usado** (exemplo):

```ts
// server/routes/auth.ts
export { authRouter } from "../modules/auth/index.js";
```

---

## 4. Estado do frontend modular

- **`client/src/pages/` raiz:** **0** ficheiros `.ts`/`.tsx` soltos (critério atendido).
- Páginas de produto organizadas em pastas por domínio (`wallet/`, `checkin/`, `machines/`, `landing/`, etc.) com `*Page.tsx` + `index.ts` na maioria.
- **`client/src`:** **0** ficheiros `.js`/`.jsx` fonte.

**Exceção estrutural:** `client/src/pages/admin/` contém **~25+** componentes `Admin*.tsx` ainda na raiz de `admin/` (ex.: `AdminDashboard.tsx`, `AdminFinance.tsx`, `AdminUsers.tsx`), enquanto subpastas `users/`, `finance/`, `metrics/`, `miners/`, `offer-events/` já existem com páginas novas. Migração admin está **parcial** — não bloqueia critério de “raiz de pages vazia”, mas é dívida de modularização UI.

**`legal/`:** subpastas `privacy-policy/`, `terms-of-use/` com `index.ts`; pasta pai sem `index.ts` (agrupador apenas).

---

## 5. Domínios / páginas frontend

| Domínio | Pasta | Page + index |
|---------|-------|----------------|
| auth | `auth/login`, `auth/register`, `auth/forgot-password` | sim |
| wallet | `wallet/` | sim |
| checkin | `checkin/` | sim |
| machines | `machines/` | sim |
| shop | `shop/` | sim |
| stats | `stats/` | sim |
| support | `support/` | sim |
| tasks | `tasks/` | sim |
| dashboard | `dashboard/` | sim |
| landing, games, vault, faucet, offers, ranking, settings, … | pastas dedicadas | sim |
| admin | `admin/` + subpastas | **parcial** (ficheiros legados na raiz `admin/`) |

---

## 6. Arquivos soltos removidos ou pendentes

| Item | Estado |
|------|--------|
| `client/src/pages/*.tsx` na raiz | **Removidos** (movidos para subpastas; git mostra `RM`/`R`) |
| `client/src/pages/Faucet.tsx`, `Vault.tsx` na raiz | **Apagados** → `faucet/FaucetPage.tsx`, `vault/VaultPage.tsx` |
| `client/src/pages/admin/Admin*.tsx` na raiz de admin | **Pendente** — consolidar em `admin/<subdomain>/` |

---

## 7. Confirmação: `server` sem `.js` fonte

```bash
find server -name "*.js" -type f \
  -not -path "server/node_modules/*" \
  -not -path "server/dist/*"
# → 0 ficheiros
```

---

## 8. Confirmação: `client/src` sem `.js`/`.jsx`

```bash
find client/src \( -name "*.js" -o -name "*.jsx" \) -type f
# → 0 ficheiros
```

---

## 9. Express somente em TypeScript

- `server/server.ts`, `server/routes/*.ts`, `server/middleware/*.ts` — todos `.ts`.
- Nenhum `require('express')` em `.js` fonte sob `server/`.
- SPA fallback tipado em `server/utils/spaStatic.ts`: exclui `/api`, `/uploads`, `/assets`, `/socket.io` e extensões de bundle.

---

## 10. PrismaClient centralizado

| Local | Uso |
|-------|-----|
| `server/src/db/prisma.ts` | **Runtime único** (import default em app, cron, services, modules) |
| `backend/dist/shared/prisma/client.js` | Implementação do pool |
| `server/prisma/seed.ts` | Seed script (instância própria com adapter) |
| `server/scripts/global_rescue.ts` | Script de manutenção |

**Não** há `new PrismaClient()` no caminho HTTP quente exceto scripts/seed.

---

## 11. `$queryRawUnsafe`

| Ficheiro | Uso |
|----------|-----|
| `server/models/db.ts` | `get` / `all` / `run` — **legado SQLite-style** |
| `server/scripts/global_rescue.ts` | manutenção |

`$queryRaw` **parametrizado** (tagged template) existe em `transactionLocks.ts`, `pgAdvisoryLocks.ts`, `adminFraudSignalsService.ts`, `databaseBackupService.ts`, `game2048Service.ts` — aceitável com parâmetros.

**Pendência:** eliminar `db.ts` unsafe ou restringir a scripts com SQL 100% interno.

---

## 12. DTOs seguros

Verificação em `server/modules/*/…dto.ts`: **sem** exposição de `passwordHash`, `refreshToken`, secrets em DTOs de auth/wallet/checkin pesquisados.

Respostas HTTP usam objetos mapeados; erros controlados via `*.errors.ts` / `prismaHttpErrors`.

---

## 13. Regras críticas no backend

| Domínio | Backend decide | Frontend |
|---------|----------------|----------|
| Login/sessão | `modules/auth` | UI + chamadas API |
| Wallet/saldo/saque | `modules/wallet` + `walletModel` | polling/display |
| Check-in / recompensa | `modules/checkin` | contrato wallet + API |
| Stats/power | `modules/stats` | gráficos |
| Shop/compra | `modules/shop` + models | vitrine |
| Máquinas/inventário | `modules/machines` + inventory controllers | layout rack; `getMachineDescriptor` só **fallback visual** se `imageUrl` vazio |
| Admin miners | `modules/admin-miners` | upload/preview |

**Não encontrado** no frontend: cálculo de recompensa de check-in, débito de saldo, ou antifraude — apenas formatação (`formatHashrate`), guards de input, e Web3 para assinatura de check-in (`checkin.wallet.ts`).

---

## 14–18. Resultados de build / typecheck

| Comando | Resultado |
|---------|-----------|
| `client` typecheck (`tsc --noEmit`) | **OK** |
| `client` build (`vite build`) | **OK** (~11s) |
| `npm run typecheck:server` (`tsc -p tsconfig.server.json --noEmit`) | **OK** |
| `npm run build:server` | **OK** |
| `npm run build:backend` | **OK** |
| `docker compose build app worker` | **OK** |

*Nota: `npm` não está no PATH global do ambiente do agente; builds executados via `node node_modules/typescript/bin/tsc` e `node node_modules/vite/bin/vite.js`.*

---

## 19. Greps finais

| Verificação | Resultado |
|-------------|-----------|
| `server` `.js` fonte | **0** |
| `client/src` `.js`/`.jsx` | **0** |
| `client/src/pages` raiz solta | **0** |
| `@ts-ignore` / `@ts-nocheck` | **0** em `server` + `client/src` |
| `: any` / `as any` gambiarra | **0** em `client/src`; em `server` só comentários/strings (ex.: “any logged-in user”) |
| `$queryRawUnsafe` | **2** ficheiros (`db.ts`, `global_rescue.ts`) |
| `new PrismaClient` | **seed.ts**, **global_rescue.ts** (não runtime HTTP) |

---

## 20. Smoke manual (produção)

| URL | Status | Notas |
|-----|--------|-------|
| `https://blockminer.space/login` | 200 | ~2.7s (rede) |
| `https://blockminer.space/api/auth/session` (sem cookie) | 401 JSON | ~0.79s |
| `https://blockminer.space/socket.io/?EIO=4&transport=polling` | 200 | Engine.IO, não HTML SPA |
| `/assets/arquivo-inexistente.js` | 404 JSON | `ASSET_NOT_FOUND` |
| `/uploads/arquivo-inexistente.png` | 404 JSON | não 500 |

---

## 21. Pendências reais restantes

1. **Migrar controllers dos módulos** para usar apenas `repository` + `service` (hoje vários controllers importam `prisma` e `models/` diretamente).
2. **Extrair módulos** para inventory, vault, faucet, mining, admin-users, admin-finance (ou documentar roadmap único por domínio).
3. **Remover `server/models/db.ts` `$queryRawUnsafe`** ou isolar a scripts com SQL estático.
4. **Consolidar admin frontend:** mover `Admin*.tsx` soltos de `client/src/pages/admin/` para subpastas (`users/`, `finance/`, …) e um `admin/index.ts` de barrel.
5. **Reduzir `server/controllers/`** a reexports finos onde o módulo já existir (evitar regra duplicada).
6. Manter **zero** `.js` fonte em `server/` e `client/src` em CI (grep no pre-commit).

---

## Critério de aceite (checklist)

| Critério | Estado |
|----------|--------|
| Backend organizado por módulos reais | **Parcial OK** — 9 módulos; resto legado documentado |
| Frontend por domínios | **OK** na raiz `pages/`; admin parcial |
| Sem página grande solta em `client/src/pages` | **OK** |
| Sem `.js` fonte em `server` | **OK** |
| Sem `.js`/`.jsx` em `client/src` | **OK** |
| Express 100% TypeScript | **OK** |
| Prisma via repository/service | **Parcial** — pool central OK; queries ainda nos controllers em vários módulos |
| PrismaClient único (runtime) | **OK** |
| Sem `$queryRawUnsafe` | **Pendente** — legado `db.ts` |
| Regra econômica crítica no backend | **OK** (com models legados ainda no caminho) |
| Sem any/ts-ignore gambiarra | **OK** |
| Typecheck/build/Docker | **OK** |
| Relatório criado | **OK** |

---

*Auditoria estrutural apenas — sem alteração de regras econômicas, sem testes novos, sem deploy nesta etapa.*
