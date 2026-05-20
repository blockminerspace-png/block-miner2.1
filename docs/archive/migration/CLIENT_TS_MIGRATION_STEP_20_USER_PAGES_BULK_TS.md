# Client TS migration — Step 20: User pages bulk TypeScript

## 1. Quantidade inicial (fora de `admin`)

Antes da migração desta fatia, o comando abaixo listava **41** ficheiros `.js` / `.jsx` sob `client/src/pages`, excluindo `admin`:

```bash
find client/src/pages \
  -path "client/src/pages/admin" -prune -o \
  \( -name "*.js" -o -name "*.jsx" \) -type f -print | sort
```

Lista inicial (41):

| Ficheiro | Domínio | Tipo |
|----------|---------|------|
| `auth/ForgotPasswordPage.jsx` | auth | page |
| `AutoMining.jsx` / `.test.jsx` | tasks / mining | page + test |
| `Calculator.jsx` | games / tools | page |
| `dashboard/components/DashboardBanners.jsx` | dashboard | component |
| `DashboardCryptoStream.jsx` | dashboard | page |
| `Faucet.jsx` / `.test.jsx` | outro (faucet) | page + test |
| `Game2048Page.jsx` / `.test.jsx` | games | page + test |
| `Games.test.jsx` | games | test |
| `Landing.test.jsx` | outro | test |
| `LiveServer.jsx` | outro | page |
| `Manual.jsx` | outro | page |
| `MiniPass.jsx` | rewards | page |
| `offers/index.js`, `OffersPage.jsx` | offers | barrel + page |
| `PrivacyPolicy.jsx` / `.test.jsx` | outro (legal) | page + test |
| `PublicRoom.jsx` | outro | page |
| `Ranking.jsx` | stats | page |
| `ReadEarn.jsx` | rewards | page |
| `Roadmap.jsx` | outro | page |
| `Settings.jsx` | profile | page |
| `shop/index.js`, `ShopPage.jsx` | shop | barrel + page |
| `Shortlinks.jsx`, `ShortlinkStep.jsx` | outro | page |
| `stats/index.js`, `StatsPage.jsx`, `components/PowerChartsPanel.jsx` | stats | barrel + page + component |
| `support/index.js`, `SupportPage.jsx` | support | barrel + page |
| `tasks/TasksPage.test.jsx` | tasks | test |
| `TermsOfUse.jsx` / `.test.jsx` | outro (legal) | page + test |
| `Transparency.jsx` / `.test.jsx` | stats / transparency | page + test |
| `wallet/index.js`, `WalletPage.jsx` | wallet | barrel + page |
| `YouTubeWatch.jsx` | offers / games | page |

**Meta:** `find` acima retornar vazio fora de `admin` — **atingido** (2026-05-14).

## 2. Ficheiros migrados para `.ts` / `.tsx`

Renomeação direta `.jsx`→`.tsx` e `index.js`→`index.ts`, mantendo rotas e `lazy()` em `App.tsx` (sem alterar paths de rota).

- `client/src/pages/auth/ForgotPasswordPage.tsx`
- `client/src/pages/AutoMining.tsx`, `AutoMining.test.tsx`
- `client/src/pages/Calculator.tsx`
- `client/src/pages/dashboard/components/DashboardBanners.tsx`
- `client/src/pages/DashboardCryptoStream.tsx`
- `client/src/pages/Faucet.tsx`, `Faucet.test.tsx`
- `client/src/pages/Game2048Page.tsx`, `Game2048Page.test.tsx`
- `client/src/pages/Games.test.tsx`
- `client/src/pages/Landing.test.tsx`
- `client/src/pages/LiveServer.tsx`
- `client/src/pages/Manual.tsx`
- `client/src/pages/MiniPass.tsx`
- `client/src/pages/offers/index.ts`, `OffersPage.tsx`
- `client/src/pages/PrivacyPolicy.tsx`, `PrivacyPolicy.test.tsx`
- `client/src/pages/PublicRoom.tsx`
- `client/src/pages/Ranking.tsx`
- `client/src/pages/ReadEarn.tsx`
- `client/src/pages/Roadmap.tsx`
- `client/src/pages/Settings.tsx`
- `client/src/pages/shop/index.ts`, `ShopPage.tsx`
- `client/src/pages/Shortlinks.tsx`, `ShortlinkStep.tsx`
- `client/src/pages/stats/index.ts`, `StatsPage.tsx`, `stats/components/PowerChartsPanel.tsx`
- `client/src/pages/support/index.ts`, `SupportPage.tsx`
- `client/src/pages/tasks/TasksPage.test.tsx`
- `client/src/pages/TermsOfUse.tsx`, `TermsOfUse.test.tsx`
- `client/src/pages/Transparency.tsx`, `Transparency.test.tsx`
- `client/src/pages/wallet/index.ts`, `WalletPage.tsx`
- `client/src/pages/YouTubeWatch.tsx`

Barrels `index.ts` exportam default sem extensão: `export { default } from './ShopPage';` (idem wallet, offers, stats, support).

## 3. `.js` / `.jsx` restantes fora de `admin`

**Nenhum** sob `client/src/pages` (comando de auditoria final: saída vazia).

## 4. Outros ficheiros alterados (Step 20)

- `client/src/shared/utils/routePrefetch.js` — `import()` dinâmicos atualizados de `*.jsx` / `*.tsx` explícitos para **paths sem extensão**, alinhado a `App.tsx` e às novas extensões reais.

## 5. Domínios migrados

| Domínio | Situação |
|---------|----------|
| dashboard | `DashboardBanners.tsx`; `DashboardCryptoStream.tsx`; `DashboardPage` já era TS |
| wallet | `WalletPage.tsx` + `index.ts` |
| shop | `ShopPage.tsx` + `index.ts` |
| machines | páginas TS já existentes; sem `.jsx` novo neste lote |
| support | `SupportPage.tsx` + `index.ts` |
| checkin | já TS (`CheckinPage.tsx`, `checkin.api.ts`) |
| tasks | `TasksPage.tsx` já TS; teste `TasksPage.test.tsx` |
| rewards | `MiniPass.tsx`, `ReadEarn.tsx` |
| stats | `StatsPage.tsx`, `PowerChartsPanel.tsx`, `Ranking.tsx` |
| offers | `OffersPage.tsx` + `index.ts` |
| auth | `ForgotPasswordPage.tsx` (+ páginas auth já TS) |
| profile | `Settings.tsx` (perfil utilizador na raiz `pages/`) |
| games / ferramentas | `Calculator.tsx`, `Game2048Page.tsx`, `Games.test.tsx` |
| legal / info | `PrivacyPolicy`, `TermsOfUse` + testes |
| outros | `Faucet`, `Shortlinks`, `ShortlinkStep`, `LiveServer`, `Manual`, `PublicRoom`, `Roadmap`, `YouTubeWatch`, `Landing.test`, `Transparency`, `AutoMining` |

Páginas que já estavam organizadas em pasta de domínio **mantiveram** essa estrutura; ficheiros historicamente na raiz de `pages/` **permaneceram na raiz** para não alterar imports `lazy` nem rotas.

## 6. Tipos criados / ampliados

- Tipagem estrita nos ecrãs migrados (estado, props, respostas API, eventos) — o cliente compila com `strict: true`.
- `client/src/types/game2048Engine.d.ts` — módulo `@game2048/engine` (alias Vite) para `Game2048Page.tsx`.
- Ajustes pontuais em tooltips Recharts e testes (`Transparency.tsx` / `Transparency.test.tsx`) para conteúdos `unknown` + narrowing seguro.

## 7. API clients

Nenhum endpoint novo. Continuam a usar-se os `*.api.ts` já existentes por domínio (`wallet.api.ts`, `shop.api.ts`, `stats.api.ts`, `support.api.ts`, `offers.api.ts`, `dashboard.api.ts`, `tasks.api.ts`, `checkin/checkin.api.ts`, etc.).

## 8. Componentes movidos para pastas de domínio

Nenhuma movimentação física nesta fatia (apenas extensão e tipagem). `DashboardBanners` já vivia em `dashboard/components/`.

## 9. Componentes em `shared` (sem alteração de política)

Nada foi movido para `shared` nesta Step. Imports existentes para componentes `shared` (ex.: `AutoMining*.jsx`, `Web3Providers.jsx`) **mantêm-se** até migração futura desses ficheiros (fora do âmbito Step 20).

## 10–11. Problemas de tipagem e resolução

- Após renomear `.jsx`→`.tsx`, o `tsc` passou a aplicar `strict` ao código que antes era JS não verificado — corrigido com tipos explícitos, generics em `useState`/`api`, narrowing em `catch (unknown)` e declaração do alias `@game2048/engine`.
- Recharts: tipos de conteúdo de tooltip alinhados com `unknown` + shape interna legível.

## 12. Uso de `any`

**Não** foi introduzido `any`, `as any`, `: any` em `client/src/pages` para contornar o compilador. (Comentários com a palavra “any” ou `step="any"` em HTML não contam como tipo TypeScript.)

## 13. `@ts-ignore` / `@ts-nocheck`

**Não** utilizados em `client/src/pages` (grep de validação limpo).

## 14–21. Validação obrigatória (2026-05-14)

| # | Comando | Resultado |
|---|---------|-------------|
| 14 | `cd client && npm run typecheck` | **OK** (exit 0) |
| 15 | `cd client && npm run build` | **OK** (exit 0) |
| 16 | `cd client && npm test` | **OK** — 40 ficheiros, 254 testes |
| 17 | `npm test` (raiz) | **OK** — 465 testes, 0 falhas |
| 18 | `npm run typecheck:server` | **OK** (exit 0) |
| 19 | `npm run build:server` | **OK** (exit 0) |
| 20 | `npm run build:backend` | **OK** (exit 0) |
| 21 | `docker compose build --no-cache` | **OK** (exit 0) |

## 22. Visual / UX

Não houve alteração intencional de layout, copy, rotas HTTP ou regras de negócio — apenas extensões TypeScript, tipagem e imports de prefetch.

## 23. `server/` sem `.js` fonte

```bash
find server -name "*.js" -type f \
  -not -path "server/node_modules/*" \
  -not -path "server/dist/*" | sort
```

**Saída vazia** — confirmado.

## 24. Lista final `.js` / `.jsx` em `client/src/pages` fora de `admin`

**Vazia.**

## 25. Próxima fatia recomendada (não executada aqui)

Migrar o restante do frontend fora de `pages/`, na ordem sugerida no plano global:

- `client/src/components`
- `client/src/hooks`
- `client/src/utils`
- `client/src/games`
- `client/src/shared`
- `client/src/config`

Incluindo extensão `.jsx` ainda referenciada por páginas (ex.: `Web3Providers.jsx`, componentes `autoMining/*.jsx`, `MachineQuantityModal.jsx`) quando essa fatia for tratada.

## Auditoria final (grep)

- `.jsx` em `client/src/pages` + `client/src/app`: restam referências a **ficheiros reais ainda em JSX** em `shared` (ex. `Web3Providers.jsx`) e comentários históricos — não há páginas utilizador em `.jsx`.
- `@ts-ignore` / `@ts-nocheck` / ` as any` / `: any` em `client/src/pages`: **sem matches** no grep de validação.

## Critério de aceite Step 20

Concluído: `find` de `.js`/`.jsx` fora de `admin` vazio; typecheck/build/test cliente; testes raiz; builds servidor/backend; Docker; relatório presente; sem `any`/`@ts-ignore`/`@ts-nocheck` em páginas; sem `.js` fonte em `server/`.
