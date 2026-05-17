# BlockMiner — Monolith modular: Wallet module (Step 02)

This document records the Wallet modularization pass: backend `server/modules/wallet/`, frontend `client/src/pages/wallet/`, preserved HTTP routes, economic safeguards, tests, and validation runs.

---

## 1. Diagnóstico inicial (estado da Wallet)

**Backend**

- Rotas HTTP da carteira vivem em `server/modules/wallet/wallet.routes.ts`, montadas como antes sob o prefixo de API existente; `server/routes/wallet.ts` reexporta o router para compatibilidade.
- Handlers principais em `wallet.controller.ts` (saldo, transações, depósitos, BTCPay, gas estimate, endereço HD, saque). Regras de saque sensíveis continuam em `server/models/walletModel.ts` dentro de `prisma.$transaction` (reserva de saldo, pendência, criação de `transaction`).
- `wallet.service.ts` expõe `submitWithdrawalRequest` como fachada fina para o model (sem duplicar economia no service).
- Validação Zod em `wallet.schemas.ts` (`withdrawRequestSchema`, etc.); o controller também valida o corpo antes de chamar o Prisma para que testes unitários que chamam o controller diretamente (sem middleware Express) não disparem I/O com credenciais inválidas.
- `wallet.dto.ts` define `toWalletWithdrawalPublicDto` para a resposta de saque (sem vazar campos internos como assinaturas ou blobs).
- `wallet.repository.ts` concentra leituras Prisma relacionadas a depósitos onde aplicável.
- Rate limit: `walletLimiter` / `walletReadLimiter` (e limiters BLK) permanecem em `wallet.routes.ts` com `requireAuth` nas rotas sensíveis.

**Frontend**

- Página: `client/src/pages/wallet/WalletPage.tsx` (mesmo layout; sem redesign).
- Chamadas HTTP centralizadas em `client/src/pages/wallet/wallet.api.ts` (axios `api` de `store/auth`, `credentials` herdadas do cliente).
- Tipos compartilhados da página: `wallet.types.ts`; validação de endereço POL e mínimo de saque: `wallet.validation.ts`.
- `wallet.hooks.ts` expõe `useAsyncActionGuard` (utilitário opcional); a página continua usando `isActionLoading` + `return` no submit de saque e ações pesadas para evitar double submit.
- Saldo e histórico vêm exclusivamente das respostas da API (`getBalance`, `getTransactions`); o frontend não envia saldo confiável no saque (apenas `amount` + `address`).

**Workers / webhooks**

- BTCPay: handlers importados de `server/controllers/btcpayDepositController.js` nas rotas do router de wallet (comportamento preservado).
- Verificação de depósitos / fila: imports existentes no controller (`depositVerifier`, `depositsCron`, `blockminerQueue`) inalterados em espírito.

---

## 2. Arquivos Wallet relevantes (antes / depois)

**Antes (conceito)**

- Rotas: `server/routes/wallet.ts` (implementação inline).
- Controller: `server/controllers/walletController.ts` (implementação).
- Testes Node: `tests/walletWithdraw.test.js`, `tests/walletDeposit.test.js`, `tests/walletValidation.test.js` (raiz de `tests/`).

**Depois**

- Módulo: `server/modules/wallet/*` + shim `server/routes/wallet.ts` + shim `server/controllers/walletController.ts`.
- Frontend pasta: `client/src/pages/wallet/*`.
- Testes Node: `tests/wallet/*.test.js` (mesmos nomes de arquivo, runner atualizado para subpastas).

---

## 3. Estrutura backend Wallet

Arquivos em `server/modules/wallet/`:

| Arquivo | Função |
|--------|--------|
| `index.ts` | Exporta `walletRouter` e constantes públicas (`WITHDRAW_MIN_POL`, etc.). |
| `wallet.routes.ts` | Registro de rotas, `requireAuth`, rate limits, `validateBody` onde aplicável. |
| `wallet.controller.ts` | HTTP, orquestração, validação de saque antes do model, DTO na resposta de withdraw. |
| `wallet.service.ts` | `submitWithdrawalRequest` → `walletModel.createWithdrawal`. |
| `wallet.repository.ts` | Queries Prisma de leitura (depósitos). |
| `wallet.schemas.ts` | Zod (saque, endereço, mining mode, estimate gas). |
| `wallet.dto.ts` | DTO público de transação de saque. |
| `wallet.types.ts` | Constantes e tipos compartilhados do módulo. |
| `wallet.security.ts` | Normalização / regex de endereço. |
| `wallet.errors.ts` | Erros/helpers do módulo (se existirem usos). |

---

## 4. Estrutura frontend Wallet

`client/src/pages/wallet/`:

- `WalletPage.tsx` — UI completa (sem subdividir em cards em arquivos separados para não alterar layout).
- `wallet.api.ts` — único lugar para paths `/wallet/...` e `/deposit-tickets` usados pela página.
- `wallet.types.ts` — respostas tipadas (`WalletBalanceResponse`, BTCPay, depósitos pendentes, etc.).
- `wallet.validation.ts` — endereço Polygon e mínimo de saque alinhados ao backend.
- `wallet.hooks.ts` — `useAsyncActionGuard` (disponível para refino futuro).
- `wallet.api.test.ts` — Vitest sobre URLs e contrato mínimo do client.
- `index.ts` — barrel exports.

---

## 5. Rotas preservadas

O conjunto de rotas registrado em `wallet.routes.ts` mantém os paths já usados pelo cliente (ex.: `GET /balance`, `GET /transactions`, `POST /withdraw`, depósitos, BTCPay, BLK, etc.) sob o mesmo prefixo de montagem da aplicação. O arquivo legado `server/routes/wallet.ts` permanece como reexport do módulo.

---

## 6. Endpoints Wallet (equivalência)

O frontend usa principalmente:

- `GET /wallet/pol-usd`, `GET /wallet/balance`, `GET /wallet/transactions`
- `GET /wallet/deposit/pending`, `GET /wallet/deposit/hd-address`
- `POST /wallet/deposit/estimate-gas`, `POST /wallet/deposit/submit`
- `POST /wallet/btcpay/invoice`, `GET /wallet/btcpay/invoice/:invoiceId`
- `POST /wallet/withdraw`
- `GET /deposit-tickets`, `POST /deposit-tickets`

(Paths relativos ao `baseURL` do axios que já inclui `/api`.)

---

## 7. Testes movidos ou criados

| Área | Arquivo |
|------|---------|
| Node (API / controller) | `tests/wallet/walletWithdraw.test.js`, `tests/wallet/walletDeposit.test.js`, `tests/wallet/walletValidation.test.js` |
| Runner | `scripts/run-node-tests.mjs` agora coleta recursivamente `tests/**/*.test.{js,mjs}` |
| Client | `client/src/pages/wallet/wallet.api.test.ts` |

**Ajuste de expectativa:** `walletWithdraw.test.js` agora compara o corpo `transaction` com o **DTO** público (`id`, `amount`, `status`, `type`, `userId`, `createdAt`, `txHash`), não com o objeto cru do model.

---

## 8. Arquivos que saíram da raiz `tests/`

- `walletWithdraw.test.js`, `walletDeposit.test.js`, `walletValidation.test.js` → `tests/wallet/`.

---

## 9. DTOs

- `WalletWithdrawalPublicDto` + `toWalletWithdrawalPublicDto` em `wallet.dto.ts` — resposta de `POST /withdraw` sem expor campos internos desnecessários.

---

## 10. Schemas

- `withdrawRequestSchema`, `updateWalletAddressSchema`, `miningPayoutModeSchema`, `postDepositEstimateGasSchema` em `wallet.schemas.ts`.
- O controller `requestWithdrawal` aplica `withdrawRequestSchema` após checagem explícita de campos ausentes, alinhando mensagens esperadas pelos testes e evitando hit ao DB com body inválido.

---

## 11. Correções saldo / saque / transações

- Saldo e movimentações continuam originados do backend (`walletModel` / Prisma).
- Resposta de saque tipada no client (`WalletWithdrawResponse` + `transaction` DTO).
- Tipagem no client para BTCPay / env vars / status (`?? null`, `typeof === 'string'`) eliminando `unknown` que quebrava o `tsc`.

---

## 12. Proteção double request

- **Frontend:** `if (isActionLoading) return` no handler de saque; botões em loading conforme estado existente.
- **Backend:** transação Prisma no model; regra de “já existe saque pendente”; rate limit no `POST /withdraw`.
- **Opcional:** `useAsyncActionGuard` disponível em `wallet.hooks.ts` para uso futuro sem mudar layout.

---

## 13. Rate limit / auth

Preservados em `wallet.routes.ts` (`requireAuth`, `walletLimiter`, `walletReadLimiter`, limiters BLK).

---

## 14. Loading / lentidão (Wallet)

- Sem redesign: mantidos estados `isLoading` / `isActionLoading` e fluxo existente.
- Evitadas chamadas duplicadas óbvias no submit via guard de loading.
- Tipagem mais estrita reduz retrabalho e erros em runtime na página.

---

## 15–16. Problemas de tipagem e resolução

- `AxiosResponse` com `data: unknown` em vários fluxos da Wallet → tipos explícitos em `wallet.types.ts` e genéricos em `wallet.api.ts`.
- `useState([])` inferindo `never[]` → `useState<string[]>([])`.
- `setWithdrawForm` com `walletAddress` possivelmente `null` → narrowing com `typeof === 'string'`.
- BTCPay poll / invoice create com campos opcionais → normalização com `?? null` e `typeof === 'string'` antes de `setState`.

---

## 17. Uso de `any`

Não foi introduzido `any` / `as any` / `Record<string, any>` nesta etapa da Wallet. O único “falso positivo” do grep em `server/` foi string humana em log (`any logged-in user`) em `server/middleware/admin.ts`.

---

## 18. `@ts-ignore` / `@ts-nocheck`

Não utilizados nos arquivos Wallet tocados; grep em `client/src` não encontrou ocorrências nos padrões solicitados.

---

## 19–26. Resultados dos comandos (executados neste ambiente)

| Comando | Resultado |
|---------|-----------|
| `cd client && npm run typecheck` | **Exit 0** |
| `cd client && npm run build` | **Exit 0** (avisos de chunk size / comentários PURE de dependências externas) |
| `cd client && npm test` | **Exit 0** — 41 arquivos, 257 testes |
| `npm test` (raiz) | **Exit 0** (inclui `pretest`: `build:server` + `build:backend`) |
| `npm run typecheck:server` | **Exit 0** |
| `npm run build:server` | **Exit 0** |
| `npm run build:backend` | **Exit 0** |
| `docker compose build --no-cache` | **Exit 0** — imagens `block-miner-app:latest` e `block-miner-worker:latest` construídas |

---

## 27. Teste manual Wallet (`docker compose up`)

**Não executado:** não foi validado nesta sessão um `.env` de produção/staging seguro nem fluxo login→carteira em browser. Recomenda-se repetir a checklist do enunciado quando houver ambiente e credenciais apropriadas.

---

## 28–29. Confirmação de fontes `.js`

- `find server -name "*.js" -not -path "*/node_modules/*" -not -path "*/dist/*"`: **nenhum arquivo listado** (amostra vazia no tree atual de fontes).
- `find client/src \( -name "*.js" -o -name "*.jsx" \)`: **nenhum arquivo** — `client/src` permanece TS/TSX.

---

## 30. Próximo módulo recomendado

Conforme roteiro do monólito modular: **`dashboard`** (depois `shop`, `machines`, `support`, etc.), um módulo por vez com backend + frontend + testes.

---

## Critério de aceite (checklist)

- [x] Wallet backend em `server/modules/wallet/` com rotas/controller/service/schemas/dto/repository.
- [x] Wallet frontend em `client/src/pages/wallet/` com API centralizada e tipos.
- [x] Rotas HTTP preservadas via router do módulo + shim de `server/routes/wallet.ts`.
- [x] DTO de saque sem vazar objeto completo do model.
- [x] Validação de saque no backend (Zod + guard antes do Prisma).
- [x] Saldo não depende do frontend para autoridade.
- [x] Submit de saque com guard de loading no frontend.
- [x] Typecheck/build/test + Docker build verdes neste ambiente.
- [x] Relatório `MONOLITH_WALLET_MODULE_STEP_01.md` criado.
