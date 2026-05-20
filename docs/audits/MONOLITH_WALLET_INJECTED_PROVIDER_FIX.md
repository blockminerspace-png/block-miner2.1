# Wallet — detecção de carteira injetada (Rabby)

## 1. Causa real

- A detecção antiga em `walletProvider.ts` priorizava **MetaMask antes de Rabby** (`WALLET_RDNS_PRIORITY` e ordem em `ethereum.providers`).
- Exigia `eth_chainId` com sucesso antes de considerar a carteira “utilizável”; shims (ex. Bitwarden) podiam ser tentados primeiro e falhar, enquanto Rabby só aparecia via **EIP-6963** após ~300 ms.
- O listener EIP-6963 **ignorava anúncios sem `rdns`**, podendo descartar carteiras válidas.
- `useWallet` mostrava `injected_unusable` quando havia candidatos na lista mas nenhum passava no probe — mensagem errada com Rabby instalada.
- O depósito em `smart_contract` podia cair em WalletConnect se `getBrowserEthereumProvider()` sync não visse Rabby ainda.

## 2. Antes

- `collectInjectedProviderCandidates()` síncrono, MetaMask primeiro.
- `getVerifiedBrowserEthereumProvider()` = primeiro `eth_chainId` OK na ordem da lista.

## 3. Agora — EIP-6963

- `discoverEip6963Providers(500)` em `client/src/shared/wallet/injectedWallet.ts`.
- Aceita `info` com ou sem `rdns`; filtra gestores de passwords por rdns/heurística.
- `eip6963:requestProvider` + espera 500 ms.

## 4. `window.ethereum.providers`

- Cada provider vira entrada com `source: 'window.ethereum.providers'`.
- Labels: Rabby, MetaMask, Brave, etc. via flags `isRabby`, `isMetaMask`, …

## 5. `window.ethereum` direto

- Usado se não houver array `providers` e o objeto passar no filtro anti-password-manager.

## 6. Prioridade

```txt
Rabby (100) > MetaMask (90) > Brave (80) > Coinbase (70) > Trust (60) > outros (10)
```

`dedupeProviders` ordena por `rankInjectedProvider`.

## 7. Identificação Rabby

- `provider.isRabby === true`
- `name` / `rdns` contém `rabby` ou `io.rabby`

## 8. Conexão

- `connectInjectedWallet()` percorre lista ordenada; `eth_requestAccounts` + `eth_chainId`.
- `useWallet.connectInjectedAndVerify` usa este módulo (sem AppKit no fluxo `useBrowserExtension`).

## 9. Rejeição pelo utilizador

- Código `4001` → `wallet.web3_deposit.connection_cancelled`.

## 10. WalletConnect / Reown

- Fluxo **Depósito via contrato inteligente** e botão “Conectar carteira” (extensão): **só injected**.
- WalletConnect permanece apenas no separador “WalletConnect” (opcional).

## 11. Testes

- `client/src/shared/wallet/injectedWallet.test.ts`
- `client/src/pages/wallet/WalletPage.test.tsx`

## 12. Comandos

Executar localmente: `tsc` client + `vite build` + testes node/vitest.

## 13. Teste manual Rabby

1. Rabby instalada → `/wallet` → “Rabby detectada. Clica em conectar.”
2. Conectar → popup Rabby → endereço na UI.
3. Depósito contrato → tx na Rabby.

## 14–15. Sem `.js` fonte

Inalterado: `server/` e `client/src` só `.ts`/`.tsx`.
