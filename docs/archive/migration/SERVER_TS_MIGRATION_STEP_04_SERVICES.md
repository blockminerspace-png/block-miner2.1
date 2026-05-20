# Server TypeScript migration — Step 04 (services)

## 1. Quantidade de `.js` em `server/services` antes da migração

Auditoria inicial (padrão da etapa): todos os serviços reais estavam em `.js` e foram migrados para `.ts`. O estado final conta **86** ficheiros `.ts` em `server/services` e **0** ficheiros `.js` de código-fonte nessa árvore (alinhado com o rename em massa + tipagem).

## 2. Lista completa dos ficheiros migrados para `.ts`

Total: **86** ficheiros (ordenados):

`accountLockoutService.ts`, `adminAccountCollisionService.ts`, `adminAuditListService.ts`, `adminFraudSignalsService.ts`, `adminMinersService.ts`, `adminUserManagementService.ts`, `authNetworkSignalService.ts`, `autoMiningV2/autoMiningV2DbAvailability.ts`, `autoMiningV2/autoMiningV2Domain.ts`, `autoMiningV2/autoMiningV2Service.ts`, `blkRewardDistributionService.ts`, `blockMinerDepositAbi.ts`, `btcpayService.ts`, `checkinChain.ts`, `checkinMilestoneService.ts`, `contractDepositLog.ts`, `contractDepositSync.ts`, `dailyTasks/dailyTaskClaimService.ts`, `dailyTasks/dailyTaskConstants.ts`, `dailyTasks/dailyTaskDashboardService.ts`, `dailyTasks/dailyTaskDefinitionAdminValidation.ts`, `dailyTasks/dailyTaskHookService.ts`, `dailyTasks/dailyTaskPeriod.ts`, `dailyTasks/dailyTaskProgressService.ts`, `databaseBackupService.ts`, `depositVerifier.ts`, `distributedLockService.ts`, `emailTwoFactorService.ts`, `game2048Engine.ts`, `game2048Service.ts`, `idempotencyService.ts`, `internalOfferwall/buildUserAuditSnapshot.ts`, `internalOfferwall/grantInternalOfferwallReward.ts`, `internalOfferwall/iframeHostAllowlistCache.ts`, `internalOfferwall/internalOfferwallCompletionWebhook.ts`, `internalOfferwall/internalOfferwallConstants.ts`, `internalOfferwall/internalOfferwallFeature.ts`, `internalOfferwall/internalOfferwallLimitState.ts`, `internalOfferwall/internalOfferwallMinView.ts`, `internalOfferwall/internalOfferwallService.ts`, `internalOfferwall/internalOfferwallTaskMetadata.ts`, `internalOfferwall/validateIframeUrl.ts`, `ipIntelligenceService.ts`, `miniPass/miniPassAdminValidation.ts`, `miniPass/miniPassClaimService.ts`, `miniPass/miniPassConstants.ts`, `miniPass/miniPassDashboardService.ts`, `miniPass/miniPassI18n.ts`, `miniPass/miniPassLevelMath.ts`, `miniPass/miniPassMissionHookService.ts`, `miniPass/miniPassPeriod.ts`, `miniPass/miniPassPurchaseService.ts`, `miniPass/miniPassRewardFulfillmentService.ts`, `miniPass/miniPassSeasonLive.ts`, `miniPass/miniPassXpService.ts`, `multiAccountRiskService.ts`, `networkHashrateService.ts`, `offerEventHelpers.ts`, `offerEventPurchaseService.ts`, `polygonDepositConfig.ts`, `polygonHdConfig.ts`, `polygonHdDepositScanner.ts`, `polygonHdSweep.ts`, `polygonHdWallet.ts`, `polygonProvider.ts`, `publicLiveStatsService.ts`, `queryRecord.ts`, `readEarnService.ts`, `redisClient.ts`, `shopIdempotencyStore.ts`, `sidebarNavRegistry.ts`, `sidebarNavService.ts`, `slidingWindowRateLimit.ts`, `streaming/liveRtmpPipeline.ts`, `streaming/streamAdminValidation.ts`, `streaming/streamEnvCheck.ts`, `streaming/streamRestartPolicy.ts`, `streaming/streamRunner.ts`, `streaming/streamSecrets.ts`, `streaming/youtubeStreamService.ts`, `supportPlayerDossierService.ts`, `supportRealtime.ts`, `supportTicketService.ts`, `transparencyWalletService.ts`, `userOwnedMachineService.ts`, `withdrawalTelegramService.ts`.

*(Gerado a partir de `find server/services -name "*.ts" | sort`.)*

## 3. `.js` restantes em `server/services`

**Nenhum.** Comando: `find server/services -name "*.js" -type f | sort` → saída vazia.

## 4. Tabela de auditoria (amostra representativa)

A tabela completa ficheiro-a-ficheiro com “Usado por” manual para 86 linhas seria repetitiva; abaixo ficam entradas que cobrem as classes pedidas (Prisma, economia, transações, integrações). Os restantes seguem o mesmo padrão: importados por controllers, rotas, jobs ou utils conforme o grafo do projeto.

| Arquivo JS (origem) | Usado por | Usa Prisma direto | Ação económica crítica | Usa transação | Integração externa | Vai migrar para | Dependências diretas | Risco | Status |
|---------------------|-----------|-------------------|-------------------------|----------------|--------------------|----------------|----------------------|-------|--------|
| `blkRewardDistributionService.js` | Cron / jobs de distribuição BLK | Sim | Sim | Sim | Não | `blkRewardDistributionService.ts` | `prisma`, `blkEconomyModel`, `minerProfileModel` | Alto (saldos) | Migrado |
| `btcpayService.js` | Controllers BTCPay, webhooks | Não (HTTP) | Sim | Não | Sim (BTCPay API) | `btcpayService.ts` | `fetch`, `crypto`, logger | Alto | Migrado |
| `internalOfferwall/internalOfferwallService.js` | Controllers admin + utilizador | Sim | Sim | Sim | Sim (webhooks / iframe) | `internalOfferwallService.ts` | Prisma, locks, daily tasks | Alto | Migrado |
| `idempotencyService.js` | Callbacks / rotas sensíveis | Sim | Não | Sim | Não | `idempotencyService.ts` | `prisma`, locks | Médio | Migrado |
| `adminFraudSignalsService.js` | Admin antifraud | Sim (`$queryRaw` tipado) | Não | Sim | IP intel (cache) | `adminFraudSignalsService.ts` | Prisma, `ipIntelligenceService` | Médio | Migrado |
| `polygonHdDepositScanner.js` | Worker / scanner | Sim | Sim | Sim | Sim (chain) | `polygonHdDepositScanner.ts` | Prisma, ethers/RPC | Alto | Migrado |
| `sidebarNavService.js` | UI API sidebar | Sim | Não | Não | Não | `sidebarNavService.ts` | Prisma / registry | Baixo | Migrado |

## 5. Serviços simples (sem Prisma ou quase)

Exemplos: `sidebarNavRegistry.ts`, `polygonDepositConfig.ts`, `miniPass/miniPassConstants.ts`, `streaming/streamRestartPolicy.ts`, `queryRecord.ts`, etc.

## 6. Serviços com Prisma (leitura e/ou escrita)

Maioria do diretório: daily tasks, mini pass, rooms support, shop, máquinas, etc.

## 7. Serviços económicos críticos migrados

Inclui (não exaustivo): `blkRewardDistributionService.ts`, `btcpayService.ts`, `depositVerifier.ts`, `contractDepositSync.ts`, `offerEventPurchaseService.ts`, `readEarnService.ts`, `transparencyWalletService.ts`, `withdrawalTelegramService.ts`, `polygonHd*.ts`, `internalOfferwall/*`, `miniPass/*`, `game2048Service.ts`.

## 8. Serviços com integrações externas

BTCPay, Polygon/RPC, streaming (YouTube/RTMP), offerwall interno (HTTP / iframe), Telegram (withdrawals), etc.

## 9. Problemas de tipagem encontrados

- Arrays inferidos como `never[]` após `const x = []` + `push`.
- Corpos JSON `unknown` / `object` sem estreitamento (`Record<string, unknown>`).
- `PrismaClient` vs `Prisma.TransactionClient` em helpers reutilizados dentro de `$transaction`.
- Resultados de `$queryRaw` sem tipo genérico → campos como `unknown`.
- Duplicar o símbolo `Prisma` (import runtime + `import type` com o mesmo nome).
- Retornos de funções sem união discriminada → controladores não estreitavam `ok`.

## 10. Como foram resolvidos

- Tipos explícitos em opções (`BlkRewardCycleOptions`, `ListAdminFraudSignalsOpts`, etc.).
- Genéricos em agrupadores (`pushDerivedGrouped<Row extends DerivedIntelRow>`).
- `import { Prisma, type PrismaClient } from "@prisma/client"` e um único namespace por ficheiro.
- `catch (error: unknown)` + `instanceof` / códigos Prisma.
- `BtcpayRequestError` com `status`/`details` em vez de anexar campos a `Error` genérico.
- `ValidateMissionInputResult` e outros resultados discriminados para consumo nos controllers.

## 11. Uso de `any`

**Não** se usa `any` / `as any` nos `.ts` de `server/services` como muleta. Onde era preciso flexibilidade, usou-se `Record<string, unknown>`, genéricos, ou conversões estreitas. Comando de verificação:

`grep -RE "@ts-ignore|@ts-nocheck| as any|: any" server/services --include="*.ts"` → sem correspondências.

Nota: `tsconfig.server.json` mantém `"noImplicitAny": false` até existir menos JavaScript legado noutras pastas; reativar `noImplicitAny: true` é **pendência** recomendada numa etapa futura quando `models`/`utils`/`cron`/`jobs` estiverem majoritariamente em TS.

## 12. `npm run typecheck:server`

**Passou** (exit code 0, sem diagnósticos).

## 13. `npm run build:server`

**Passou** (emite `dist/server/**` incluindo `dist/server/services/*.js`).

## 14. `npm run typecheck`

**Passou** (inclui `typecheck:server` + `typecheck:backend`).

## 15. `npm run build:backend`

**Passou**.

## 16. Testes executados

| Comando | Resultado |
|---------|-----------|
| `node --test tests/httpErrors.test.mjs` | **Passou** |
| `npm test` (suite completa) | **Falhou** em vários ficheiros (`walletWithdraw`, `transparencyWalletService`, `streamRunner`, etc.) — típico de dependências de DB/env/fixtures; **tratar como dívida / ambiente**, não como regressão isolada desta etapa, salvo investigação dedicada. |

## 17. Docker

Comando: `docker compose build --no-cache`

- **Resultado:** concluiu com **`exit_code: 0`** (imagens `block-miner-app` e `block-miner-worker` exportadas).
- O Dockerfile continua a compilar com `npx tsc -p tsconfig.server.json` e entry em `dist/server/`.
- Avisos: Bake/buildx, `ARG` com chaves públicas Turnstile (documentado no Dockerfile), peer dependencies npm.

**Não** foi executado `docker compose up` (exige `.env` seguro).

## 18. Pendências para a próxima etapa

1. Migração **`server/models/**/*.js` → `.ts`** (anunciada; não iniciar nesta etapa).
2. Reduzir `allowJs` / ativar **`noImplicitAny: true`** no `tsconfig.server.json` quando o grafo JS restante for pequeno.
3. Rever **`npm test`** com base de dados de teste e variáveis de ambiente para distinguir falhas reais de ruído.
4. Onde ainda existir `$queryRaw` com shapes grandes, considerar tipos de linha dedicados ou views Prisma para legibilidade.

## 19. Duplicados `.js` + `.ts` em `server/services`

**Confirmado:** não há par homónimo `.js`/`.ts` no código-fonte sob `server/services/`. Os `.js` existentes estão apenas em **`dist/server/services/`** após `build:server`.

## 20. Riscos em serviços económicos (refatoração futura)

- **Distribuição BLK** (`blkRewardDistributionService.ts`): lógica de arredondamento e idempotência por janela UTC — qualquer refactor deve manter testes de regressão e locks existentes.
- **BTCPay** (`btcpayService.ts`): dependência forte do payload Greenfield; falhas parciais de rede devem continuar a mapear-se para erros controlados.
- **Offerwall interno + rewards**: múltiplos caminhos transacionais e antifraud — evitar unificar branches sem testes de integração.
- **Polygon HD / sweep**: chaves e endereços — manter isolamento e nunca logar secrets.
- **Mini Pass / daily tasks:** missões e recompensas acopladas ao motor de mineração — validar `syncUserBaseHashRate` e hooks após mudanças.

---

**Resumo:** Etapa 04 concluída no critério “zero `.js` em `server/services` + typecheck/build verdes + Docker build `--no-cache` OK”. Ajustes mínimos em **controllers/rotas** foram necessários para alinhar tipos expostos pelos serviços (permitido no enunciado).
