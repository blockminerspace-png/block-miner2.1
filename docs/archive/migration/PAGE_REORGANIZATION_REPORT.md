# Relatório de reorganização — BlockMiner 2.1 (frontend por página)

Data de referência: 2026-05-12.

## 1. Estrutura antiga (resumo)

- Páginas principais do utilizador e APIs/hooks estavam repartidos entre `client/src/pages/*.jsx|tsx`, `client/src/modules/...` (removido) e ficheiros em `client/src/components` / `client/src/api` conforme evolução anterior.
- Pré-fetch de rotas (`routePrefetch.js`) e alguns hooks ainda apontavam para `modules/...` após movimentações.

## 2. Estrutura nova (resumo)

- Pastas por domínio em `client/src/pages/<nome>/` com página, `*.api.*`, hooks/helpers quando específicos, `components/` quando aplicável, e `index` para lazy import.
- `client/src/app/navigation/sidebarItems.js` — ponto de entrada da navegação móvel (barra inferior) + reexport do fallback do menu lateral.
- `client/src/app/navigation/userDashboardNav.config.ts` — continua a definir `USER_DASHBOARD_NAV_FALLBACK` (categorias, paths, chaves i18n) usado pelo `Sidebar` quando a API `/sidebar/nav` não está disponível.

## 3. Páginas organizadas em pasta própria

| Área | Pasta |
|------|--------|
| Dashboard | `client/src/pages/dashboard/` |
| Estatísticas / poder | `client/src/pages/stats/` |
| Máquinas (inventário) | `client/src/pages/machines/` |
| Loja | `client/src/pages/shop/` |
| Ofertas | `client/src/pages/offers/` |
| Carteira | `client/src/pages/wallet/` |
| Suporte | `client/src/pages/support/` |
| Check-in | `client/src/pages/checkin/` |
| Tarefas diárias | `client/src/pages/tasks/` |
| Auth (login, registo, recuperação) | `client/src/pages/auth/` |
| Offerwall interno (já co-localizado) | `client/src/pages/internalOfferwall/` |

## 4. Caminho final de cada página (entrada principal)

- Dashboard: `pages/dashboard/DashboardPage.tsx` (export via `pages/dashboard/index.ts`)
- Stats: `pages/stats/StatsPage.jsx` → rota `/power-stats`
- Máquinas: `pages/machines/MachinesPage.tsx` → rota `/inventory`
- Loja: `pages/shop/ShopPage.jsx`
- Ofertas: `pages/offers/OffersPage.jsx`
- Carteira: `pages/wallet/WalletPage.jsx`
- Suporte: `pages/support/SupportPage.jsx`
- Check-in: `pages/checkin/CheckinPage.tsx`
- Tarefas: `pages/tasks/TasksPage.tsx` → rota `/tasks`
- Login: `pages/auth/LoginPage.tsx`
- Registo: `pages/auth/RegisterPage.tsx`
- Esqueci palavra-passe: `pages/auth/ForgotPasswordPage.jsx`

## 5. Componentes movidos / co-localizados (por pasta)

- **dashboard:** `components/DashboardBanners.jsx`
- **stats:** `components/PowerChartsPanel.jsx` (lazy no `StatsPage`)
- **machines, shop, offers, wallet, support:** componentes específicos mantidos na pasta da página quando já existiam nessa migração; UI partilhada permanece em `client/src/components`.

## 6. APIs por página (`*.api.ts` / `.js`)

- `dashboard.api.ts`, `stats.api.ts`, `machines.api.ts`, `shop.api.ts`, `offers.api.ts`, `wallet.api.ts`, `support.api.ts`, `checkin.api.ts`, `tasks.api.ts`

## 7. Hooks / helpers por página

- **tasks:** `useDailyTasksDashboard.ts`, `dailyTasksCadence.ts`, `dailyTasksHelpers.ts`, `dailyTasksTypes.ts`
- **checkin:** lógica via `checkin.api.ts` e cliente existente conforme projeto

## 8. O que ficou em `shared` / raiz do client

- Não foi criada uma pasta `client/src/shared/` nesta fase: o projeto mantém `components/`, `store/`, `utils/`, `hooks/` na raiz de `src` para código **realmente** transversal (ex.: `http` via `store/auth`, `Sidebar`, `Header`, inputs genéricos).
- Critério: não mover ficheiros massivos só para renomear `shared` sem ganho funcional; evitar regressões.

## 9. Módulos backend (estado)

- O repositório continua a usar a árvore **`server/`** (Express, Prisma em `server/prisma/schema.prisma`), não `backend/src/modules/...` como no exemplo do pedido.
- **Não** foi feita nesta passagem a divisão completa em `routes/controller/service/repository/schemas/dto` por domínio — isso seria uma refatoração grande do servidor, fora do escopo desta continuação imediata de correção de imports e navegação.

## 10. Rotas backend

- Não alteradas nesta continuação (apenas validação Prisma).

## 11. Rotas frontend

- Preservadas: os paths em `App.jsx`, `routePrefetch.js` e `userDashboardNav.config.ts` mantêm os mesmos URLs (ex.: `/inventory` para máquinas).

## 12. Ficheiros duplicados removidos

- `client/src/modules/` removido após migração para `pages/`.
- `client/src/pages/auth/index.ts` removido (não usado pelo `App`).

## 13. Imports corrigidos (esta sessão)

- `client/src/utils/routePrefetch.js` — imports dinâmicos para `pages/...` em vez de `modules/...`.
- `client/src/hooks/useUserPowerStats.js` — `pages/stats/stats.api`.
- `client/src/pages/auth/*` — imports `../../` para `store`, `components`, `constants`, `utils`; `import()` do `Web3Providers` para `../../components/...`.
- Testes: `LoginPage.test.tsx`, `RegisterPage.test.tsx` em `pages/auth/`; `TasksPage.test.jsx` em `pages/tasks/`.
- `client/package.json` — script `test:coverage:auth` com novos caminhos.

## 14. Problemas encontrados

- Build falhou por `import("../components/Web3Providers.jsx")` nos auth pages após mudança de pasta (caminho relativo incorreto).
- `npm run lint` no client falha com **dezenas de erros pré-existentes** (react-hooks, no-undef em ficheiros públicos, etc.) — não introduzidos apenas por esta reorganização.

## 15. Problemas corrigidos

- Auth: caminhos estáticos e dinâmicos para `../../`.
- Prefetch e hook de stats alinhados com `pages/`.
- Testes e script de cobertura apontando para os novos caminhos.

## 16. Pendências reais

- Mover **todas** as restantes páginas soltas em `client/src/pages/*.jsx|tsx` (Faucet, Settings, MiniPass, Games, admin user, etc.) para pastas próprias, se o objetivo for 100% de cobertura.
- Pasta **`rewards`** dedicada: no menu, “Recompensas” é um **grupo** com vários filhos (`mini_pass`, `internal_offerwall`, etc.); não existe uma única rota “RewardsPage” isolada — definir produto se quiserem uma pasta `rewards/` agregadora.
- Refatoração **server** por módulos com DTO/repository por domínio (trabalho grande).
- Opcional: introduzir `client/src/shared/` e mover apenas ficheiros comprovadamente transversais, com atualização de imports em massa.

## 17. Resultado de build / lint / test / typecheck

| Comando | Resultado |
|---------|-----------|
| `npm run build` (client) | **OK** |
| `npm test` (client, Vitest) | **OK** — 39 ficheiros, 244 testes |
| `npm run lint` (client) | **Falha** — ~105 problemas (maioria legado; ver secção 14) |
| `npm run typecheck` (client) | **Script inexistente** no `package.json` do client |

## 18. Docker

- `docker compose -f docker-compose.yml config --quiet`: **OK** (sintaxe).
- `docker compose build --no-cache` / `up` **não executados** nesta sessão (evitar build longo sem necessidade imediata).

## 19. Secrets

- Nenhuma secret foi adicionada ou exposta nos ficheiros alterados nesta continuação.

## 20. Visual / layout

- Não houve redesign da sidebar, cores ou estrutura do dashboard; apenas fonte de dados da **barra inferior mobile** centralizada em `sidebarItems.js` + mapeamento de ícones no `Sidebar.tsx`.
