# BlockMiner — Step 07: `server/cron` e `server/jobs` → TypeScript

## Resumo executivo

- **Arquivos `.js` em `server/cron` (antes):** 14  
- **Arquivos `.js` em `server/jobs` (antes):** 4  
- **Estado atual:** apenas **`.ts`** em `server/cron` e `server/jobs` (sem par fonte `.js` + `.ts`). Saída compilada em `dist/server/cron/**/*.js` e `dist/server/jobs/**/*.js`.
- **`tsconfig.server.json`:** inclui `server/cron/**/*.ts` e `server/jobs/**/*.ts`; `allowJs` / `checkJs` mantidos conforme pedido.

## Lista completa migrada para `.ts`

### `server/cron/` (14)

1. `autoMiningGpuCron.ts`  
2. `backupCron.ts`  
3. `blkRewardCycleCron.ts`  
4. `callbackQueueCron.ts`  
5. `checkinPendingCron.ts`  
6. `cronActionRunner.ts`  
7. `depositsCron.ts`  
8. `gamePowerCleanup.ts`  
9. `index.ts`  
10. `miningCron.ts`  
11. `offerEventsExpireCron.ts`  
12. `securityArtifactCleanupCron.ts`  
13. `shortlinkResetCron.ts`  
14. `withdrawalsCron.ts`  

### `server/jobs/` (4)

1. `bullmqRedis.ts`  
2. `blockminerQueue.ts`  
3. `blockminerWorker.ts`  
4. `runBlockminerWorker.ts`  

## `.js` restantes em `server/cron` / `server/jobs`

Nenhum (critério de aceite: `find server/cron -name "*.js"` e `find server/jobs -name "*.js"` vazios).

## Tabela de auditoria (por arquivo)

| Arquivo | Tipo | Usado por | Prisma | Econ. crítico | Transação | Lock/idempot. | Rede/API ext. | Env/secrets | Cadência | Migrado para | Deps. diretas | Risco | Status |
|---------|------|-----------|--------|---------------|-------------|-----------------|---------------|-------------|----------|--------------|---------------|-------|--------|
| `cronActionRunner.ts` | internal task | `depositsCron`, `miningCron`, `blkRewardCycleCron` | não | não | não (runner) | opcional (`allowConcurrent`) | não | não | N/A | `.ts` | — | Baixo | OK |
| `index.ts` | scheduler | `server/server.js` (`startCronTasks`) | não | não | não | não | não | não | boot | `.ts` | vários crons | Baixo | OK |
| `miningCron.ts` | cron | `index.ts` | não | sim (estado mineração) | não explícito | via runner | não | env opcional tick | 1s / 15s / 60s | `.ts` | engine, sanitize, logger | Médio | OK |
| `gamePowerCleanup.ts` | cron | `index.ts` | sim | não | não | não | não | não | 5 min | `.ts` | prisma, serviços AM v2 | Baixo | OK |
| `withdrawalsCron.ts` | cron | `index.ts` | sim (model) | sim (saque on-chain) | não | não | Polygon RPC | sim (keys, RPC) | `*/2 * * * *` | `.ts` | ethers, walletModel | Alto se `WITHDRAWAL_AUTO_SEND` | OK |
| `depositsCron.ts` | cron + job | `index.ts`, `blockminerWorker` | sim | sim (depósitos) | não explícito | runner + fila job | Polygonscan API | sim (API keys) | 60s + wake | `.ts` | axios, ethers, prisma | Alto | OK |
| `blkRewardCycleCron.ts` | cron | não ligado em `index` (módulo exportado) | via serviço | sim (BLK) | conforme serviço | conforme serviço | não | env tick ms | `BLK_REWARD_TICK_MS` | `.ts` | blkRewardDistribution, economy model | Alto | OK |
| `checkinPendingCron.ts` | cron | `index.ts` | via controller | sim (check-in) | conforme controller | conforme fluxo | não | env interval | `CHECKIN_PENDING_CRON_MS` | `.ts` | checkinController | Médio | OK |
| `offerEventsExpireCron.ts` | cron | `index.ts` | sim | offerwall/shop | não | não | não | env interval | 5 min default | `.ts` | prisma | Baixo | OK |
| `securityArtifactCleanupCron.ts` | cron | `index.ts` | sim | antifraud auxiliar | não | não | não | env interval / idade | configurável | `.ts` | prisma | Baixo | OK |
| `autoMiningGpuCron.ts` | cron (GPU) | out-of-band (não em `index`) | sim (model) | inventário GPU | não | não | não | não | `*/5`, `* * * * *` | `.ts` | autoMiningGpuModel | Baixo | OK |
| `backupCron.ts` | stub cron | comentado em `index` | não | não | não | não | não | não | N/A | `.ts` | logger | Nenhum | OK |
| `callbackQueueCron.ts` | stub | `index.ts` | não | não | não | não | não | não | N/A | `.ts` | logger | Nenhum | OK |
| `shortlinkResetCron.ts` | stub | `index.ts` | não | não | não | não | não | não | N/A | `.ts` | logger | Nenhum | OK |
| `bullmqRedis.ts` | internal | `blockminerQueue`, `blockminerWorker` | não | não | não | não | Redis | `REDIS_URL` | N/A | `.ts` | ioredis | Médio | OK |
| `blockminerQueue.ts` | queue | API enqueue | não | não | não | BullMQ dedup jobId welcome | Redis | `REDIS_URL`, `BULLMQ_DISABLED` | on-demand | `.ts` | bullmq, ioredis | Baixo | OK |
| `blockminerWorker.ts` | worker | `runBlockminerWorker` | via `scanForNewDeposits` | sim (job scan) | não | job BullMQ | Polygonscan via cron | SMTP | worker | `.ts` | bullmq, depositsCron, mailer | Alto (scan) | OK |
| `runBlockminerWorker.ts` | entry | Docker / `npm run worker:bullmq` | não | não | não | não | não | não | processo | `.ts` | blockminerWorker | Baixo | OK |

## Categorias (resumo)

5. **Crons simples:** `backupCron`, `callbackQueueCron`, `shortlinkResetCron` (stubs).  
6. **Com Prisma:** `gamePowerCleanup`, `depositsCron`, `offerEventsExpireCron`, `securityArtifactCleanupCron`, `autoMiningGpuCron` (model).  
7. **Econômicos críticos:** `miningCron`, `depositsCron`, `withdrawalsCron`, `blkRewardCycleCron`, `checkinPendingCron`, worker de depósitos.  
8. **Locks/idempotência:** principalmente via `createCronActionRunner` e filas BullMQ (`jobId` em welcome email); detalhes em serviços chamados.  
9. **Integrações externas:** `depositsCron` (Polygonscan/axios), `withdrawalsCron` (Polygon RPC + ethers).  

## Problemas de tipagem e resoluções

| Problema | Resolução |
|----------|-----------|
| `Logger` incompatível com `CronLogger` (index signature) | Removido `[key: string]: unknown` de `CronLogger` em `cronActionRunner.ts`. |
| `MiningIoLike` sem `emit` usado em validação | Adicionado `emit?` opcional alinhado ao uso real. |
| `syncUserBaseHashRate` possivelmente `undefined` em `execute` | Guard `typeof === "function"` antes de `refreshKnownMinerHashrates`. |
| `ioredis` default import não construível em ESM | Uso de `import { Redis } from "ioredis"` (igual `redisClient.ts`). |
| Worker / compose apontando para fonte `.js` removida | `package.json`, `docker-compose.yml`, `docker-compose.local.yml` → `node dist/server/jobs/runBlockminerWorker.js`. |
| ESLint CJS override para `autoMiningGpuCron` | Arquivo removido da lista legacy (agora ESM TypeScript). |

## Uso de `any`

Não foi introduzido `any` nem `as any` em `server/cron` ou `server/jobs` (verificado com grep).

## `@ts-ignore` / `@ts-nocheck`

Não utilizados nestes diretórios.

## Ajuste fora de cron/jobs (dependência direta mínima)

- **`server/models/walletModel.ts`:** `updateTransactionStatus(..., txHash: string \| null)` para alinhar envio automático de saques (`withdrawalsCron`) com tipagem segura (etapa anterior / compatível com esta migração).

## Validações executadas

| Comando | Resultado |
|---------|-----------|
| `npm run typecheck:server` | **passou** (exit 0) |
| `npm run build:server` | **passou** |
| `npm run typecheck` | **passou** (server + backend) |
| `npm run build:backend` | **passou** |
| `node --test tests/httpErrors.test.mjs` | **passou** |
| `node --test tests/depositsCron.test.js tests/miningCronHashrateSync.test.js` | **passou** |
| `npm test` (suite completa) | **falhou** em testes já conhecidos de produto/ambiente: `i18nLanguage.test.mjs` (locale `en` vs `pt-BR`), `ipIntelligenceService.test.mjs` (`unknown` vs `residential`). Não relacionados a cron/jobs desta etapa. |
| `docker compose build --no-cache` | **passou** (exit 0) |
| `find server/cron server/jobs -name "*.js"` | **vazio** |
| `grep` antipadrões em `server/cron` e `server/jobs` (`@ts-ignore`, `@ts-nocheck`, `as any`, `: any`) | **sem ocorrências** |

## Docker / entry worker

- App continua com **`CMD ["node", "dist/server/server.js"]`** no `Dockerfile`.  
- Serviço **`worker`** passa a usar **`node dist/server/jobs/runBlockminerWorker.js`** (imagem já compila com `tsc -p tsconfig.server.json`).  
- **`npm run worker:bullmq`** atualizado para o mesmo caminho em `dist/`.

## Confirmação: sem duplicata fonte `.js` + `.ts`

Confirmado: não há `.js` fonte em `server/cron` nem `server/jobs` ao lado de `.ts`.

## Riscos / dívidas (refatoração futura)

- **`withdrawalsCron`:** envio automático depende de hot wallet e RPC; falhas não marcam `failed` automaticamente (comportamento preservado).  
- **`depositsCron`:** lógica econômica e API externa concentradas; manter monitorização de rate limits e chaves.  
- **`blkRewardCycleCron`:** tick econômico; garantir que apenas um líder/processos coordenados executem em deploy multi-instância (regra já no serviço, não alterada aqui).  
- **`autoMiningGpuCron`:** ainda usa `console.log` / `console.error` (comportamento legado); migrar para `logger` seria melhoria cosmética.  

## Imports `../server/*.js` fora de `tests`

Continuam em **scripts**, **client/vite.config.js**, **`.deploy/**`**, e vários **tests** que importam módulos compilados ou fonte legada. **Decisão:** fora do escopo Step 07; testes que já usam `#server/*` permanecem o padrão recomendado. Nenhum ajuste forçado para `cron`/`jobs` além do worker em Docker/npm.

## Próxima etapa (não executada aqui)

Limpeza de JS restante em `server/src`, `server/*.js`, `scripts/`, etc., conforme roadmap do utilizador.

---

**Data do relatório:** 2026-05-13  
**Critério de aceite Step 07:** cumprido para código fonte em `server/cron` e `server/jobs`, builds, typechecks e Docker build.
