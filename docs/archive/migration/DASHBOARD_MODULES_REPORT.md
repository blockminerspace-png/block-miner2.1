# Relatório — Módulos por tela do dashboard (BlockMiner)

Data: 2026-05-12  
Repositório local: **BlockMiner 2.1** (equivalente ao fluxo `block-miner-v3`).

---

## 1. Telas que existiam antes

| Rótulo (menu) | Rota SPA | Componente |
|----------------|----------|--------------|
| Dashboard Central | `/dashboard` | `pages/Dashboard.tsx` |
| Estatísticas e Poder | `/power-stats` | `pages/PowerStatistics.jsx` |
| Minhas Máquinas | `/inventory` | `pages/Inventory.tsx` |
| Loja | `/shop` | `pages/Shop.jsx` |
| Ofertas | `/offers` | `pages/PopularOffers.jsx` |
| Carteira | `/wallet` | `pages/Wallet.jsx` |
| Suporte | `/support` | `pages/Support.jsx` |
| Check-in | `/checkin` | `pages/Checkin.tsx` |
| Tarefas | `/tasks` | `pages/DailyTasks.tsx` |
| Recompensas (grupo) | várias (`/faucet`, `/internal-offerwall`, …) | várias páginas |
| Sair da Conta | ação | `store/auth.js` → `POST /api/auth/logout` (evitar módulo `auth.api` que importasse `api` do mesmo store — risco de ciclo ESM) |

Menu lateral: fallback em `defaultPublicSidebarNav.json` + API `/api/sidebar/nav`.

---

## 2. Telas migradas para módulos (fronteira clara)

Cada tela principal do menu passou a ter, no **frontend**:

- `client/src/modules/<módulo>/<Nome>Page.*` — barrel que reexporta a página existente em `pages/` (sem duplicar UI).
- `client/src/modules/<módulo>/*.api.ts` — cliente HTTP agrupado (axios `api` com `baseURL: /api`).

**Rotas React** (`App.jsx`) passam a carregar os chunks via `modules/.../...Page` (URLs **inalteradas**).

**Navegação única:** `client/src/app/navigation/userDashboardNav.config.ts` exporta `USER_DASHBOARD_NAV_FALLBACK` (substitui o JSON removido) e `USER_DASHBOARD_SCREEN_MATRIX` (matriz viva).

---

## 3. Estrutura final do frontend (relevante)

```txt
client/src/
  app/
    navigation/
      userDashboardNav.config.ts   # fallback sidebar + matriz tela→API
  modules/
    dashboard/
      DashboardPage.tsx
      dashboard.api.ts
    stats/
      PowerStatisticsPage.jsx
      stats.api.ts
    machines/
      InventoryPage.tsx
      machines.api.ts
    shop/
      ShopPage.jsx
      shop.api.ts
    offers/
      PopularOffersPage.jsx
      offers.api.ts
    wallet/
      WalletPage.jsx
      wallet.api.ts
    support/
      SupportPage.jsx
      support.api.ts
    checkin/
      CheckinPage.tsx
      checkin.api.ts          # reexporta api/checkinClient
    tasks/
      DailyTasksPage.tsx
      tasks.api.ts
    rewards/
      rewards.api.ts          # metadados do grupo Recompensas
    auth/
      auth.api.ts             # POST /auth/logout (uso futuro consolidado)
  pages/                       # UI real mantida aqui
  utils/routePrefetch.js      # alinhado aos novos chunks
```

---

## 4. Estrutura final do backend (esta fase)

- `backend/src/app/registerHttpRoutes.js` — orquestra três montagens.
- `backend/src/app/mount/userApiRoutes.mount.js` — todas as rotas `/api/*` da app utilizador (ordem preservada).
- `backend/src/app/mount/adminApiRoutes.mount.js` — `/api/admin/*`.
- `backend/src/app/mount/publicSurfaceRoutes.mount.js` — live stats, public stats, health, banners, transparency.

**Nota honesta:** os handlers continuam em `server/routes/*.js` e `server/controllers/*`. **Não** foi feita nesta entrega a extração completa por tela de `controller/service/repository/schemas/dto` em TypeScript (seria um projeto maior, com risco de regressão nas ações económicas). A fronteira ganha aqui é **composição modular do registo HTTP** + **clientes API por tela no frontend**.

---

## 5. Mapa tela → rota frontend → endpoint backend → módulo

| Tela | Rota | Módulo FE | Prefixos / endpoints principais |
|------|------|-----------|-----------------------------------|
| Dashboard Central | `/dashboard` | `dashboard` | `/api/wallet/balance`, `/api/user/link-referral`, estado via socket/mining |
| Estatísticas e Poder | `/power-stats` | `stats` | `GET /api/stats/power` |
| Minhas Máquinas | `/inventory` | `machines` | `GET /api/rooms`, `GET /api/inventory`, POST rack/vault (existentes) |
| Loja | `/shop` | `shop` | `GET /api/shop/miners`, `POST /api/shop/purchase` |
| Ofertas | `/offers` | `offers` | `GET /api/offer-events/active`, `POST /api/offer-events/purchase` |
| Carteira | `/wallet` | `wallet` | `/api/wallet/*`, `/api/deposit-tickets` (página ainda usa `api` direto em parte; ver pendências) |
| Suporte | `/support` | `support` | `GET/POST /api/support/*` |
| Check-in | `/checkin` | `checkin` | `GET/POST /api/checkin/*` (via `checkinClient`) |
| Tarefas | `/tasks` | `tasks` | `GET /api/daily-tasks`, `POST /api/daily-tasks/:id/claim` |
| Recompensas | várias | `rewards` (+ páginas em `pages/`) | ver `REWARDS_SIDEBAR_PATHS` e routers `faucet`, `shortlink`, … |
| Sair | — | `auth` | `POST /api/auth/logout` |

---

## 6. Dados mockados substituídos por reais

Nenhum mock novo foi introduzido. **Não** foram encontradas telas principais do menu a usar dados inventados; o dashboard já sincronizava saldo com o backend.

---

## 7. Botões / rotas quebrados corrigidos

- **Build:** corrigidos `DailyTasks` e `Support` declarados em duplicado em `App.jsx` após a alteração dos `lazy` imports.

---

## 8. Proteções de segurança adicionadas

- Centralização de chamadas em módulos **não** altera regras de servidor; mantêm-se CSRF, cookies, `Idempotency-Key` no interceptor para rotas críticas, e validações existentes.
- Navegação fallback continua a passar por `parsePublicSidebarNavCategories` quando a resposta vem da API.

---

## 9. Ações económicas — transação / idempotência / double request

Sem alteração de lógica de negócio nesta PR: o interceptor em `store/auth.js` que injeta **Idempotency-Key** em POST sensíveis mantém-se. Próximo passo recomendado: auditar cada `POST` económico nos novos `*.api.ts` para garantir que todos passam pelo mesmo caminho.

---

## 10. DTOs criados

Nenhum DTO novo no backend nesta fase. No frontend, os `*.api.ts` tipam envelopes onde já havia tipagem local (ex.: `tasks` + `DailyTasksDashboardData`).

---

## 11. Validações adicionadas

Nenhuma regra Zod nova no servidor. A validação existente nas rotas `server/routes/*` permanece a fonte de verdade.

---

## 12. Arquivos movidos

- `client/src/data/defaultPublicSidebarNav.json` — **removido**; conteúdo migrado para `userDashboardNav.config.ts`.

---

## 13. Arquivos alterados (principais)

- `client/src/App.jsx`, `client/src/components/Sidebar.tsx`, `client/src/utils/routePrefetch.js`
- `client/src/pages/Dashboard.tsx`, `Shop.jsx`, `PopularOffers.jsx`, `Support.jsx`, `Inventory.tsx`, `dailyTasks/useDailyTasksDashboard.ts`
- `client/src/hooks/useUserPowerStats.js`
- `backend/src/app/registerHttpRoutes.js` (reescreto como delegador)
- Novos: `client/src/app/navigation/*`, `client/src/modules/**/*`, `backend/src/app/mount/*.js`

---

## 14. Migrations de base de dados

**Nenhuma.**

---

## 15. Build / typecheck / lint / test

| Comando | Resultado |
|---------|-----------|
| `npm run build --prefix client` | **OK** |
| `node -e "import('./backend/src/app/registerHttpRoutes.js')"` | **OK** |
| `npx eslint` (ficheiros tocados, `client/` e `backend/src/app/mount`) | **OK** |
| `npm test` (raiz, suite completa) | **Não reexecutada** nesta sessão após estas alterações; recomenda-se no CI |

---

## 16. Docker

Não foi alterado `Dockerfile` / `docker-compose.yml`. O `COPY . .` continua a incluir `client/src/modules` e `backend/src/app/mount`.

---

## 17. Pendências (decisão humana / fases seguintes)

1. **Backend por tela:** extrair de `server/routes/*.js` para `backend/src/modules/<nome>/{routes,controller,service,repository,schemas,dto}.js` sem mudar URLs.
2. **Carteira:** migrar `Wallet.jsx` para usar apenas `wallet.api.ts` (hoje o ficheiro `wallet.api.ts` existe mas a página ainda tem vários `api.get/post` diretos).
3. **Inventário:** alinhar todos os `POST` de racks/vault a `machines.api.ts`.
4. **Recompensas:** criar submódulos FE (`faucet`, `shortlinks`, …) com barrels + `*.api` se se quiser simetria total com a sidebar.
5. **Logout:** opcionalmente fazer `store/auth.js` importar `postAuthLogout` de `modules/auth/auth.api.ts` para uma única definição.
6. **Testes:** atualizar quaisquer testes que importassem `defaultPublicSidebarNav.json` (grep não encontrou usos além do Sidebar).

---

## Confirmação

- **Nenhuma secret** adicionada ao código.
- **Stack** (React/Vite, Express, Prisma, Docker) inalterada em espírito.
- **URLs públicas** das telas do menu **preservadas**.
