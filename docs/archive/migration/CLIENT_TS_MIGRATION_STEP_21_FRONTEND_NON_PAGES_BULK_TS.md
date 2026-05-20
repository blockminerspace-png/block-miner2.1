# Client TS migration — Step 21: Frontend outside `pages/` bulk TypeScript

## 1. Quantidade inicial (`client/src`)

Antes da migração, o comando abaixo listava **73** ficheiros `.js` / `.jsx` sob `client/src`:

```bash
find client/src \( -name "*.js" -o -name "*.jsx" \) -type f | sort
```

## 2. Lista completa migrada para `.ts` / `.tsx`

Todos os itens abaixo foram renomeados (`.js`→`.ts`, `.jsx`→`.tsx`) e tipados para `strict: true`.

### Constants

- `client/src/constants/machinePlacement.ts` (+ `machinePlacement.test.ts`)

### Games

- `client/src/games/cryptoGameIcons.ts` (+ `.test.ts`)
- `client/src/games/game2048BoardUtils.ts` (+ `.test.ts`)
- `client/src/games/minerGamesLayout.ts` (+ `.test.ts`)
- `client/src/games/minerGamesSocketMessages.ts` (+ `.test.ts`)

### i18n / legal

- `client/src/i18n/config.ts`
- `client/src/i18n/language.ts`
- `client/src/i18n/localesBundle.test.ts`
- `client/src/legal/legalSectionIds.ts`

### Store

- `client/src/store/auth.ts` (+ `auth.test.ts`)

### Web3

- `client/src/web3/appKitConfig.ts`
- `client/src/web3/blockMinerDepositAbi.ts`

### Shared — components

- `client/src/shared/components/AdBanner.tsx`
- `client/src/shared/components/AdBlockDetector.tsx`
- `client/src/shared/components/auth/SocialLoginButtons.tsx`
- `client/src/shared/components/autoMining/AutoMiningCycleTimer.tsx`
- `client/src/shared/components/autoMining/AutoMiningModeSelector.tsx`
- `client/src/shared/components/autoMining/TurboPartnerBanner.tsx` (+ `.test.tsx`)
- `client/src/shared/components/BrandLogo.tsx`
- `client/src/shared/components/BroadcastPopup.tsx`
- `client/src/shared/components/ChatSidebar.tsx`
- `client/src/shared/components/CommunityShortcuts.tsx`
- `client/src/shared/components/ErrorBoundary.tsx`
- `client/src/shared/components/Header.tsx`
- `client/src/shared/components/ImageUploader.tsx`
- `client/src/shared/components/inventory/RackMachineTooltipPortal.tsx`
- `client/src/shared/components/LegalDocumentPage.tsx`
- `client/src/shared/components/MachineCard.test.tsx`
- `client/src/shared/components/MachineQuantityModal.tsx`
- `client/src/shared/components/SidebarPathGate.tsx`
- `client/src/shared/components/SiteFooter.tsx`
- `client/src/shared/components/SupportAttachmentThumbnails.tsx` (+ `.test.tsx`)
- `client/src/shared/components/TransparencyErrorBoundary.tsx`
- `client/src/shared/components/Web3Providers.tsx`

### Shared — hooks

- `client/src/shared/hooks/useAnalytics.ts`
- `client/src/shared/hooks/useLandingScrollDepth.ts`
- `client/src/shared/hooks/useMultiTabDetector.ts`
- `client/src/shared/hooks/useSeoMeta.ts`
- `client/src/shared/hooks/useSupportTicketSocket.ts`
- `client/src/shared/hooks/useVault.test.ts`
- `client/src/shared/hooks/useWallet.ts`

### Shared — utils

- `client/src/shared/utils/calculatorEngine.ts` (+ `.test.ts`)
- `client/src/shared/utils/csrfHeader.ts` (+ `.test.ts`)
- `client/src/shared/utils/depositChannel.ts` (+ `.test.ts`)
- `client/src/shared/utils/eip1193ProviderEvents.ts` (+ `.test.ts`)
- `client/src/shared/utils/inventoryRackUtils.ts` (+ `.test.ts`)
- `client/src/shared/utils/inventoryStackKey.ts` (+ `.test.ts`)
- `client/src/shared/utils/landingAnalytics.ts` (+ `.test.ts`)
- `client/src/shared/utils/machine.ts`
- `client/src/shared/utils/registerAllowedEmailDomains.ts`
- `client/src/shared/utils/routePrefetch.ts`
- `client/src/shared/utils/security.ts`
- `client/src/shared/utils/sidebarNavMap.test.tsx`
- `client/src/shared/utils/sidebarPathMatch.ts` (+ `.test.ts`)
- `client/src/shared/utils/walletConnect.ts`
- `client/src/shared/utils/walletProvider.ts`
- `client/src/shared/utils/walletSessionPreference.ts` (+ `.test.ts`)

### Test harness

- `client/src/test-setup.ts`

## 3. `.js` / `.jsx` restantes em `client/src`

**Nenhum.** O `find` final retorna saída vazia.

## 4. Outros ficheiros alterados (fora de `client/src` apenas onde necessário)

| Ficheiro | Motivo |
|----------|--------|
| `client/package.json` | Script `test:coverage:auth` — paths `.ts` |
| `client/vite.config.js` | `coverageGateIncludes` — paths `.ts` |
| `scripts/run-node-tests.mjs` | `node --experimental-strip-types` para importar módulos `.ts` do cliente nos testes Node |
| `tests/machinePlacementMapping.test.mjs` | Import `machinePlacement.ts` |
| `tests/i18nLanguage.test.mjs` | Import `language.ts` |
| `.deploy/blockminer-test-package/tests/machinePlacementMapping.test.mjs` | Alinhado ao import `.ts` |
| `server/utils/machineInstanceState.ts` | Comentário: referência ao ficheiro cliente `machinePlacement.ts` |

Imports relativos em `client/src/**/*.ts(x)` foram normalizados para **sem extensão** `.js`/`.jsx` (script + revisão manual onde aplicável).

## 5. Áreas migradas

components (shared), hooks, utils, games, i18n, legal, store, web3, test-setup.

## 6–11. Tipos, hooks, providers, shared, utils, games

- **Tipos:** interfaces para props de componentes, estado de hooks, payloads de socket/API onde o compilador exigia; `unknown` + narrowing em erros.
- **Hooks:** `useWallet`, `useAnalytics`, `useSeoMeta`, `useSupportTicketSocket`, etc., com retornos e callbacks tipados.
- **Providers:** `Web3Providers.tsx` + `appKitConfig.ts` com tipos compatíveis Reown/wagmi (sem `any`).
- **Shared UI:** Chat, Header, modais, auto-mining, anexos suporte, etc.
- **Utils:** CSRF, wallet EIP-1193, inventário, calculator engine, route prefetch, segurança.
- **Games:** layouts, ícones, mensagens socket — tipagem estrita nos módulos e testes.

## 12. Imports `.jsx` / `.js` corrigidos

- `main.tsx`, `App.tsx`, páginas (`AutoMining`, `MachinesPage`, `WalletPage`, `Games`, `CheckinPage`, auth), `Sidebar.tsx`, `store/auth.ts`, `i18n/config.ts`, testes — extensões locais removidas.
- `grep` de `from '…\.jsx'` / `from "…\.js"` em imports internos do cliente: **sem resultados**.

## 13–14. Problemas de tipagem e resolução

- Centenas de erros após renomeação (`useState(null)`, `catch (e)`, axios sem generic, Recharts, wagmi): resolvidos com tipos explícitos, generics, type guards e ajustes pontuais (sem `@ts-ignore`).
- **Testes Node** que importavam `client/src/.../*.js`: Node não resolve `.ts` por defeito — adicionado `--experimental-strip-types` em `scripts/run-node-tests.mjs` e extensão `.ts` nos imports dos dois testes afetados.

## 15. Uso de `any`

Não introduzido como tipo ou `as any` para contornar o compilador.

## 16. `@ts-ignore` / `@ts-nocheck`

Não utilizados (grep de validação em `client/src` para `@ts-ignore` / `@ts-nocheck` / ` as any` / `: any` — sem matches relevantes).

## 17–24. Validação (2026-05-14)

| # | Comando | Resultado |
|---|---------|-------------|
| 17 | `cd client && npm run typecheck` | **OK** (exit 0) |
| 18 | `cd client && npm run build` | **OK** (exit 0) |
| 19 | `cd client && npm test` | **OK** — 40 ficheiros, 254 testes |
| 20 | `npm test` (raiz) | **OK** — 465 testes, 0 falhas |
| 21 | `npm run typecheck:server` | **OK** |
| 22 | `npm run build:server` | **OK** |
| 23 | `npm run build:backend` | **OK** |
| 24 | `docker compose build --no-cache` | **OK** (exit 0) |

## 25. Visual

Sem alteração intencional de layout, copy ou rotas — apenas TypeScript e imports.

## 26. `server/` sem `.js` fonte

```bash
find server -name "*.js" -type f \
  -not -path "server/node_modules/*" \
  -not -path "server/dist/*" | sort
```

**Saída vazia** (confirmado após pipeline).

## 27. Lista final `.js` / `.jsx` em `client/src`

**Vazia.**

## 28. Próxima fatia recomendada (não executada aqui)

Conforme plano global, após `client/src` zerado:

- `client/vite.config.js` (manter JS se aceitável) e outros `.js` na raiz do pacote `client/`
- `scripts/**/*.js` na raiz do monorepo
- Pacotes `.deploy/**` espelhados
- Ajustar documentação legada (ex.: `generate-obsidian-vault.mjs` ainda menciona `App.jsx`)

---

## Critério de aceite Step 21

Cumprido: `find client/src \( -name "*.js" -o -name "*.jsx" \)` vazio; typecheck/build/test cliente; `npm test` raiz; servidor/backend; Docker; relatório criado; sem gambiarra `any` / `@ts-ignore` / `@ts-nocheck` nos critérios acima.
