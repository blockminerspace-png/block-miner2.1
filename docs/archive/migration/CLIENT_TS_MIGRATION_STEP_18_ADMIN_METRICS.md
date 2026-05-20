# Client TS migration — Step 18: `AdminMetrics`

## Auditoria inicial (resumo)

Comandos executados:

- `find client/src/pages/admin -iname "*Metric*" -type f | sort` → `AdminMetrics.jsx` (antes), depois só `AdminMetrics.tsx`.
- `grep` em `client/src/pages/admin` por `AdminMetrics` / `Metric` → uso principal na própria página e strings relacionadas em `AdminDashboard.tsx`, testes do sidebar, etc.

### Tabela

| Campo | Valor |
| --- | --- |
| **Arquivo atual** | `client/src/pages/admin/AdminMetrics.jsx` (removido) |
| **Tipo** | page |
| **Vai migrar para** | `client/src/pages/admin/AdminMetrics.tsx` |
| **APIs usadas** | `GET /admin/server-metrics` (axios `baseURL` `/api` → `/api/admin/server-metrics`). |
| **Usa cards** | sim (4 cards: uptime, CPU, RAM, disco). |
| **Usa tabela/lista** | não (bloco “Informações do Sistema” com `InfoItem`, não tabela). |
| **Usa gráfico** | não (barras de progresso em CSS). |
| **Usa filtros/data** | não (apenas polling 30s + botão atualizar). |
| **Risco** | baixo — página pequena; tipos alinhados a `adminController.getServerMetrics`. |
| **Status** | concluída |

## 1. Estado inicial (`AdminMetrics.jsx`)

- Estado `metrics` opaco (`null` até sucesso), `isLoading`, `fetchMetrics` com `api.get('/admin/server-metrics')`.
- Helpers locais `formatBytes`, `formatUptime`; subcomponente `InfoItem` sem props tipadas.
- UI: cards + seção de informações; sem filtros de período.

## 2. Estado final (`AdminMetrics.tsx`)

- Mesmo layout, textos e fluxo; `useState<AdminServerMetricsSnapshot | null>`, resposta `api.get<AdminServerMetricsResponse>`.
- `formatBytes(bytes: unknown)` para alinhar ao uso com valores possivelmente nulos do disco.
- `InfoItem` com props tipadas (`AdminMetricsInfoItemProps`).

## 3. Arquivos alterados

- `client/src/pages/admin/AdminMetrics.tsx` — criado.
- `client/src/pages/admin/AdminMetrics.jsx` — removido.
- `client/src/pages/admin/admin.types.ts` — tipos de métricas do servidor.
- `client/src/app/App.tsx` — sem alteração (lazy import sem extensão).

## 4. Tipos criados ou ampliados (`admin.types.ts`)

- `AdminServerMetricsSnapshot`
- `AdminServerMetricsSuccessResponse`
- `AdminServerMetricsErrorResponse`
- `AdminServerMetricsResponse`

(Espelham o JSON montado em `server/controllers/adminController.ts` → `getServerMetrics`.)

## 5. APIs envolvidas

- **Sucesso:** `{ ok: true, metrics: { cpuUsagePercent, cpuCores, memory*, disk*, diskUnavailable, uptimeSeconds, platform, nodeVersion, processId } }`.
- **Erro HTTP 500:** `{ ok: false, message?: string }` (tratado via `catch` + toast, como antes).

## 6. Problemas de tipagem encontrados

- Corpo de resposta axios sem discriminação automática entre sucesso e erro.
- `formatBytes` recebia valores que podem ser `null` (disco).
- `InfoItem` sem tipagem de `label` / `value`.

## 7. Como foram resolvidos

- Genérico `AdminServerMetricsResponse` em `api.get` + branch `if (res.data.ok)`.
- Parâmetro `unknown` em `formatBytes` com checagens `Number.isFinite`.
- Tipo local para props de `InfoItem`.

## 8. Uso de `any`

- **Não** utilizado como tipo ou atalho.

## 9. `@ts-ignore` / `@ts-nocheck`

- **Não** utilizados.

## 10. `cd client && npm run typecheck`

**Exit code: 0** (`tsc --noEmit -p tsconfig.json`).

## 11. `cd client && npm run build`

**Exit code: 0** (`vite build`).

## 12. `cd client && npm test`

**Exit code: 0** — 40 arquivos de teste, 254 testes passando (Vitest).

## 13. `npm test` (raiz)

**Exit code: 0** — inclui `pretest` (`build:server` + `build:backend`) e `node scripts/run-node-tests.mjs`.

## 14. `npm run typecheck:server`

**Exit code: 0**.

## 15. `npm run build:server`

**Exit code: 0**.

## 16. `npm run build:backend`

**Exit code: 0**.

## 17. `docker compose build --no-cache`

**Exit code: 0** — `app  Built`, `worker  Built` (log em `terminals/555980.txt`).

## 18. Confirmação visual

- Nenhum redesign: mesma hierarquia, classes Tailwind e textos.

## 19. `server/` sem `.js` fonte recriado

`find server -name "*.js" -not -path "*/node_modules/*" -not -path "*/dist/*"` → **0** arquivos.

## 20. `.jsx` restantes em `client/src/pages/admin`

**18** arquivos `.jsx` (sem `.js` no nível da pasta):

- `AdminAnalytics.jsx`
- `AdminBackups.jsx`
- `AdminBanners.jsx`
- `AdminBroadcast.jsx`
- `AdminCheckinMilestones.jsx`
- `AdminCreators.jsx`
- `AdminDepositTickets.jsx`
- `AdminFinance.jsx`
- `AdminFraudSignals.jsx`
- `AdminInternalOfferwall.jsx`
- `AdminLogs.jsx`
- `AdminMiners.jsx`
- `AdminMiniPassSeason.jsx`
- `AdminReadEarn.jsx`
- `AdminStreaming.jsx`
- `AdminTransparency.jsx`
- `AdminUserSidebar.jsx`
- `AdminUsers.jsx`

## 21. Próxima fatia recomendada

- `AdminTransparency.jsx` ou `AdminInternalOfferwall.jsx` (evitar Users/Miners completos como próximo passo único).

## 22. Verificações pós-migração

- `grep -R "AdminMetrics.jsx" client/src` → **0** ocorrências.
- `grep -rE '@ts-ignore|@ts-nocheck| as any|: any' client/src/pages/admin --include='*.ts' --include='*.tsx'` → **sem matches** relevantes (nenhuma página admin em TS violou o critério nesta verificação).
