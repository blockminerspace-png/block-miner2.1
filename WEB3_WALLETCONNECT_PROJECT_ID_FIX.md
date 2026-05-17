# Web3 / WalletConnect project id — fix report

## 1. Causa real

Dois fatores empurravam Reown/WalletConnect para a rota pública `/login`:

1. **`client/src/pages/auth/login/LoginPage.tsx` e `register/RegisterPage.tsx`** faziam `void import("../../../shared/components/Web3Providers")` no mount para “aquecer” o chunk. Isso carregava `Web3Providers` → `appKitConfig.ts` no browser **na tela de login**, antes de qualquer área autenticada.

2. **`client/src/web3/appKitConfig.ts`** declarava `projectId` com fallback `00000000000000000000000000000000` e executava `new WagmiAdapter`, `createAppKit` e `ApiController.prefetch` **no escopo do módulo** ao importar o arquivo. Qualquer import de `Web3Providers`/`appKitConfig` disparava chamadas a `api.web3modal.org` e `pulse.walletconnect.org` com o id placeholder (403).

## 2. Onde o provider era montado

- **`client/src/app/App.tsx`**: `Web3Providers` continua **lazy** e envolve apenas **`ProtectedLayoutWithWeb3`** (rotas autenticadas). Rotas públicas (`/login`, `/register`, `/forgot-password`, etc.) **não** montam `Web3Providers` por si só.
- O problema na prática vinha do **prefetch explícito** nas páginas de auth (item 1) + **side effects no import** de `appKitConfig` (item 2).

## 3. Como foi impedida a inicialização em `/login`

- Removidos os `useEffect` que importavam `Web3Providers` em **Login** e **Register**.
- `createAppKit` / `WagmiAdapter` / prefetch de explorer só rodam dentro de **`ensureAppKitInitialized()`**, chamado de **`Web3Providers`** quando `isWalletConnectConfigured()` é verdadeiro (project id válido).
- Com id inválido ou ausente, `Web3Providers` usa **wagmi injetado apenas** (`getInjectedOnlyWagmiConfig`) e um **stub de contexto** (`WALLET_APP_KIT_STUB`) para que `useWallet` não precise chamar `useAppKit()` (que exige `createAppKit` prévio).

## 4. Como o Project ID é validado

- **`client/src/shared/web3/web3Config.ts`**: `getWalletConnectProjectId()` lê `VITE_WALLETCONNECT_PROJECT_ID`, depois `VITE_REOWN_PROJECT_ID`, depois `window.__BLOCKMINER_ENV__` (mesma ordem de fallback por variável).
- **`isValidWalletConnectProjectId`**: rejeita vazio, placeholders conhecidos (incluindo `00000000000000000000000000000000`) e exige **32 caracteres hex** (`/^[a-f0-9]{32}$/i`).
- **`isWalletConnectConfigured()`**: delega para `isValidWalletConnectProjectId(getWalletConnectProjectId())`.
- **`client/src/shared/utils/walletConnect.ts`**: reexporta os helpers de `web3Config` e mantém só `getWalletConnectMetadataUrl` + `resetWalletConnectSingletonForTests` (vazio, compatibilidade).

## 5. Comportamento sem Project ID válido

- Não se chama `createAppKit` nem se usa id placeholder.
- Não se agenda `ApiController.prefetch` do AppKit.
- Rotas protegidas ainda têm **Wagmi** (extensão injetada) para `useDisconnect` / `useSignMessage` e fluxos de carteira via browser wallet.
- `walletConnectConfigured` fica **false**: UI de WalletConnect continua desabilitada com mensagens existentes (ex. `wallet.web3_deposit.wc_missing_build`).

## 6. Comportamento com Project ID válido

- Na primeira montagem de `Web3Providers` com id válido: `ensureAppKitInitialized()` cria `WagmiAdapter`, chama `createAppKit`, importa dinamicamente `@reown/appkit-scaffold-ui/w3m-modal` e agenda prefetch de wallets.
- **`WalletAppKitBridgeInner`** expõe `open` / conta / rede / provider via contexto para `useWallet`.

## 7. Arquivos alterados / novos

| Arquivo | Alteração |
|---------|-----------|
| `client/src/shared/web3/web3Config.ts` | **Novo** — id + validação |
| `client/src/shared/web3/injectedOnlyWagmiConfig.ts` | **Novo** — wagmi só `injected` + Polygon |
| `client/src/shared/web3/walletAppKitBridge.tsx` | **Novo** — contexto + bridge com hooks Reown |
| `client/src/shared/web3/web3Config.test.ts` | **Novo** — testes de validação + ausência de `Web3Providers` em auth |
| `client/src/web3/appKitConfig.ts` | Init lazy; sem fallback `0000…`; modal AppKit via `import()` |
| `client/src/shared/components/Web3Providers.tsx` | Ramo id inválido (injected + stub) vs AppKit |
| `client/src/shared/components/Web3Providers.test.tsx` | **Novo** — smoke render |
| `client/src/shared/utils/walletConnect.ts` | Reexports + metadata URL |
| `client/src/shared/hooks/useWallet.ts` | Usa `useWalletAppKitBridge` em vez de hooks Reown diretos |
| `client/src/pages/auth/login/LoginPage.tsx` | Removido prefetch `Web3Providers` |
| `client/src/pages/auth/register/RegisterPage.tsx` | Removido prefetch `Web3Providers` |
| `client/.env.example` | Documentação `VITE_WALLETCONNECT_PROJECT_ID` / `VITE_REOWN_PROJECT_ID` |

Dockerfile / `docker-compose.yml` já expunham `VITE_WALLETCONNECT_PROJECT_ID`; nenhuma alteração obrigatória além do fluxo do client.

## 8. Testes criados / ajustados

- `client/src/shared/web3/web3Config.test.ts` — placeholders, hex válido, leitura de env, e que Login/Register **não** contêm `Web3Providers`.
- `client/src/shared/components/Web3Providers.test.tsx` — renderiza filhos sem erro.

## 9. Teste manual em `/login` (neste ambiente)

Não foi executado browser automatizado aqui. Checklist para validar localmente:

1. Abrir `/login`, DevTools → Network, recarregar.
2. Confirmar **ausência** de `api.web3modal.org` e `pulse.walletconnect.org`.
3. Login / registro / 2FA opcional continuam como antes.
4. Após login, `/wallet` com `VITE_WALLETCONNECT_PROJECT_ID` válido pode mostrar fluxo WalletConnect; com id inválido, sem chamadas remotas com placeholder.

## 10–17. Resultados de comandos (2026-05-15)

| Comando | Resultado |
|---------|-----------|
| `cd client && npm run typecheck` | **OK** (exit 0) |
| `cd client && npm run build` | **OK** (exit 0) |
| `cd client && npm test` | **OK** — 45 ficheiros, 278 testes |
| `npm test` (raiz) | **OK** (exit 0; inclui `pretest` build server/backend) |
| `npm run typecheck:server` | **OK** |
| `npm run build:server` | **OK** |
| `npm run build:backend` | **OK** |
| `docker compose build --no-cache` | **OK** — imagens `block-miner-app` e `block-miner-worker` construídas |

## 18. `server/` sem `.js` “solto” (fora `node_modules` / `dist`)

```bash
find server -name "*.js" -type f -not -path "server/node_modules/*" -not -path "server/dist/*" | sort
```

**Saída:** vazia (nenhum ficheiro listado).

## 19. `client/src` sem `.js` / `.jsx`

```bash
find client/src \( -name "*.js" -o -name "*.jsx" \) -type f | sort
```

**Saída:** vazia.

## 20. Segredos

- Não foi adicionado nenhum Project ID real ao repositório.
- `.env` não foi criado nem commitado.
- Apenas comentários vazios em `client/.env.example`.

---

## Auditoria `grep` (pós-correção)

### `00000000000000000000000000000000`

Aparece em: `web3Config.ts` (lista de placeholders), `web3Config.test.ts` (teste de invalidade), testes de depósito/endereços `0x000…` (não relacionados com WalletConnect project id).

### `api.web3modal.org` / `pulse.walletconnect.org` em `client/src`

**Nenhuma** ocorrência em `.ts` / `.tsx` (apenas bibliotecas em runtime).

### Mapa resumido (diagnóstico)

- **Web3Providers importado/montado:** `App.tsx` → lazy → só rotas com `ProtectedLayoutWithWeb3`.
- **Project id lido:** `web3Config.getWalletConnectProjectId()` (+ runtime `__BLOCKMINER_ENV__`).
- **Fallback `0000…` funcional:** removido de `appKitConfig`; mantido só como string rejeitada em `web3Config`.
- **AppKit em module scope:** removido; substituído por `ensureAppKitInitialized()`.
- **Rotas que precisam de Web3:** áreas autenticadas que usam `useWallet` (ex. `/wallet`, `/checkin`) dentro do layout com `Web3Providers`.
