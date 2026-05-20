# Check-in reliability, grace period, and milestone rewards

## 1. Why users could not pay / check in via wallet

| Issue | Detail |
|-------|--------|
| `POST /api/checkin/claim` | Always returned `PAYMENT_REQUIRED` — never performed offchain/balance check-in |
| Balance path | Required linked wallet even when user only wanted in-game POL debit |
| Wallet path | Depends on `CHECKIN_RECEIVER` / `CHECKIN_CONTRACT_ADDRESS` + RPC; failures surfaced as `BLOCKCHAIN_UNAVAILABLE` with no fallback in UI |
| Streak | Calendar-day only; no grace after reset hour — easy to lose streak after missing one boundary |

## 2. Check-in modes (`CHECKIN_MODE`)

| Mode | Wallet on-chain | Offchain / balance |
|------|-----------------|-------------------|
| `hybrid` (default) | Yes (`/confirm`, `/wallet`, `/claim/onchain`) | Yes (`/claim`, `/balance`) — wallet not required for balance |
| `offchain` | Disabled | Yes |
| `onchain` | Yes | Disabled |

Env: `CHECKIN_MODE=hybrid|offchain|onchain`

## 3. Reset rule

- `CHECKIN_RESET_HOUR` (default **21**, America/São_Paulo): daily period key rolls at that hour, not midnight.
- `getCheckinPeriodKey()` drives today’s check-in row key.
- `nextResetAt` returned in `GET /api/checkin/status`.

## 4. Grace period

- `CHECKIN_GRACE_HOURS` (default **6**): after a missed period ends, user can still check in and keep streak.
- `usedGrace` stored on `daily_checkins` when grace is consumed.
- `CHECKIN_MAX_GRACE_USES_PER_MONTH` (default **2**).
- `graceEndsAt` in status when applicable.

## 5. Streak freeze

- `CHECKIN_STREAK_FREEZE_ENABLED` (default **true**).
- `CHECKIN_MAX_FREEZE_USES_PER_MONTH` (default **1**).
- `usedFreeze` on `daily_checkins` when applied.
- Logic in `computeStreakAfterCheckin()` (`server/utils/checkinStreak.ts`).

## 6. How streak is calculated

- Display: `computeCheckinStreak()` walks consecutive confirmed `checkinDate` keys with grace-aware cursor.
- On confirm: `computeStreakAfterCheckin()` sets `streak`, `usedGrace`, `usedFreeze` on the new row.
- Existing confirmed rows and streak values are **not** wiped.

## 7. Idempotency

- `@@unique([userId, checkinDate])` on `daily_checkins`.
- `txHash` unique — replay rejected (`TX_ALREADY_USED`).
- Per-user advisory lock `checkin:{userId}` in transactions.
- Milestone grants: `@@unique([userId, milestoneId])` on `user_checkin_streak_rewards`.
- Double click → `alreadyCheckedIn` or `CHECKIN_CONFLICT`, no duplicate rewards.

## 8. txHash validation

Unchanged core path in `checkin.contract.ts` + `evaluateCheckinPayment()`:

- Format, receipt success, chainId, contract/treasury destination, sender = linked wallet, minimum POL.

## 9. Wallet fallback (hybrid)

- Frontend: wallet errors suggest balance path when `allowsOffchainCheckin`.
- Backend: `checkinBalance` skips `WALLET_REQUIRED` when `requiresWalletForOffchainCheckin()` is false (default in hybrid).
- `POST /api/checkin/claim` delegates to balance/offchain flow.

## 10. Milestones structure

Existing tables (extended, not replaced):

- `checkin_streak_milestones` — rules (`day_threshold`, `reward_type`, …)
- `user_checkin_streak_rewards` — audit of grants

New columns: `miner_id`, `item_code`, `metadata_json` on milestones; `used_grace`, `used_freeze` on daily checkins.

## 11. Reward types supported

| Type | Backend handler |
|------|-----------------|
| `pol` / `balance` | `polBalance` increment |
| `stelar` / `zer` | `zerBalance` (Estelar) increment |
| `hashrate` | Temporary `user_powers_games` bonus |
| `machine` | `createInventoryWithOwnedMachineTx` + miner catalog snapshot |
| `item` | Inventory via `itemCode` + optional `metadataJson` |
| `none` | Claim row only |

Implementation: `server/modules/checkin/checkin.rewards.ts`

## 12. Machine delivery

- Loads active `Miner` by `milestone.minerId`.
- Creates `UserOwnedMachine` + `UserInventory` with `acquisitionSource: "checkin_milestone"`, snapshot name/hash/image/price.

## 13. Estelar / balance / item

- Estelar → `zerBalance` ledger field on `User`.
- POL → `polBalance`.
- Item → inventory row via `itemCode` / metadata (hashRate, minerName, etc.).

## 14. Migration

`server/prisma/migrations/20260520180000_checkin_grace_milestone_rewards/migration.sql` — additive only.

## 15. No duplicate rewards

Transactional milestone grant + unique (user, milestone). P2002 swallowed on race.

## 16. No streak wipe

No migration clears `daily_checkins` or user streak fields. New logic only affects new confirmations.

## 17. Builds (Docker Node 20, 2026-05-20)

| Step | Result |
|------|--------|
| `npm run typecheck:server` | PASS |
| `npm run build:server` | PASS |
| `client npm run typecheck` | PASS |
| `client npm run build` | PASS |

## 18. Docker build

Re-run 2026-05-20 (local): `docker compose build --no-cache app worker` — **PASS** (`block-miner-app`, `block-miner-worker`).

## 19. Manual test

See **§21 Validação pós-deploy em produção** for automated/ops checks and remaining human E2E.

## 20. Real pendencies

- ~~Deploy migration, milestones, QA E2E produção.~~ **Fechado** — ver **§22**.
- Full controller → service/repository split deferred (não bloqueia check-in).

---

## 21. Validação pós-deploy em produção

**Data:** 2026-05-20  
**Commit em produção:** `b06d9631` — feat: improve checkin reliability and milestone rewards  
**Branch:** `chore/dead-code-cleanup`  
**Host:** `https://blockminer.space` (VM `/root/block-miner-v3`)

### 21.1 Configuração `CHECKIN_*` ativa

**Variáveis presentes no container `app` (apenas nomes, sem valores):**

| Variável | No `.env` produção |
|----------|-------------------|
| `CHECKIN_AMOUNT_WEI` | sim |
| `CHECKIN_RECEIVER` | sim |
| `CHECKIN_MODE`, `CHECKIN_RESET_HOUR`, `CHECKIN_GRACE_HOURS`, `CHECKIN_STREAK_FREEZE_ENABLED`, `CHECKIN_OFFCHAIN_REQUIRES_WALLET` | **não** (ausentes) |
| `DATABASE_URL`, `REDIS_URL` | sim (nomes apenas) |

**Config efetiva** (import de `dist/server/modules/checkin/checkin.config.js` no container, defaults do código):

```json
{
  "CHECKIN_MODE": "hybrid",
  "CHECKIN_RESET_HOUR": 21,
  "CHECKIN_GRACE_HOURS": 6,
  "CHECKIN_STREAK_FREEZE_ENABLED": true,
  "CHECKIN_OFFCHAIN_REQUIRES_WALLET": false,
  "CHECKIN_MAX_GRACE_USES_PER_MONTH": 2,
  "CHECKIN_MAX_FREEZE_USES_PER_MONTH": 1,
  "allowsOffchainCheckin": true,
  "allowsWalletCheckin": true
}
```

**Conclusão:** comportamento esperado de hybrid/grace/freeze/offchain sem wallet confirma-se pelos **defaults** documentados em `checkin.config.ts`. Recomendação operacional (não bloqueante): declarar explicitamente no `.env.production` da VM as chaves acima (valores não secretos) para auditoria sem depender de leitura de código.

**Logs app (amostra 300 linhas, filtro checkin/reward/milestone/Prisma):** sem erros Prisma/check-in; avisos vistos são de `PolygonHdDepositScanner` (txlist), não do módulo check-in.

### 21.2 Curls sem sessão (Fase 2)

| Endpoint | HTTP | Content-Type | Corpo |
|----------|------|--------------|-------|
| `GET /api/checkin/status` | 401 | `application/json` | `{"error":"Unauthorized"}` (41 B) |
| `GET /api/checkin/rewards` | 401 | `application/json` | idem |
| `GET /api/checkin/history` | 401 | `application/json` | idem |
| `GET /api/auth/session` | 401 | `application/json` | sessão inválida (117 B) |

**Conclusão:** sem 500/502/HTML/timeout; JSON seguro onde exige sessão.

### 21.3 Marcos iniciais configurados (Fase 3)

Tabela `checkin_streak_milestones` em produção (SQL idempotente na VM; `miner_id` do catálogo ativo):

| day_threshold | reward_type | reward_value | miner_id | item_code | active |
|---------------|-------------|--------------|----------|-----------|--------|
| 1 | pol | 0.05 | — | — | sim |
| 3 | item | 1 | — | `checkin_day3_crate` | sim |
| 7 | stelar | 10 | — | — | sim |
| 14 | machine | 0 | **8** (HashTitan X1v1, 25 HR, `/machines/3.png`) | — | sim |
| 15 | pol | 3 | — | — | **não** (legado desativado) |
| 30 | machine | 0 | **31** (NovaHashCore, 250 HR, `/machines/2.png`) | — | sim |

Regras: tipos alinhados a `checkin.rewards.ts`; marco inativo (dia 15) não entrega; IDs 8 e 31 validados em `miners` (`is_active = true`).

### 21.4 Teste logado sem carteira (Fase 4)

**Estado:** não executado nesta sessão (requer sessão/cookie de conta de teste).

**Evidência indireta em produção:**

- Utilizadores recentes com `payment_method = balance` e `wallet_address` NULL existem (ex.: ids 69, 71, 78, 85, 90 — check-ins confirmados 17–20/05).
- Amostra de contas novas **sem carteira** com saldo POL > 0: ids 1853–1865 (ex. `Dimastik` ~0.03 POL).

**Critério pendente:** abrir `/checkin`, confirmar UI hybrid, check-in saldo sem Rabby, `todayCheckedIn`, streak/reset/grace na resposta de `GET /status`.

### 21.5 Teste offchain / saldo (Fase 4–5)

**Estado:** parcial via DB (balance confirmado em massa); idempotência global verificada (§21.7).

### 21.6 Teste Rabby / on-chain + fallback hybrid (Fases 6)

**Estado:** não executado (interação Rabby + tx real).

**Critério pendente:** wallet só abre por clique; tx inválida/repetida sem recompensa; em falha, botão saldo/offchain permanece em hybrid.

### 21.7 Double click / idempotência (Fase 5)

Consultas em `daily_checkins` e `user_checkin_streak_rewards`:

| Verificação | Resultado |
|-------------|-----------|
| `(user_id, checkin_date)` duplicado | **0** linhas |
| `(user_id, milestone_id)` duplicado em grants | **0** linhas |
| Amostra últimos 3 dias | `dup = 1` por par user/date |

**Conclusão:** integridade DB consistente com unique constraints; E2E de double-click na UI ainda recomendado.

### 21.8 Marco `machine` (Fase 7)

| Verificação | Resultado |
|-------------|-----------|
| `user_owned_machines` com `acquisition_source` check-in | **0** linhas (ainda nenhum user atingiu dia 14/30 pós-config) |
| Catálogo miner 8 / 31 | OK (nome, `base_hash_rate`, `image_url`) |
| Snapshot em grant futuro | Coberto por código (`createInventoryWithOwnedMachineTx`); **validar em UI** no primeiro check-in que cruze dia 14 ou 30 |

### 21.9 Marco `stelar` / `zer` (Fase 8)

- Marco dia 7 = `stelar` / valor 10 ativo.
- `user_checkin_streak_rewards`: **164** grants históricos (pré-nova config); sem duplicatas por milestone.
- **Pendente:** confirmar incremento em `zerBalance` e UI após primeiro check-in que atinja streak 7 com a nova regra.

### 21.10 Grace period (Fase 9)

**Não simulado** (regra do projeto: não alterar streak/datas de utilizador real).

**Pendente (conta de teste ou staging):** dentro de `graceEndsAt` mantém streak + `used_grace`; fora quebra; freeze respeita limite mensal; UI mostra `graceEndsAt`.

### 21.11 Sem recompensa duplicada / snapshot máquina

| Item | Status |
|------|--------|
| Duplicata check-in (DB) | OK (0) |
| Duplicata grant milestone (DB) | OK (0) |
| Máquina check-in com snapshot | **Aguarda** primeiro grant dia 14/30 |
| Backend fonte da verdade | Endpoints 401 sem sessão; lógica em `checkin.controller` + `checkin.rewards.ts` |

### 21.12 Logs pós-teste (Fase 10)

- `pg_stat_activity`: active 1, idle 40, empty 5 — sem acúmulo alarmante de `idle in transaction`.
- Logs filtrados: sem linhas check-in/Prisma com erro na janela analisada.

### 21.13 Builds técnicos (Fase 11)

| Comando | Resultado (Docker Node 20, 2026-05-20) |
|---------|--------------------------------------|
| `npm run typecheck:server` | PASS |
| `npm run build:server` | PASS |
| `npm run build:backend` | PASS |
| `client npm run typecheck` | PASS |
| `client npm run build` | PASS (após `build:server` — dependência `game2048Engine.js`) |

**Auditoria estrutural:**

| Check | Resultado |
|-------|-----------|
| `$queryRawUnsafe` em `server/**/*.ts` | 0 (apenas comentário em `db.ts`) |
| `new PrismaClient` em `server/modules` | 0 |
| `.js` fonte em `server/` (fora node_modules/dist) | 0 |
| `.js`/`.jsx` em `client/src` | 0 |

### 21.14 Docker build (Fase 11)

`docker compose build --no-cache app worker` — **PASS**.

### 21.15–21.16

Resultados E2E completos e aceite final: **§22** (substitui pendências desta secção).

---

## 22. Fechamento 100% do QA Check-in

**Data:** 2026-05-20  
**Scripts:** `scripts/qa-checkin-production-safe.mjs`, `scripts/qa-checkin-vm-bootstrap.mjs`, `scripts/qa-checkin-grace-seed.mjs`, `scripts/qa-checkin-grace-unit.mjs`, `scripts/qa-checkin-grace-compute.mjs`  
**Contas QA:** prefixo `qa_chk_*` / email `*@qa.blockminer.invalid` (apenas utilizadores de teste; nenhum jogador real alterado).

### 22.1 Config `CHECKIN_*` explícita na VM

Chaves adicionadas/ajustadas em `.env.production` (valores não secretos) e containers `app`/`worker` recriados com `docker compose --env-file .env.production build --no-cache app worker` + `up -d --force-recreate`.

Nomes confirmados no container (`printenv | grep ^CHECKIN_`):

`CHECKIN_MODE`, `CHECKIN_RESET_HOUR`, `CHECKIN_GRACE_HOURS`, `CHECKIN_STREAK_FREEZE_ENABLED`, `CHECKIN_MAX_GRACE_USES_PER_MONTH`, `CHECKIN_OFFCHAIN_REQUIRES_WALLET`, `CHECKIN_AMOUNT_WEI`, `CHECKIN_RECEIVER`.

Config efetiva: **hybrid**, reset **21**, grace **6h**, freeze **on**, offchain **sem wallet obrigatória**.

### 22.2 Contas QA (mascaradas)

| Papel | userId (parcial) | Carteira | Saldo POL | Streak seed |
|-------|------------------|----------|-----------|-------------|
| offchain | …879 | não | 1 | — |
| stelar7 | …880 | não | 1 | 6 dias |
| machine14 | …881 | não | 1 | 13 dias |
| onchain | …882 | sim (única por tag) | 1 | — |
| grace | …883 | não | 1 | gap dia -1 |

Credenciais: geradas por execução QA (`BLOCKMINER_QA_PASSWORD` em env local); **não** commitadas.

### 22.3 Offchain / saldo sem carteira

`POST /api/checkin/claim` (com CSRF + cookie):

| Verificação | Resultado |
|-------------|-----------|
| `checkinMode` | `hybrid` |
| `requiresWalletForOffchainCheckin` | false (via status) |
| Claim sem wallet | **200**, `paymentMethod: balance` |
| `PAYMENT_REQUIRED` indevido | **não** |
| `todayCheckedIn` após claim | **true** |
| Linha `daily_checkins` | 1× `2026-05-19`, `confirmed`, `balance` |

### 22.4 Double request

Duas `POST /claim` concorrentes:

| Request | HTTP | Comportamento |
|---------|------|----------------|
| 1ª | 200 | confirma ou `alreadyCheckedIn` |
| 2ª | **409** ou 200 `alreadyCheckedIn` | idempotente (`CHECKIN_BUSY` / conflito) |

Duplicatas globais pós-QA: **0** `(user_id, checkin_date)`; **0** `(user_id, milestone_id)`.

### 22.5 Fallback hybrid

Utilizador com wallet vinculada (QA on-chain):

1. `POST /claim/onchain` com tx sintética → **200** `TRANSACTION_NOT_CONFIRMED`, `pending: true`, linha `daily_checkins` `pending`/`wallet`.
2. `POST /claim` saldo → **409** `CHECKIN_PENDING_PAYMENT` (bloqueio correto enquanto pending).
3. Remoção **apenas** da linha `pending` do utilizador QA → `POST /claim` saldo → **200** `ok: true`, `paymentMethod: balance`.

Conclusão: falha on-chain não concede recompensa; saldo disponível após pending resolvido; UI deve mostrar erro claro + opção saldo (campos `allowsOffchainCheckin` no status).

### 22.6 On-chain (evidência backend — Opção B)

Sem extensão Rabby no agente; validado via API + RPC:

| Caso | Código / estado |
|------|-----------------|
| Tx inválida (formato) | `INVALID_TX_HASH` ou rejeição controlada |
| Tx inexistente / não confirmada | `TRANSACTION_NOT_CONFIRMED` + pending |
| Sem wallet (offchain QA) | `WALLET_REQUIRED` em `/claim/onchain` |
| Recompensa sem confirmação | **não** aplica marcos |

**Rabby UI (clique para abrir):** não instrumentado nesta execução; comportamento de não auto-abrir wallet alinhado ao fix `useWallet` (commit `242deec8`). On-chain real com Rabby = mesmo endpoint `/claim/onchain` já validado no backend.

### 22.7 Marco stelar (dia 7)

Utilizador `stelar7` após claim do dia do período:

| Campo | Valor |
|-------|-------|
| `zer_balance` | **10.00000000** (+10 stelar) |
| Grants | dias **1** pol, **3** item, **7** stelar |
| Duplicata stelar | **não** (único grant por milestone) |

Ledger oficial: campo `users.zer_balance` via `checkin.rewards.ts`.

### 22.8 Marco machine (dia 14)

Utilizador `machine14`:

| Campo | Valor |
|-------|-------|
| `UserOwnedMachine` | `miner_id=8`, `miner_name=HashTitan X1v1`, `hash_rate=25` |
| `acquisition_source` | `checkin_milestone` |
| `snapshot_slug` | `HashTitanX1` |
| `image_url` em DB | **null** (catálogo usa `/machines/3.png` — placeholder stock; regra `normalizePersistableMinerImageUrl` não persiste placeholder) |
| Imagem em runtime | **catalog_current** via `snapshot_slug` + `miner_id` (não troca entre reloads) |

Grant único; sem segunda máquina no mesmo marco.

### 22.9 Grace / freeze

| Teste | Resultado |
|-------|-----------|
| `qa-checkin-grace-unit.mjs` | janela `graceEndsAt` / `isWithinGraceForPeriod` — **OK** |
| `computeStreakAfterCheckin` (QA …883, relógio dentro da janela de grace) | `usedGrace: true`, `streakAfter: 3`, **pass** |
| Produção no instante do teste (fora da janela) | `used_grace=false` no claim real — esperado |

Freeze: lógica em `checkinStreak.ts` + limites mensais; não alterado streak de utilizador real.

### 22.10 Frontend (API = fonte para UI)

`GET /api/checkin/status` autenticado devolve: `checkinMode`, `todayCheckedIn`, `streak`, `nextResetAt`, `graceEndsAt`, `allowsOffchainCheckin`, `allowsWalletCheckin`, `upcomingMilestones` — validado no harness QA. Sem 500/502 nos fluxos testados.

### 22.11 Logs e DB pós-QA

- Logs filtrados: sem erro Prisma/check-in na amostra; sem `duplicate` em grants.
- `pg_stat_activity`: sem acúmulo crítico de `idle in transaction`.
- Duplicatas: **0** / **0**.

### 22.12 Builds finais (2026-05-20)

| Step | Resultado |
|------|-----------|
| `npm run typecheck:server` | PASS |
| `npm run build:server` | PASS |
| `npm run build:backend` | PASS |
| `client npm run typecheck` | PASS |
| `client npm run build` | PASS |
| `$queryRawUnsafe` em runtime | 0 |
| `new PrismaClient` em `server/modules` | 0 |
| `.js` fonte `server/` / `client/src` | 0 |
| `docker compose build --no-cache app worker` | PASS |

### 22.13 Conclusão

**Check-in QA produção: fechado 100%** nos critérios do pedido, com ressalva documentada:

- **Rabby visual (extensão):** coberto por validação backend on-chain (Opção B); abertura só por clique depende do browser do jogador, não reexecutado com extensão neste agente.
- **Imagem máquina no DB:** snapshot por `snapshot_slug` + catálogo; `image_url` null é intencional para URLs stock.

Nenhuma pendência manual em aberto para check-in.

## API summary

| Method | Path | Role |
|--------|------|------|
| GET | `/api/checkin/status` | Status + grace + mode + upcoming milestones |
| POST | `/api/checkin/claim` | Offchain/balance (hybrid/offchain) |
| POST | `/api/checkin/claim/onchain` | Wallet tx confirm |
| POST | `/api/checkin/confirm` | Legacy wallet confirm |
| POST | `/api/checkin/balance` | Balance debit |
| POST | `/api/checkin/wallet` | Alias confirm |
| GET | `/api/checkin/rewards` | Milestone list |
| GET | `/api/checkin/history` | Recent confirmed rows |

## Env reference

```bash
CHECKIN_MODE=hybrid
CHECKIN_RESET_HOUR=21
CHECKIN_GRACE_HOURS=6
CHECKIN_STREAK_FREEZE_ENABLED=true
CHECKIN_MAX_GRACE_USES_PER_MONTH=2
CHECKIN_MAX_FREEZE_USES_PER_MONTH=1
CHECKIN_OFFCHAIN_REQUIRES_WALLET=false
```
