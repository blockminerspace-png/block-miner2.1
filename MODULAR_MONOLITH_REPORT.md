# Relatório técnico — Monólito modular (BlockMiner / `block-miner`)

Data: 2026-05-12  
Escopo: primeira fase de migração arquitetural **sem** mover `server/prisma` nem alterar contratos Docker/URLs públicas.

---

## 1. Estrutura antiga encontrada

- **Raiz**: um único pacote npm (`package.json`), `"main": "server/server.js"`.
- **Backend**: pasta `server/` com `server.js` monolítico (~700 linhas) orquestrando:
  - Express 5, Helmet, CORS, CSRF, rate limit distribuído, audit context, BTCPay webhook (raw body).
  - Dezenas de imports diretos de `server/routes/*.js` e alguns controllers públicos.
  - Motor de mineração, Socket.IO, crons e workers referenciados a partir do mesmo processo.
- **Prisma**: `server/prisma/schema.prisma` + `migrations/`; cliente em `server/src/db/prisma.js` (pool `pg` + adapter `@prisma/adapter-pg`).
- **Frontend**: `client/` (Vite + React), build copiado no container para `client/dist`.
- **Docker**: `docker-compose.yml` (db, redis, app, worker, nginx); `Dockerfile` com `CMD ["node", "server/server.js"]`; `docker-entrypoint.sh` com `prisma generate` em `server/prisma/schema.prisma`.
- **Testes**: `tests/*.test.mjs` via `node scripts/run-node-tests.mjs` (runner próprio, não Vitest no servidor).

---

## 2. Nova estrutura criada

Foi introduzida a pasta **`backend/src/`** como camada de composição do monólito, **sem** remover a pasta `server/` (compatibilidade com Docker, worker e imports existentes).

```txt
backend/
  src/
    app/
      setupExpressHttpStack.js   # Helmet, CORS, compression, BTCPay raw, JSON, CSRF, limiters globais, ADMIN_ONLY_MODE
      registerHttpRoutes.js      # Montagem de todas as rotas /api/* e endpoints públicos listados
    modules/
      health/
        health.controller.js
        health.routes.js
    shared/
      prisma/
        client.js                # Único PrismaClient + pool (fonte da verdade)
      errors/
        httpErrors.js            # Erros tipados 400–500 + 422/429
      http/
        apiErrorHandler.js       # Handler Express centralizado para API + páginas
```

**Observação:** `server/prisma/` **permanece no lugar** (scripts `db:*`, Dockerfile e entrypoint inalterados). O “shared/prisma” do desenho-alvo corresponde hoje a `backend/src/shared/prisma/client.js`, reexportado por `server/src/db/prisma.js`.

---

## 3. Módulos migrados

| Módulo   | Estado | Detalhe |
|---------|--------|---------|
| `health` | **Migrado** (padrão routes + controller) | `GET /health` agora via `app.use("/health", healthRouter)` com o mesmo JSON `{ ok, message }`. |
| Demais domínios (`auth`, `wallet`, `mining`, `admin`, `support`, …) | **Não extraídos** nesta fase | Continuam em `server/routes/*` e controllers atuais; apenas **registrados** centralmente em `registerHttpRoutes.js` para fronteira clara de composição HTTP. |

Domínios reais identificados no código (para fases seguintes): auth, faucet, wallet, mining, deposit-tickets, shop, inventory, machines, racks, vault, read-earn, rooms, checkin, offer-events, mini-pass, daily-tasks, internal-offerwall, chat, ranking, stats, shortlink, youtube, games, auto-mining-gpu, session, notifications, broadcast, swap, support, user, sidebar, admin (+ admin-auth, admin-auto-mining-rewards), stats/banners/transparency/live-server-stats.

---

## 4. Arquivos movidos

Nenhum arquivo legado foi movido de diretório nesta fase (evita quebrar paths do Dockerfile, esbuild de controllers TS, e imports relativos).  
**Único “deslocamento” lógico:** implementação do Prisma client copiada para `backend/src/shared/prisma/client.js`; `server/src/db/prisma.js` passou a **reexportar** esse singleton.

---

## 5. Arquivos alterados

- `server/server.js` — confia em `setupExpressHttpStack`, `registerHttpRoutes`, `apiErrorHandler`; remove bloco gigante duplicado de middleware/rotas.
- `server/src/db/prisma.js` — reexport do cliente central.
- `server/services/databaseBackupService.js` — row count sem `$queryRawUnsafe`; inclusão de `backend` nos alvos opcionais de backup; import `Prisma` para identificador seguro.
- `tests/databaseBackupService.test.mjs` — mock atualizado para `$queryRaw`.
- **Novos:** `backend/src/app/setupExpressHttpStack.js`, `backend/src/app/registerHttpRoutes.js`, `backend/src/shared/prisma/client.js`, `backend/src/shared/errors/httpErrors.js`, `backend/src/shared/http/apiErrorHandler.js`, `backend/src/modules/health/*`, `tests/httpErrors.test.mjs`.

---

## 6. Rotas preservadas

Todas as montagens `app.use("/api/...", …)` e `GET` públicos reproduzidos em `registerHttpRoutes.js` na mesma ordem lógica anterior, incluindo:

- `/api/payments/btcpay/webhook` (permanece **antes** de `express.json` dentro de `setupExpressHttpStack`, como antes).
- `/api/live-server-stats`, `/api/public-stats`, `/api/banners`, `/api/transparency`.
- `/health` — mesmo contrato JSON (montagem por router em `/health` + `GET /`).

Nenhuma URL pública renomeada.

---

## 7. Melhorias de segurança aplicadas

- **`collectPublicTableExactRowCounts`**: substituído `$queryRawUnsafe` por `$queryRaw` + `Prisma.raw(name)` com **nome já validado** por `isSafePublicTableNameForRowCount` (mantém invariante anti-injeção e remove uso inseguro direto).
- **Handler de erro API**: `apiErrorHandler` — respostas JSON com `code` para `HttpError`; **não loga** `HttpError` 4xx como falha de sistema; mantém log para 5xx e erros inesperados.
- **Erros tipados** (`BadRequestError`, `UnauthorizedError`, …) prontos para adoção gradual em services/controllers.

---

## 8. Pontos de risco encontrados

- **Acoplamento `backend` → `server`**: `setupExpressHttpStack` e `registerHttpRoutes` importam middlewares/controllers em `server/`. Um ciclo futuro `server` → `backend` → `server` deve ser evitado ao extrair módulos (preferir `backend/src/shared/*` sem depender de `server/utils` no handler de erro de longo prazo — hoje `apiErrorHandler` usa `server/utils/logger.js`).
- **`server/models/db.js`**: ainda expõe helpers que delegam a `$queryRawUnsafe` / `$executeRawUnsafe` — legado documentado no `docs/SECURITY-AUDIT.md`; não alterado nesta tarefa além do backup row-count.
- **Suíte de testes**: `npm test` ainda reporta falhas **pré-existentes** em outros arquivos (ex.: `registerBodySchema`, teste de IP intelligence); não introduzidas por esta mudança.

---

## 9. Pontos que ainda precisam de refatoração futura

1. Extrair módulos por domínio (`auth.routes.js` + service + repository…) a partir dos arquivos volumosos em `server/routes/auth.js` etc.
2. Centralizar **validação** repetida em `*.schemas.js` por módulo (Zod já está no projeto).
3. Mover gradualmente **Prisma** só para leitura via repositories; controllers sem acesso direto ao Prisma.
4. Trocar `server/models/db.js` por consultas parametrizadas / Prisma fluent onde ainda houver `Unsafe`.
5. Opcional: física `backend/prisma/` + ajuste de `Dockerfile`/`package.json` quando houver janela de deploy coordenada.
6. Logger compartilhado em `backend/src/shared/logger` para remover dependência do handler de erro em `server/utils`.

---

## 10. Comandos executados

- `npm test` (suite completa; ver seção 11).
- `node -e "import('./backend/src/app/registerHttpRoutes.js')..."` — carga do módulo de rotas.
- `node -e "import('./backend/src/app/setupExpressHttpStack.js')..."` — carga do stack HTTP.
- `npx eslint server/server.js backend/src` (amostragem local).

---

## 11. Resultado dos testes / build

- **`databaseBackupService`** e **`httpErrors`**: passando.
- **Suite completa `npm test`**: ainda com falhas em testes não tocados nesta mudança (vide log do terminal na execução local); **não** atribuídas a esta refatoração.
- **Build**: não executado `npm run build:client` nesta sessão (mudanças só em servidor/backend); recomendado no CI habitual.

---

## 12. Como subir o projeto em Docker

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f app
```

Comportamento preservado: mesma imagem, mesmo `CMD`, mesmo schema Prisma em `server/prisma/`.

---

## 13. Como validar manualmente (checklist)

| Área | Ação |
|------|------|
| Login / auth | Fluxo web contra `/api/auth/*` (registro, login, refresh) com rate limit observado. |
| Admin | Painel `/api/admin/*` após login admin; verificar que `ADMIN_ONLY_MODE` ainda respeita prefixos permitidos incluindo `/health`. |
| Support | Rotas `/api/support/*` e socket support (sem mudança de código além da ordem de registro). |
| Mineração | Dashboard + socket miner; blocos e recompensas como antes. |
| Baterias / workshop | Fluxos já cobertos por testes de domínio existentes (`machineInstanceState`, racks, etc.). |
| Transações | Depósitos/saques via rotas existentes; BTCPay webhook com raw body. |

---

## 14. Mudanças de banco

**Nenhuma.** Nenhuma migration nova; nenhum `db push` executado.

---

## 15. Confirmação — secrets

- Nenhuma variável secreta, token, senha ou chave foi adicionada ao repositório.
- Nenhum log novo de payload financeiro completo ou credenciais.
- O relatório não contém valores de `.env`.

---

## Resumo executivo

Foi estabelecida a **base do monólito modular** (`backend/src/app`, `backend/src/shared`, primeiro módulo `health`), com **Prisma centralizado** fisicamente em `backend/src/shared/prisma/client.js` e **composição HTTP** extraída de `server/server.js`. O restante do domínio permanece em `server/` com **rotas e URLs idênticas**, preparando migrações incrementais por módulo sem big-bang.
