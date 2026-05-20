# BlockMiner 2.1 — Relatório de auditoria e migração (backend TypeScript + monólito modular)

**Data:** 2026-05-12  
**Âmbito desta entrega:** Fase 1 (auditoria) parcialmente executada em profundidade; Fases 2–4 aplicadas à **camada `backend/`** (composição HTTP + Prisma + erros + health); restante do domínio HTTP continua em **`server/routes` + `server/controllers`** (JavaScript), com **URLs e ordem de mounts preservadas**.

---

## 1. Resumo do problema encontrado

- O **runtime principal** é `server/server.js` (Express 5, motor de mineração, Socket.IO, estáticos, SPA).
- A pasta **`backend/src`** tinha sido introduzida como **fronteira de composição** (stack HTTP, mounts de rotas, Prisma singleton, `HttpError`, health), mas **ficheiros estavam em JavaScript** e o `server` importava `.js` em `backend/src` diretamente.
- **Duplicação conceptual:** `client/src/pages/*` já organiza muitas áreas; o Git mostrava histórico de `client/src/modules/*` em relatórios antigos — **no disco atual não existe `client/src/modules/`**; o router usa sobretudo `client/src/pages/`.
- **Risco de produção:** qualquer mudança em ordem de `app.use`, CSRF, rate limits ou prefixos `/api/*` afeta autenticação, webhooks e anti-fraude.

---

## 2. Estrutura antiga do backend (antes desta entrega)

- **`server/`** — núcleo: `server.js`, `routes/*.js` (~40 routers listados no mount utilizador), `controllers/`, `middleware/`, `models/`, `services/`, `cron/`, `jobs/`, `prisma/schema.prisma`, `src/db/prisma.js` (reexport).
- **`backend/src/`** — apenas composição: `app/setupExpressHttpStack.js`, `app/registerHttpRoutes.js`, `app/mount/*.js`, `shared/prisma/client.js`, `shared/errors/httpErrors.js`, `shared/http/apiErrorHandler.js`, `modules/health/*` (tudo `.js`).

---

## 3. Estrutura nova do backend (após esta entrega)

- **`backend/src/**/*.ts`** — fonte TypeScript (strict onde aplicável).
- **`backend/dist/**/*.js`** — saída **ESM** gerada por **`esbuild`** (`npm run build:backend`), **ignorada no Git** (`.gitignore`: `backend/dist/`).
- **`server/server.js`** importa **`../backend/dist/app/*.js`** e **`../backend/dist/shared/http/apiErrorHandler.js`**.
- **`server/src/db/prisma.js`** reexporta **`../../../backend/dist/shared/prisma/client.js`** (runtime continua a usar um único singleton).

```
backend/
  src/
    app/
      registerHttpRoutes.ts
      setupExpressHttpStack.ts
      mount/
        adminApiRoutes.mount.ts
        userApiRoutes.mount.ts
        publicSurfaceRoutes.mount.ts
    modules/
      health/
        health.routes.ts
        health.controller.ts
        health.service.ts
        index.ts
    shared/
      prisma/client.ts
      errors/httpErrors.ts
      http/apiErrorHandler.ts
  tsconfig.json
  dist/          ← gerado (não versionado)
```

---

## 4. Estrutura antiga do frontend (resumo)

- **`client/src/App.jsx`** — React Router; muitas rotas lazy sob `client/src/pages/*`; layout com `Sidebar`, `Header`, etc. em `client/src/components/`.
- **`client/src/app/navigation/sidebarItems.js`** + **`userDashboardNav.config.ts`** — fonte para mobile + fallback alinhado com `/api/sidebar/nav`.

---

## 5. Estrutura nova do frontend

- **Sem alterações visuais ou de rotas nesta entrega.**  
- Organização por pasta já existe para várias áreas (`pages/dashboard`, `pages/auth`, `pages/wallet`, …). **Pendência:** unificar naming (ex.: `inventory` vs “machines”), eliminar páginas legacy se ainda existirem duplicadas no histórico Git.

---

## 6. Ficheiros JavaScript migrados para TypeScript

| Antigo (`.js`) | Novo (`.ts`) |
|----------------|--------------|
| `backend/src/shared/errors/httpErrors.js` | `httpErrors.ts` |
| `backend/src/shared/http/apiErrorHandler.js` | `apiErrorHandler.ts` |
| `backend/src/shared/prisma/client.js` | `client.ts` |
| `backend/src/modules/health/health.routes.js` | `health.routes.ts` |
| `backend/src/modules/health/health.controller.js` | `health.controller.ts` |
| `backend/src/app/registerHttpRoutes.js` | `registerHttpRoutes.ts` |
| `backend/src/app/setupExpressHttpStack.js` | `setupExpressHttpStack.ts` |
| `backend/src/app/mount/userApiRoutes.mount.js` | `userApiRoutes.mount.ts` |
| `backend/src/app/mount/adminApiRoutes.mount.js` | `adminApiRoutes.mount.ts` |
| `backend/src/app/mount/publicSurfaceRoutes.mount.js` | `publicSurfaceRoutes.mount.ts` |

**Novo:** `backend/src/modules/health/health.service.ts`, `backend/src/modules/health/index.ts`.

---

## 7. Ficheiros que permaneceram JavaScript e o motivo

- **`server/**/*.js`** — todo o domínio de negócio, routers e maior parte dos controllers: **migração completa exigiria mover dezenas de routers e centenas de handlers** sem quebrar contratos; ficou **fora do âmbito de uma única iteração**.
- **`server/server.js`** — ponto de entrada monolítico com mining engine e sockets: mantido em JS para **risco controlado** (mudança mínima: imports apontam para `backend/dist`).
- **`server/src/db/prisma.js`** — shim de reexport **uma linha** para não alterar todos os `import prisma from "../src/db/prisma.js"` de imediato.

---

## 8. Módulos backend criados/organizados

- **`health`:** `routes` + `controller` + `service` + `index` (padrão alvo parcialmente aplicado).
- **Composição HTTP:** `registerHttpRoutes`, `setupExpressHttpStack`, `mount/*` (sem regra de negócio; apenas `app.use` / `app.get`).

**Não criados (propositadamente):** módulos vazios (auth, wallet, …) — só faz sentido quando o código sair de `server/routes/*` com paths preservados.

---

## 9. Páginas frontend organizadas

- Nenhuma alteração nesta entrega. **Checklist manual (secção 22)** continua válido sobre o estado atual do repositório.

---

## 10. Rotas Express preservadas

- **Sim.** `mountUserApplicationApiRoutes`, `mountAdminApiRoutes` e `mountPublicSurfaceRoutes` mantêm os **mesmos prefixos** e os **mesmos routers** importados de `server/routes/*.js`.
- **Webhook BTCPay** continua registado em `setupExpressHttpStack` com **raw body** antes de `express.json()`, como antes.

---

## 11. Rotas frontend preservadas

- **Sim** — `App.jsx` não foi alterado nesta entrega.

---

## 12. Ficheiros removidos

- Todos os **`.js` equivalentes** listados na secção 6 sob `backend/src/` (substituídos por `.ts`).

---

## 13. Ficheiros duplicados removidos

- Nenhuma duplicação nova removida além da substituição 1:1 `.js` → `.ts` na camada `backend/`.

---

## 14. Imports corrigidos

- `server/server.js` → `../backend/dist/...`
- `server/src/db/prisma.js` → `../../../backend/dist/shared/prisma/client.js`
- `tests/httpErrors.test.mjs` → `../backend/dist/shared/errors/httpErrors.js`

---

## 15. Prisma centralizado

- **Fonte:** `backend/src/shared/prisma/client.ts` (Prisma + `@prisma/adapter-pg` + pool `pg`).
- **Consumo:** `server/src/db/prisma.js` reexporta o artefacto compilado.

---

## 16. Validações adicionadas

- **Nenhuma validação Zod nova** nesta entrega (o projeto já usa Zod noutros pontos do `server/`). **Pendência:** `shared/validation/validateRequest.ts` unificado por módulo ao extrair rotas.

---

## 17. DTOs adicionados

- **Nenhum DTO novo** além do payload tipado de health (`HealthPayload` em `health.service.ts`). **Pendência:** DTOs por domínio quando os handlers saírem dos controllers atuais.

---

## 18. Middlewares adicionados/corrigidos

- **Nenhuma alteração de comportamento** nos middlewares globais; apenas a **fonte** passou a TypeScript compilada.

---

## 19. Segurança aplicada

- Mantidos: **Helmet**, **CORS**, **CSRF**, **rate limit** global em `/api`, **audit context** em `/api`, limite de JSON, webhook BTCPay com limiter dedicado, modo `ADMIN_ONLY_MODE` com prefixos permitidos.
- **`@ts-nocheck`** usado **apenas** em ficheiros que importam **`server/**/*.js`** sem declarações de tipo — documentado como dívida técnica até existirem `.d.ts` ou migração desses módulos.

---

## 20. Ações económicas protegidas

- **Não alteradas nesta entrega** (continuam nos serviços/rotas existentes em `server/`). **Pendência:** revisão transacional + idempotência por endpoint crítico quando cada módulo for migrado para `service` + `repository`.

---

## 21. Problemas encontrados

- **`npm test` (suite completa):** falhas **pré-existentes** não relacionadas com esta migração (ex.: `tests/i18nLanguage.test.mjs`, `tests/ipIntelligenceService.test.mjs`, `tests/registerBodySchema.test.mjs`). O teste **`httpErrors`** passou após `pretest` → `build:backend`.
- **Typecheck:** faltava `@types/pg` para `import pg from "pg"` — **corrigido** com `devDependency` `@types/pg`.
- **Docker:** `docker compose build app` foi iniciado em ambiente local; **output final não foi capturado nesta sessão** — validar com `docker compose build app && docker compose up -d` no teu host.

---

## 22. Problemas corrigidos (nesta entrega)

- Backend de composição **100% TypeScript em fonte**, com **build reprodutível** e imports de runtime apontando para **`backend/dist`**.
- **Health** alinhado a **controller → service**.
- **`.gitignore`** passa a ignorar **`backend/dist/`** para não versionar artefactos.

---

## 23. Pendências reais (honestas)

1. Migrar **`server/routes/*` + controllers** para `backend/src/modules/<domínio>/{routes,controller,service,repository,schemas,dto,types}.ts` **incrementalmente**, preservando URLs.
2. Remover **`@ts-nocheck`** dos mounts/`setupExpressHttpStack`/`apiErrorHandler` via **stubs `.d.ts`** ou migração dos alvos para TS.
3. **`AppError.ts` / `errorHandler.ts`** consolidados com `apiErrorHandler` (hoje o handler Express único é `apiErrorHandler`).
4. **`validateRequest.ts`** centralizado (Zod já no projeto).
5. **Frontend:** auditar duplicatas `pages/*` vs ficheiros apagados no Git; garantir **uma única fonte** para sidebar (já parcialmente feito em `sidebarItems.js` + API).
6. **`npm test` verde** — corrigir testes que falham por ambiente/asserts desatualizados (fora do âmbito desta PR).

---

## 24. Resultado de `npm run build`

- **Não existe** script único `build` na raiz que compile app+client+backend. **Usado:** `npm run build:backend` (**OK**), `npm run build --prefix client` (**OK** na execução local).

---

## 25. Resultado de `npm run typecheck`

- **`npm run typecheck:backend`** → **`tsc --noEmit -p backend/tsconfig.json`** → **OK** (após `@types/pg`).

---

## 26. Resultado de `npm run lint`

- O `lint` raiz é **`eslint . --ext .js`** — **não cobre** `backend/src/**/*.ts` por defeito. **Pendência:** `eslint` com TypeScript ou `eslint backend/src` com overrides.

---

## 27. Resultado de testes

- **`tests/httpErrors.test.mjs`:** **OK** (com `pretest` → `build:backend`).
- **`npm test` (suite completa):** **falha** por testes não relacionados (ver secção 21).

---

## 28. Resultado de Prisma validate / generate

- **`npx prisma validate --schema=server/prisma/schema.prisma`:** **OK**.
- **`npx prisma generate --schema=server/prisma/schema.prisma`:** **OK** (CLI reportou client gerado).

---

## 29. Resultado de Docker

- **Dockerfile:** adicionado passo **`esbuild`** para compilar `backend/src/**/*.ts` → `backend/dist/**` **antes** dos controllers TS já existentes no `server/`.
- **Build `docker compose build app`:** executado em background; **confirmar localmente** que a imagem completa (rede, cache Docker, `.env.production`).

---

## 30. Confirmação — secrets

- **Nenhum secret** foi adicionado a ficheiros versionados; **`.env` / `.env.production`** continuam fora do Git conforme `.gitignore`.

---

## 31. Confirmação — visual principal

- **Nenhuma alteração** a `client/src/App.jsx`, sidebar ou layout nesta entrega.

---

## 32. Confirmação — Express

- **Express 5** continua a ser o framework HTTP; apenas a **camada de composição** está em TypeScript compilado.

---

## 33. Confirmação — backend organizado para TypeScript

- **Sim** para **`backend/src`**: TypeScript estrito (com `@ts-nocheck` só na fronteira para `server/*.js`), **`backend/tsconfig.json`**, **`npm run typecheck:backend`**, **`npm run build:backend`**, integração em **`dev` / `start` / `start:prod`** e **Dockerfile**.

---

## Plano de migração (resumo executivo)

1. **Manter** `server/server.js` como bootstrap até o motor/socket/cron estiverem modularizados ou extraídos com interfaces estáveis.
2. **Por domínio:** mover um `server/routes/X.js` de cada vez para `backend/src/modules/X/` com **mesmo prefixo** `app.use`, testes de regressão manuais na rota.
3. **Repository:** substituir acessos Prisma diretos nos controllers migrados por `X.repository.ts`.
4. **DTO:** sanitizar respostas (passwords, tokens, hashes) antes de `res.json`.
5. **Build:** manter **`build:backend`** no CI e no Docker **antes** de `node server/server.js`.

---

## Scripts relevantes (raiz `package.json`)

| Script | Descrição |
|--------|-----------|
| `build:backend` | Compila `backend/src/**/*.ts` → `backend/dist/**` (esbuild, ESM, `packages:external`) |
| `typecheck:backend` | `tsc --noEmit -p backend/tsconfig.json` |
| `pretest` | Garante `backend/dist` antes de `npm test` |
| `dev` / `start` / `start:prod*` | Incluem `build:backend` onde necessário |

---

*Fim do relatório.*
