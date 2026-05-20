# Relatório — Express em `backend/` (TypeScript)

**Projeto:** BlockMiner 2.1  
**Data:** 2026-05-12  
**Âmbito:** apenas `backend/src` (composição HTTP Express + Prisma + erros + health). O monólito `server/routes/*.js` **permanece em JavaScript**; a ligação tipada faz-se via **`package.json` → `"imports"`** (`#server/*`) e **stubs `.d.ts`** sob `backend/src/types/stubs/`.

---

## 1. Quantos ficheiros `.js` existiam em `backend/src`

**0** (após migrações anteriores já não havia `.js` em `backend/src`).

Comando: `find backend/src -name "*.js" -type f` → **0**.

---

## 2. Quantos foram migrados para `.ts`

Todos os ficheiros fonte em `backend/src` são **`.ts`** (11 ficheiros `.ts` de aplicação + `express.d.ts` + ~47 stubs `.d.ts` gerados para tipagem de módulos `#server/...`).

---

## 3. Lista dos ficheiros migrados / estrutura atual

| Ficheiro |
|----------|
| `backend/src/app/registerHttpRoutes.ts` |
| `backend/src/app/setupExpressHttpStack.ts` |
| `backend/src/app/mount/userApiRoutes.mount.ts` |
| `backend/src/app/mount/adminApiRoutes.mount.ts` |
| `backend/src/app/mount/publicSurfaceRoutes.mount.ts` |
| `backend/src/modules/health/health.routes.ts` |
| `backend/src/modules/health/health.controller.ts` |
| `backend/src/modules/health/health.service.ts` |
| `backend/src/modules/health/index.ts` |
| `backend/src/shared/errors/httpErrors.ts` |
| `backend/src/shared/http/apiErrorHandler.ts` |
| `backend/src/shared/prisma/client.ts` |
| `backend/src/types/express.d.ts` |
| `backend/src/types/stubs/stub-*.d.ts` (tipagem dos módulos `#server/...`) |

---

## 4. Ficheiros que ficaram `.js` e motivo

- **`server/**/*.js`** — fora do pedido “só backend” nesta iteração; continua a ser o corpo das rotas Express.
- **`server/server.js`** — entrypoint de processo (motor, sockets, cron); não alterado.
- **Nenhum `.js` duplicado** em `backend/src` equivalente a `.ts`.

---

## 5. Alterações em `backend/tsconfig.json`

- `target` ES2022, **`module` / `moduleResolution`: `NodeNext`**.
- `rootDir`: `src`, `outDir`: `dist`, **`strict`**, `noImplicitAny`, `strictNullChecks`, `forceConsistentCasingInFileNames`, `skipLibCheck`, `esModuleInterop`, `sourceMap`.
- **`baseUrl`: `.`** e **`paths`**: cada `#server/...` → ficheiro stub em `./src/types/stubs/...` (tipagem sem `any` nos mounts).
- `include`: `src/**/*.ts`, `src/**/*.d.ts`; `exclude`: `node_modules`, `dist`.

---

## 6. Alterações em `package.json` (raiz e `backend/`)

**Raiz**

- `"imports": { "#server/*": "./server/*" }` — resolução em **runtime** dos imports `#server/...` emitidos pelo `tsc` (Node ≥ 16 com `package.json` `imports`).
- `"build:backend": "tsc -p backend/tsconfig.json"`.
- `"typecheck": "npm run typecheck:backend"`.
- **DevDependency:** `@types/compression`.

**`backend/package.json`** (novo)

- Scripts `typecheck` / `build` delegam para a raiz (`--prefix ..`); `prisma:validate` / `prisma:generate` usam `--schema=../server/prisma/schema.prisma` quando o cwd é `backend/`.

---

## 7. Dockerfile / docker-compose

- **Dockerfile:** substituído o passo **esbuild** do `backend` por instalação temporária de `typescript` + `@types/*` e **`npx tsc -p backend/tsconfig.json`** (imagem de produção usa `npm install --omit=dev`, por isso o `tsc` é instalado só para este RUN).
- **docker-compose:** sem alterações.

---

## 8. Problemas de tipagem encontrados

1. **`paths` do TypeScript não se aplicam a imports relativos** (`../../../../server/...`) — o compilador continuava a resolver os `.js` reais e a ignorar `declare module` em `.d.ts` para esses caminhos.
2. **`helmet`**: opção `permissionsPolicy` não reconhecida no tipo `HelmetOptions` da versão instalada.
3. **`compression`**: sem tipos até instalar `@types/compression`.

---

## 9. Como foram resolvidos

1. Imports em `backend/src` alterados para **`#server/routes/...`**, **`#server/middleware/...`**, etc.; **`paths`** no `backend/tsconfig.json` mapeiam cada `#server/...` para um **stub `.d.ts`** com exports tipados (`Router`, `RequestHandler`, etc.).
2. **`package.json` (raiz)** com `"imports": { "#server/*": "./server/*" }`** para o Node resolver os mesmos especificadores em runtime.
3. **`helmet({...} as import("helmet").HelmetOptions)`** no `setupExpressHttpStack.ts`.
4. **`npm install -D @types/compression`** na raiz.

---

## 10. Resultado de `npm run typecheck`

Na raiz: **`npm run typecheck`** → **`tsc --noEmit -p backend/tsconfig.json`** → **OK**.

Em `backend/`: **`npm run typecheck`** → delega para a raiz → **OK**.

---

## 11. Resultado de `npm run build`

- Na raiz não existe um único `npm run build` para todo o monólito; o equivalente ao build do backend é **`npm run build:backend`** → **`tsc -p backend/tsconfig.json`** → **OK** (saída em `backend/dist/`).
- Em `backend/`: **`npm run build`** → **OK** (via `--prefix ..`).

---

## 12. Resultado de `npx prisma validate`

**OK** (schema em `server/prisma/schema.prisma`).

---

## 13. Resultado de `npx prisma generate`

**OK** (cliente gerado em `node_modules/@prisma/client`).

---

## 14. Resultado do Docker

- **Dockerfile** atualizado para compilar o `backend` com **`tsc`** no estágio da app.
- **`docker compose build` / `up`:** não executado até ao fim nesta sessão; convém validar localmente: `docker compose build app && docker compose up -d`.

---

## 15. Confirmação — Express

**Express** continua a ser o framework HTTP; apenas a camada em `backend/src` está em TypeScript compilado para `backend/dist/`.

---

## 16. Confirmação — rotas principais

- Os mounts continuam a registar os **mesmos** routers de `server/routes` nos **mesmos** prefixos `/api/...`.
- Alteração apenas nos **especificadores de import** (`#server/...` + `imports` na raiz), sem mudança de URL.

---

## 17. Confirmação — secrets

Nenhum segredo adicionado ao repositório; `.env` continua ignorado pelo Git.

---

### Notas para evolução

- Migrar gradualmente **`server/routes`** para `.ts` e, quando isso acontecer, reduzir ou eliminar stubs `#server/...`.
- O tipo **`Request.user`** em `backend/src/types/express.d.ts` usa o modelo **`User` do Prisma** (alinhado ao `requireAuth`); não expõe dados ao cliente por si só, mas o tipo inclui campos internos — pode-se estreitar para um `Pick` se quiseres maior disciplina de DTO.
