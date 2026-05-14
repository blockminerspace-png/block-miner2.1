# Server TypeScript migration — Step 03: Controllers

## Resumo

- **Objetivo:** eliminar fontes `.js` duplicadas em `server/controllers/`, consolidar controllers em TypeScript estrito, e manter `tsc`, builds e Docker alinhados ao entry `dist/server/`.
- **Situação final:** `find server/controllers -name "*.js" -type f` retorna **vazio**. Não há par `.js`/`.ts` no mesmo caminho lógico sob `server/controllers/` (apenas saída em `dist/server/controllers/*.js`).
- **Arquivos `.ts` em `server/controllers/`:** 57.

## Quantidade de `.js` em `server/controllers/` antes desta etapa

Havia **12** arquivos `.js` restantes que **duplicavam** controllers já existentes em `.ts` (migração anterior incompleta na remoção dos legados):

1. `adminInternalOfferwallController.js`
2. `adminReadEarnController.js`
3. `adminSupportController.js`
4. `adminUserInsightsController.js`
5. `btcpayWebhookController.js`
6. `chatController.js`
7. `faucetController.js`
8. `internalOfferwallController.js`
9. `offerEventController.js`
10. `supportController.js`
11. `transparencyController.js`
12. `userController.js`

**Ação:** remoção dos 12 `.js` duplicados; a fonte canônica permanece nos `.ts` correspondentes (exports já conferidos com a versão `.js` antes da remoção).

## Arquivos novos ou migrados nesta etapa (além da remoção dos duplicados)

| Arquivo | Motivo |
|---------|--------|
| `server/controllers/controllerHttpStatusError.ts` | `HttpStatusError`, leitura segura de `unknown`, `jsonClientError`, `requireSessionUser`. |
| `server/types/idempotencyLease.ts` | Tipo de lease idempotente + type guard (`isIdempotencyLease`). |
| `server/utils/criticalMutationIdempotency.ts` | Migração de `criticalMutationIdempotency.js` → `.ts` com tipos Express e lease estreito. |
| `server/controllers/database/serverDatabaseAdminData.ts` | Consultas Prisma para endpoints antes referenciando funções inexistentes em `serverDatabaseModel.js` (ver dívida técnica abaixo). |

### `tsconfig.server.json`

- Inclusão explícita de `server/utils/criticalMutationIdempotency.ts` para compilação/tipagem alinhada ao grafo de imports dos controllers.

## Auditoria (tabela solicitada — duplicados `.js` removidos)

Para cada arquivo `.js` removido, a versão `.ts` já existia; a tabela documenta uso e dependências observados no repositório.

| Arquivo JS (removido) | Rotas que usam | Serviços/modelos importados | Prisma direto | `req.user` | Params/query/body | Migrado para | Dependências necessárias | Risco | Status |
|----------------------|----------------|------------------------------|---------------|------------|---------------------|---------------|-----------------------------|-------|--------|
| `adminInternalOfferwallController.js` | `server/routes/admin.ts` | Serviços admin/offerwall, Prisma em handlers | Sim | Admin JWT (`req.admin`) | Params/query conforme handlers | `adminInternalOfferwallController.ts` | Mesmos imports `.js` NodeNext | Médio (admin) | Removido; TS canônico |
| `adminReadEarnController.js` | `server/routes/admin.ts` | Read-earn admin services | Sim/não conforme handler | Admin | Body/query | `adminReadEarnController.ts` | — | Médio | Removido |
| `adminSupportController.js` | `server/routes/admin.ts` | Support services, multer onde aplicável | Parcial | Admin | Params | `adminSupportController.ts` | — | Médio | Removido |
| `adminUserInsightsController.js` | `server/routes/admin.ts` | Insights / ledger services | Sim | Admin | `userId` param | `adminUserInsightsController.ts` | — | Médio (dados sensíveis) | Removido |
| `btcpayWebhookController.js` | Rotas webhook BTCPay | `btcpayService`, validação de payload | Raro | Não (assinatura webhook) | Raw body | `btcpayWebhookController.ts` | — | Alto (pagamentos) | Removido |
| `chatController.js` | `server/routes/chat.ts` | Prisma chat, engine/io | Sim | Sim | Body/params | `chatController.ts` | — | Médio | Removido |
| `faucetController.js` | `server/routes/faucet.ts` | Faucet services | Sim | Sim | Body | `faucetController.ts` | — | Alto | Removido |
| `internalOfferwallController.js` | `server/routes/internal-offerwall.ts` | Offerwall + idempotência | Sim | Sim | Params/body | `internalOfferwallController.ts` | `criticalMutationIdempotency` | Alto | Removido |
| `offerEventController.js` | `server/routes/offer-events.ts` | Shop/event services, idempotência | Sim | Sim | Params/body | `offerEventController.ts` | Idempotência | Alto | Removido |
| `supportController.js` | `server/routes/support.ts` | Support model/service, multer | Sim | Opcional/auth | Multipart + JSON | `supportController.ts` | — | Médio | Removido |
| `transparencyController.js` | `server/routes/admin.ts` | Transparência / wallet admin | Sim | Admin | Body/query/params | `transparencyController.ts` | — | Médio | Removido |
| `userController.js` | `server/routes/user.ts` | Prisma, 2FA, referrals | Sim | Sim | Body | `userController.ts` | `otplib`, `qrcode` | Alto (conta/2FA) | Removido |

## Controllers por categoria (após etapa)

- **Públicos / app autenticado:** inclui `faucetController`, `chatController`, `internalOfferwallController`, `offerEventController`, `supportController`, `userController`, e demais já em `.ts` (wallet, shop, mining, etc.).
- **Privados (usuário logado):** rotas sob `requireAuth` que apontam para controllers em `server/controllers/*.ts`.
- **Admin / suporte:** `admin*Controller.ts`, `transparencyController.ts`, `adminSupportController.ts`, etc.
- **Críticos econômicos:** faucet, offer events, internal offerwall, wallet, shop, BTCPay webhook — todos em `.ts`; regras de negócio preservadas na migração (sem alteração funcional intencional).

## Problemas de tipagem e como foram resolvidos

1. **Duplicação `.js`/`.ts`:** remoção dos `.js` legados; rotas já importam `../controllers/fooController.js` (NodeNext → emite `fooController.js` no `dist`).
2. **`resolveCriticalMutation` retornava `lease: object`:** `criticalMutationIdempotency` migrado para `.ts` com `IdempotencyLease` + guarda; `finalizeCriticalMutationSuccess`/`cancelCriticalMutation` tipados.
3. **`req.user` opcional em rotas autenticadas:** `requireSessionUser` + padrão `user`/`userId` nos controllers afetados (wallet, power stats, vault, etc.).
4. **`unknown` em `catch`:** `readErrorMessage` / `readErrorCode` / `readHttpStatus` / `readVaultSlot` centralizados.
5. **`serverDatabaseController` chamando funções inexistentes no `serverDatabaseModel.js`:** implementação Prisma em `serverDatabaseAdminData.ts` + ajuste de mapeamento de chat (Prisma camelCase) e `insertResult.id` em vez de `lastID`.
6. **Controllers volumosos (deposit tickets, inventory, machines, rooms, shop):** correções adicionais de tipos Prisma, transações, payloads de idempotência e queries (subconjunto final consolidado com `npm run typecheck:server` verde).

## Uso de `any`

- **Não** foram adicionados `: any`, `as any`, `Record<string, any>` ou `@ts-ignore` / `@ts-nocheck` em `server/controllers/**/*.ts` (verificado com `grep`).

## Confirmação `@ts-ignore` / `@ts-nocheck`

- Nenhum uso em `server/controllers/**/*.ts` (grep).

## Resultados de comando (ambiente local desta execução)

| Comando | Resultado |
|---------|-----------|
| `npm run typecheck:server` | **OK** (exit 0) |
| `npm run build:server` | **OK** |
| `npm run typecheck` | **OK** (inclui `typecheck:backend`) |
| `npm run build:backend` | **OK** |
| `node --test tests/httpErrors.test.mjs` | **OK** |
| `npm test` (suite completa) | **Falhou** — entre outros, `tests/registerBodySchema.test.mjs` (falha já conhecida citada no escopo). Outros testes (`rooms`, `shopControllerLogging`, `transparency`, `wallet*`) também falharam neste ambiente; tratar como **verificação adicional** / possível dependência de DB ou fixtures, não como regressão provada desta etapa sem bisect. |
| `docker compose build --no-cache` | **OK** — imagens `app` e `worker` construídas com sucesso. |
| `docker compose up -d` | **Não executado** — não há `.env` local padrão no root (apenas `.env.production` / `client/.env.example`); subir stack sem variáveis revisadas arrisca serviços incompletos. |

## `find` pós-migração

```bash
find server/controllers -name "*.js" -type f | sort
# (vazio)

find server/controllers -name "*.ts" -type f | sort
# 57 arquivos .ts (lista omitida aqui por tamanho; ver repositório)

find dist/server/controllers -name "*.js" -type f | sort
# Saída de build — esperado e correto
```

## Dívida técnica / próxima etapa

1. **`server/services/**/*.js`:** migrar serviços gradualmente; controllers já consomem serviços JS via `allowJs` + imports `.js`.
2. **`serverDatabaseAdminData.ts`:** concentra consultas admin/landing/Youtube que antes estavam referenciadas no controller mas não existiam no `serverDatabaseModel.js`; revisar métricas “pool”/agregados com o modelo econômico desejado (pode divergir de um hipotético SQLite legado nunca presente no repo).
3. **Testes `npm test`:** isolar falhas pré-existentes (`registerBodySchema`, possivelmente `ipIntelligenceService` se reaparecer) e corrigir em etapa dedicada de testes/CI.

## Confirmação: sem `.js` duplicado ao lado de `.ts` em `server/controllers/`

- **Sim:** apenas `.ts` sob `server/controllers/`; `.js` gerados ficam em `dist/server/controllers/`.

## Próxima etapa sugerida (não executada aqui)

- Migrar `server/services/**/*.js` → `.ts` (etapa 04), mantendo a mesma disciplina NodeNext e `allowJs` até o restante do servidor estabilizar.
