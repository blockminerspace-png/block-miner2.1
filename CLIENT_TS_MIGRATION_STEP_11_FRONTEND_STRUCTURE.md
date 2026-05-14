# BlockMiner — Step 11: migração TypeScript + estrutura do frontend (`client/`)

**Data do relatório:** 2026-05-13  
**Estado da etapa:** **parcialmente concluída** — build, typecheck do cliente, testes e Docker estão verdes; ainda existem **152 ficheiros `.js`/`.jsx`** em `client/src` (critério “zero JS no src” não cumprido).

---

## 1. Quantidade inicial e atual de `.js`/`.jsx` em `client/src`

| Métrica | Valor (nesta revisão) |
|--------|------------------------|
| `.js` e `.jsx` em `client/src` | **152** |
| `.ts` e `.tsx` em `client/src` | **64** |

Não foi preservado um snapshot git do “antes” desta sessão; o número acima reflete o estado **atual** do repositório após as alterações já integradas (reorganização `shared/`, correções de imports, `TurnstileField.tsx`, `sidebarItems.ts`, etc.).

---

## 2. Ficheiros migrados para `.ts`/`.tsx` (nesta continuação / estado recente)

Exemplos concretos de migração ou criação em TypeScript:

| Antes | Depois |
|-------|--------|
| `client/src/shared/components/auth/TurnstileField.jsx` | `client/src/shared/components/auth/TurnstileField.tsx` (props/ref + `window.turnstile` tipado) |
| `client/src/app/navigation/sidebarItems.js` | `client/src/app/navigation/sidebarItems.ts` (`SidebarItem`, `mobileBottomNavItems` tipado) |

Outros ficheiros `.ts`/`.tsx` já existentes no projeto (auth, dashboard, APIs por página, etc.) mantêm-se; a lista completa de TS pode ser obtida com:

```bash
find client/src -name "*.ts" -o -name "*.tsx" | sort
```

---

## 3. `.js`/`.jsx` restantes e justificativa

**152 ficheiros** permanecem em JavaScript. **Justificativa:** a migração completa de todas as páginas (admin, legal, jogos, testes associados, `App.jsx`, i18n, constantes, etc.) ainda não foi aplicada ficheiro a ficheiro. Não há exceção “técnica” invocada: é trabalho de migração em curso.

Lista completa (ordenada):

```bash
find client/src \( -name "*.js" -o -name "*.jsx" \) | sort
```

Amostra (primeiras entradas): `app/App.jsx`, `constants/*.js`, `games/*.js`, `i18n/*.js`, `pages/Admin*.jsx`, `pages/Faucet.jsx`, `shared/**/*.js`, etc.

---

## 4. Nova estrutura de páginas (objetivo vs real)

**Objetivo (especificação):** `client/src/pages/<pasta>/` com `*Page.tsx`, `*.api.ts`, `*.hooks.ts`, `components/`, `index.ts`.

**Real (hoje):**

- **Pastas por domínio já existentes:** `pages/dashboard/`, `pages/machines/`, `pages/stats/`, `pages/shop/`, `pages/offers/`, `pages/wallet/`, `pages/support/`, `pages/checkin/`, `pages/tasks/`, `pages/auth/`, `pages/internalOfferwall/`, `pages/adminDailyTasks/`.
- **Muitas rotas ainda em ficheiros soltos em `pages/`:** Admin (`Admin*.jsx`), utilitários (`Faucet`, `Settings`, `Ranking`, …), legal (`TermsOfUse`, `PrivacyPolicy`), jogos (`Game2048Page`, `Games`), etc.

Ou seja: a base modular para várias áreas já existe; falta **consolidar** as restantes telas em pastas próprias sem alterar rotas.

---

## 5. Caminho final de cada página principal (rotas preservadas)

As rotas continuam definidas no router em `client/src/app/App.jsx` (lazy imports para os mesmos paths). Exemplos de mapeamento conceptual (path → módulo principal):

| Rota / área | Ficheiro principal atual |
|-------------|---------------------------|
| `/dashboard` | `pages/dashboard/DashboardPage.tsx` (+ `dashboard.api.ts`, componentes em `dashboard/components/`) |
| `/inventory` | `pages/machines/MachinesPage.tsx` |
| `/power-stats` | `pages/stats/StatsPage.jsx` |
| `/shop` | `pages/shop/ShopPage.jsx` |
| `/offers` | `pages/offers/OffersPage.jsx` |
| `/wallet` | `pages/wallet/WalletPage.jsx` |
| `/support` | `pages/support/SupportPage.jsx` |
| `/checkin` | `pages/checkin/CheckinPage.tsx` |
| `/tasks` | `pages/tasks/TasksPage.tsx` |
| Login / registo | `pages/auth/LoginPage.tsx`, `RegisterPage.tsx`, `ForgotPasswordPage.jsx` |
| Demais | ficheiros em `pages/*.jsx` conforme `App.jsx` |

---

## 6. Componentes movidos por página

- **Dashboard:** `pages/dashboard/components/DashboardBanners.jsx` (específico da página).
- **Stats:** `pages/stats/components/PowerChartsPanel.jsx`.
- Componentes **globais** (sidebar, layout, modais genéricos) em `client/src/shared/components/`.

---

## 7. `shared/` — o que ficou e porquê

| Área | Conteúdo típico | Motivo |
|------|-----------------|--------|
| `shared/components/` | `Sidebar`, `BrandLogo`, `Web3Providers`, formulários reutilizáveis, etc. | Usado por múltiplas rotas / shell da app |
| `shared/hooks/` | `useWallet`, `useVault`, `useSupportTicketSocket`, … | Partilhado entre páginas |
| `shared/utils/` | `routePrefetch`, `csrfHeader`, `sidebarNavMap`, guards, etc. | Utilitários transversais |
| `shared/api/` | (genérico HTTP — ver secção 10) | Destino recomendado para cliente HTTP único |

Regra respeitada na intenção: **não** mover para `shared` componentes claramente específicos de uma única página (ex.: banners do dashboard ficam sob `pages/dashboard/`).

---

## 8. Rotas preservadas

Não foi alterado o contrato de paths do `react-router` em `App.jsx`: mesmos paths, mesmos `React.lazy` para os mesmos módulos (salvo correções de **imports** internos após mover pastas). **Nenhuma rota foi removida** nesta continuação.

---

## 9. Sidebar / navegação preservada

- **Fallback desktop:** `USER_DASHBOARD_NAV_FALLBACK` em `client/src/app/navigation/userDashboardNav.config.ts` (inalterado semanticamente).
- **Barra inferior mobile:** `mobileBottomNavItems` agora em `client/src/app/navigation/sidebarItems.ts`, com tipo `SidebarItem` (`'protected'` como chave de tipo por ser palavra reservada em TS; em runtime continua `protected: true/false`).
- **Consumidor:** `client/src/shared/components/Sidebar.tsx` importa de `../../app/navigation/sidebarItems` (fonte única para itens mobile + reexport do fallback).

Comportamento visual e destinos dos links: **sem redesign**; apenas tipagem e extensão do ficheiro de navegação mobile.

---

## 10. API clients criados / organizados

Já existem por página (exemplos): `dashboard.api.ts`, `stats.api.ts`, `machines.api.ts`, `shop.api.ts`, `offers.api.ts`, `wallet.api.ts`, `support.api.ts`, `checkin.api.ts`, `tasks.api.ts`.

**Pendente (especificação Step 11):** consolidar chamadas HTTP num `client/src/shared/api/httpClient.ts` e reduzir `fetch`/axios dispersos nos componentes — **não implementado nesta entrega parcial**.

---

## 11. Problemas de tipagem encontrados

| Problema | Onde |
|----------|------|
| `TurnstileField` em `.jsx` sem `forwardRef` genérico → props não reconhecidas em `LoginPage`/`RegisterPage` | `shared/components/auth/TurnstileField` |
| Import errado para tipos de check-in após mover `utils` | `shared/utils/checkinHelpers.ts` → caminho para `types/checkin` |
| Reexport com sufixo `.ts` no import | `sidebarItems.ts` → `tsc` com `allowImportingTsExtensions` |

---

## 12. Como foram resolvidos

- **Turnstile:** substituição por `TurnstileField.tsx` com `forwardRef<TurnstileFieldHandle, TurnstileFieldProps>` e `declare global` mínimo para `window.turnstile`.
- **checkinHelpers:** import corrigido para `../../types/checkin`.
- **sidebarItems:** ficheiro `.ts` com reexport `from './userDashboardNav.config'` (sem sufixo `.ts` no path).

---

## 13. Uso de `any`

**Não** foi introduzido `any`, `as any`, `Record<string, any>` nem `@ts-ignore` / `@ts-nocheck` para contornar os erros acima.

---

## 14. Confirmação `@ts-ignore` / `@ts-nocheck`

```bash
grep -R "@ts-ignore\\|@ts-nocheck\\| as any\\|: any" client/src --include="*.ts" --include="*.tsx" || true
```

**Resultado:** sem correspondências nos ficheiros `.ts`/`.tsx` (comando executado nesta sessão).

---

## 15. Resultado de build / typecheck / testes

| Comando | Resultado |
|---------|-----------|
| `npm run typecheck` (raiz) | **OK** — apenas `typecheck:server` + `typecheck:backend` (o `package.json` raiz **não** inclui o cliente). |
| `npm run build` (raiz) | **Script inexistente** no `package.json` raiz — N/A. |
| `npm run build:server` | **OK** |
| `npm run build:backend` | **OK** |
| `npm test` (raiz) | **OK** (inclui correção do import em `tests/miniPassAdminForm.test.mjs` → `client/src/shared/utils/adminMiniPassForm.js`) |
| `cd client && npm run typecheck` | **OK** |
| `cd client && npm run build` | **OK** |
| `cd client && npm test` | **OK** (39 ficheiros, 244 testes) |
| `cd client && npm run lint` | **Falha** — dezenas de avisos/erros pré-existentes (hooks, `no-undef` em `vite.config.js`, etc.); **não** foi objetivo desta entrega limpar o ESLint global do cliente. |

---

## 16. Resultado do Docker

```bash
docker compose build --no-cache
```

**Resultado:** **OK** — imagens `app` e `worker` construídas com sucesso (log final: `Built`).

---

## 17. Confirmação: visual não redesenhado

Alterações limitadas a **estrutura de pastas**, **imports**, **tipagem** e **ficheiros de configuração** (`vite.config.js` includes de coverage, `package.json` do cliente). **Não** houve alteração intencional de classes Tailwind, layout da sidebar, ou composição visual das páginas.

---

## 18. Confirmação: nenhum `.js` fonte recriado em `server/`

```bash
find server -name "*.js" -type f \
  -not -path "server/node_modules/*" \
  -not -path "server/dist/*" | sort
```

**Resultado:** **0 ficheiros** (árvore `server/` compilada para `dist/` ou já em `.ts`).

---

## Auditoria inicial (formato pedido) — amostra representativa

A tabela completa para **todos** os ficheiros seria extensa (152+ entradas). Segue-se uma **amostra**; o inventário completo obtém-se com `find client/src -type f | sort`.

| Arquivo atual | Tipo | Tela relacionada | Vai para | Será .ts ou .tsx | É compartilhado | Risco | Status |
|---------------|------|-------------------|----------|------------------|-----------------|-------|--------|
| `app/App.jsx` | layout / rotas | — | `app/App.tsx` | `.tsx` | sim | médio | pendente |
| `app/navigation/sidebarItems.ts` | config nav | todas (shell) | mantido em `app/navigation/` | `.ts` | sim | baixo | **feito** |
| `shared/components/Sidebar.tsx` | layout | todas | `shared/components/` | `.tsx` | sim | baixo | OK |
| `shared/utils/routePrefetch.js` | util | prefetch | `shared/utils/routePrefetch.ts` | `.ts` | sim | médio | pendente |
| `pages/dashboard/DashboardPage.tsx` | page | Dashboard | `pages/dashboard/` | `.tsx` | não | baixo | OK |
| `pages/AdminDashboard.jsx` | page | Admin | `pages/admin/AdminDashboardPage.tsx` (futuro) | `.tsx` | não | médio | pendente |
| `pages/Faucet.jsx` | page | Faucet | `pages/faucet/` | `.tsx` | não | médio | pendente |
| `constants/machinePlacement.js` | config | máquinas | `constants/` ou `shared/types` | `.ts` | sim | baixo | pendente |

---

## Próximos passos recomendados (fora do âmbito “não executar” da spec)

1. Migrar `App.jsx` → `App.tsx` e atualizar `main.tsx`.
2. Converter em blocos: **Admin** (`pages/admin/...`), **legal**, **jogos**, **settings**, ficheiros `shared/**/*.js`.
3. Introduzir `shared/api/httpClient.ts` e ir movendo chamadas.
4. `allowJs: false` no `client/tsconfig.json` quando `find client/src -name "*.js"` for zero (ou só testes excluídos).
5. Alinhar `npm run typecheck` na raiz com o cliente **ou** documentar CI com dois passos explícitos.

---

## Critério de aceite (checklist)

| Critério | Estado |
|----------|--------|
| Cada página real numa pasta própria | **Parcial** |
| Componentes específicos dentro da pasta da página | **Parcial** |
| `shared` sem “lixão” | **Razoável** — revisão contínua recomendada |
| Frontend principal só TS | **Não** — 152 `.js`/`.jsx` |
| Rotas OK | **Sim** (build cliente OK) |
| Sidebar OK | **Sim** |
| Visual preservado | **Sim** (sem redesign propositado) |
| `npm run build` raiz | **N/A** (script ausente) |
| `npm run typecheck` raiz | **Sim** (server+backend) |
| `cd client && npm run typecheck` | **Sim** |
| `docker compose build --no-cache` | **Sim** |
| Sem `@ts-ignore` / `@ts-nocheck` / gambiarra `any` | **Sim** (nos `.ts`/`.tsx` verificados) |

---

*Fim do relatório Step 11 (estado intermédio).*
