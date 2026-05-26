# BlockMiner — Migração `faucet` para `server/modules/`

**Branch:** `chore/dead-code-cleanup`  
**Data:** 2026-05-20

---

## 1–2. Rotas faucet

| Método | Path | Antes | Depois |
|--------|------|-------|--------|
| GET | `/api/faucet/status` | `faucetController` | `modules/faucet/faucet.controller` |
| POST | `/api/faucet/partner/start` | idem | idem |
| POST | `/api/faucet/claim` | idem | idem |

Middlewares preservados: `requireAuth`, `requireVisibleSidebarPath(faucet)`, rate limits (20/min geral, 6/min claim).

Não existia rota `/history` no projeto — não inventada.

---

## 3. Legados → shims

| Ficheiro | Estado |
|----------|--------|
| `server/controllers/faucetController.ts` | `export *` → `modules/faucet/faucet.controller.ts` |
| `server/routes/faucet.ts` | Reexport `faucetRouter` |

Não havia `server/services/faucet*` nem `server/models/faucet*` separados.

---

## 4. `server/modules/faucet/`

```
index.ts
faucet.routes.ts
faucet.controller.ts    ← HTTP apenas (sem Prisma)
faucet.service.ts       ← cooldown, partner visit, claim, transação inventário
faucet.repository.ts    ← queries Prisma (reward, claim, partner visit)
faucet.dto.ts           ← buildStatusCore, mapPublicReward
faucet.schemas.ts       ← placeholders Zod (sem body obrigatório hoje)
faucet.types.ts
faucet.errors.ts
```

---

## 5–6. Regra e Prisma

| Camada | Responsabilidade |
|--------|------------------|
| **service** | `getActiveReward`, `normalizeFaucetRecord`, `computePartnerState`, `startPartnerVisitForUser`, `getStatusForUser`, `claimForUser` + `$transaction` de claim |
| **repository** | `findActiveFaucetReward`, `findFaucetClaimByUserId`, `resetFaucetClaimDayKey`, `findFaucetPartnerVisit`, `upsertFaucetPartnerVisit` |
| **controller** | Auth 401, status HTTP 429/403/500, JSON de resposta |

Constantes económicas inalteradas: `DEFAULT_FAUCET_COOLDOWN_MS`, `FAUCET_PARTNER_WAIT_MS`, `FAUCET_PARTNER_URL`.

---

## 7–8. DTO e schemas

- **DTO:** `inventoryPermanent: true`, `inventoryExpiresAt: null`, `imageUrl` via `normalizePersistableMinerImageUrl`.
- **Schemas:** ficheiro criado para padrão modular; rotas ainda não exigem body (igual ao anterior).

---

## 9–10. Auth e idempotência

- Só `req.user.id` — sem `userId` de query/body.
- Cooldown: `buildStatusCore` + 429 com `remainingMs` preservado.
- Partner gate: 403 com mesma mensagem PT.
- Claim: transação única inventário + `faucetClaim.upsert` (sem double-claim na mesma request).

---

## 11. Payload compatível

Respostas mantidas: `getStatus` (`ok`, `available`, `canClaim`, `reward`, …), `partner/start`, `claim` (`nextAvailableAt`, mensagens).

---

## 12–15. Segurança / TS

| Verificação | Resultado |
|-------------|-----------|
| `$queryRawUnsafe` | 0 |
| `new PrismaClient` em módulo faucet | 0 |
| Prisma no controller faucet | 0 |
| `server/` / `client/src` sem `.js` fonte | OK |

---

## 16–17. Build

| Comando | Resultado |
|---------|-----------|
| `npm run typecheck:server` | OK |
| `npm run build:server` | OK |
| `client` typecheck + build | OK |
| `docker compose build app worker` | OK |

---

## 18. Testes existentes (sem novos)

| Teste | Resultado |
|-------|-----------|
| `tests/inventory/inventoryMachineImages.test.mjs` (4 subtests) | **6/6 pass** |
| `tests/faucetInventoryNoExpiry.test.mjs` (2) | **pass** |

---

## 19. Correção teste `rooms` (subteste existente)

**Falha:** regex `ownedMachine: { select: { imageUrl: true } }` — esperava só `imageUrl`.

**Comportamento atual (correto):** `roomsController.ts` inclui também `minerName: true` no select de `ownedMachine` (necessário para resolver imagem/nome de evento).

**Ação:** atualizada expectativa em `inventoryMachineImages.test.mjs` para:

```js
/ownedMachine:\s*\{\s*select:\s*\{\s*imageUrl:\s*true,\s*minerName:\s*true\s*\}/
```

Sem skip, sem teste novo, sem alteração de produção em `rooms`.

**Testes faucet:** apontam para `server/modules/faucet/faucet.service.ts` e `faucet.dto.ts` (shim do controller já não contém strings de negócio).

---

## 20. Pendências

1. **Rooms** — domínio completo ainda em `server/controllers/roomsController.ts` (fora deste escopo).
2. **Admin bulk** — não migrado.
3. **`faucet.schemas.ts`** — pode ser ligado a `validateBody` numa PR futura sem mudar economia.

---

## Módulos oficiais

`admin-miners`, `auth`, `checkin`, **`faucet`**, `inventory`, `machines`, `shop`, `stats`, `support`, `tasks`, `vault`, `wallet`
