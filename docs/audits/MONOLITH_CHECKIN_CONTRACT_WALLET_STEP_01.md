# Check-in: carteira injetada + contrato (sem WalletConnect)

## 1. Como o Check-in chamava WalletConnect antes

- `CheckinPage.tsx` importava `useWallet()` → `useWalletAppKitBridge` / Reown AppKit para `connect()`, `switchNetwork()`, `isConnected` e `account`.
- A rota `/checkin` estava dentro de `ProtectedLayoutWithWeb3` → carregava o chunk `Web3Providers` (Wagmi/AppKit) ao entrar no shell autenticado.
- O envio on-chain já usava `getBrowserEthereumProvider()` + `eth_sendTransaction` (transferência nativa POL para `checkinReceiver`).

## 2. O que foi removido

- `useWallet` / AppKit no módulo Check-in.
- Botões “Conectar carteira” / “Trocar rede” que abriam o fluxo AppKit.
- `/checkin` fora de `ProtectedLayoutWithWeb3` (rota só com `ProtectedLayout`).

## 3. Carteira injetada agora

- `client/src/pages/checkin/checkin.wallet.ts`: `hasInjectedWallet()`, `connectInjectedWallet()`, `switchOrAddExpectedChain()`, `ensureInjectedOnExpectedChain()`.
- Reutiliza `client/src/shared/utils/walletProvider.ts` (EIP-1193, EIP-6963, filtro de shims de password manager).

## 4. Contrato / endereço / chainId

| Variável | Onde |
|----------|------|
| `VITE_CHECKIN_CHAIN_ID` | Frontend (default `137`) |
| `VITE_CHECKIN_CONTRACT_ADDRESS` | Frontend — se definido, chama `checkIn()` payable no contrato |
| `CHECKIN_CHAIN_ID` | Backend (fallback `POLYGON_CHAIN_ID` / `137`) |
| `CHECKIN_CONTRACT_ADDRESS` | Backend — validação `tx.to` + selector `checkIn()` |
| `CHECKIN_RECEIVER` / `DEPOSIT_WALLET_ADDRESS` | Backend — modo treasury (transferência nativa) quando não há contrato |
| `CHECKIN_RPC_URL` | Não adicionado como nome novo; usa `AETHER_RPC_URL` / `POLYGON_RPC_URL` via `getCheckinRpcUrl()` |

Status API expõe `checkinContractAddress`, `checkinChainId`, `chainId`, `checkinReceiver`, `checkinAmountWei`.

## 5. Frontend → contrato

- `client/src/pages/checkin/checkin.contract.ts`: `sendCheckinTransaction(status)` — conecta wallet injetada, valida rede, envia tx (contrato ou treasury), devolve `{ txHash, walletAddress, chainId }`.
- `postCheckinWalletDaily({ txHash, walletAddress, chainId })` → `POST /api/checkin/wallet`.

## 6. Backend → validação txHash

- `server/modules/checkin/checkin.contract.ts`: `evaluateCheckinPayment()` — treasury (`evaluateCheckinTx`) ou contrato (`checkIn()` + valor mínimo + receipt).
- `confirmDailyCheckin`: auth, wallet ligada, `INVALID_CHAIN`, `INVALID_WALLET_ADDRESS`, `TX_ALREADY_USED`, avaliação on-chain, transação Prisma + lock.

## 7. Double check-in

- `@@unique([userId, checkinDate])` no Prisma.
- `txHash` único em `daily_checkins`.
- `findConflictingCheckinTxHash` antes de confirmar.
- Lock `checkin:${userId}` na transação.
- Frontend: `payKindRef` + `disabled={paying || isLoading}`.

## 8. Sem carteira

- `hasInjectedWallet()` → mensagem `checkin.no_wallet` (i18n existente).

## 9. Rede errada

- `ensureInjectedOnExpectedChain` tenta `wallet_switchEthereumChain` / `wallet_addEthereumChain` (Polygon).
- Erro `WRONG_NETWORK` → `checkin.wrong_network`.

## 10. Transação rejeitada

- Código EIP-1193 `4001` / `CheckinWalletError('USER_REJECTED')` → `checkin.rejected_wallet`.

## 11. Testes

- `client/src/pages/checkin/checkin.wallet.test.ts`
- `client/src/pages/checkin/checkin.contract.test.ts`
- `client/src/pages/checkin/CheckinPage.test.tsx` (auditoria de imports)
- `tests/checkin/checkinContractConfirm.test.mjs`
- `tests/checkin/checkinStatusRoutes.test.mjs` (chain id)

## 12. Resultado dos comandos (2026-05-19)

| Comando | Resultado |
|---------|-----------|
| `tsc -p tsconfig.server.json` | OK |
| `tsc --noEmit` (client) | OK |
| `vite build` (client) | OK |
| `node --test tests/checkin/*.mjs` | 6/6 pass |
| `vitest` (client checkin) | Requer `jsdom` no ambiente local (não instalado aqui); `CheckinPage.test.tsx` valida imports via leitura de ficheiro |

## 13. Teste manual

Pendente no browser do utilizador (login → `/checkin` → confirmar ausência de `api.web3modal.org` → pagamento com MetaMask/Rabby).

## 14. WalletConnect no Check-in

Auditoria esperada em `client/src/pages/checkin`: sem `WalletConnect|Reown|AppKit|Web3Providers|useWallet`.

## 15–16. Sem `.js` fonte

- `server/` fonte: apenas `.ts` (compilado para `dist/`).
- `client/src/`: apenas `.ts` / `.tsx`.

## Validação (executar no repo)

```bash
cd client && npm run typecheck && npm run build && npm test
cd .. && npm test && npm run typecheck:server && npm run build:server && npm run build:backend
docker compose build --no-cache app
```
