# BlockMiner — Migração `inventory` + `vault` para `server/modules/`

**Branch:** `chore/dead-code-cleanup`  
**Data:** 2026-05-20

---

## 1–2. Rotas inventory

| Antes | Depois |
|-------|--------|
| `server/routes/inventory.ts` montava handlers de `server/controllers/inventoryController.ts` | `server/routes/inventory.ts` reexporta `inventoryRouter` de `server/modules/inventory/` |
| `GET /api/inventory/` | Igual |
| `POST /api/inventory/install` | Igual |
| `POST /api/inventory/remove` | Igual |
| `POST /api/inventory/update` | Igual |

Middlewares preservados: `requireAuth`, `inventory_write` limiter, `requireCriticalIdempotency` nos writes.

---

## 3–4. Rotas vault

| Antes | Depois |
|-------|--------|
| `server/routes/vault.ts` (default export) + `vaultController` | `server/routes/vault.ts` reexporta `vaultRouter` de `server/modules/vault/` |
| `GET /api/vault/` | Igual |
| `POST /api/vault/move-to-vault` | Igual |
| `POST /api/vault/retrieve-from-vault` | Igual |

Middlewares preservados: `requireAuth` (router-level), `vault_write` limiter, `validateBody` (schemas), idempotência crítica.

---

## 5. Legados → shims

| Ficheiro | Estado |
|----------|--------|
| `server/controllers/inventoryController.ts` | `export *` → `modules/inventory/inventory.controller.ts` |
| `server/controllers/vaultController.ts` | `export *` → `modules/vault/vault.controller.ts` |
| `server/models/inventoryModel.ts` | `export *` → `modules/inventory/inventory.repository.ts` |
| `server/models/vaultModel.ts` | `export *` → `modules/vault/vault.repository.ts` |
| `server/utils/vaultSchemas.ts` | `export *` → `modules/vault/vault.schemas.ts` |
| `server/routes/inventory.ts` | Reexport router |
| `server/routes/vault.ts` | Reexport router (default + named) |

Sem regra ativa duplicada nos shims.

---

## 6. `server/modules/inventory/`

```
index.ts
inventory.routes.ts
inventory.controller.ts   ← HTTP, idempotência, status codes
inventory.service.ts      ← instalação, remoção, listagem + transações
inventory.repository.ts   ← Prisma CRUD inventário
inventory.dto.ts          ← mapInventoryItemDto + imageSource
inventory.schemas.ts      ← Zod install/remove (referência)
inventory.types.ts
inventory.errors.ts
```

---

## 7. `server/modules/vault/`

```
index.ts
vault.routes.ts
vault.controller.ts       ← HTTP, erros vault.*, idempotência
vault.service.ts          ← move/retrieve/list + transações
vault.repository.ts       ← Prisma CRUD vault
vault.dto.ts              ← mapVaultItemDto
vault.schemas.ts          ← moveToVaultBodySchema, retrieveFromVaultBodySchema
vault.types.ts
vault.errors.ts
```

---

## 8–9. Regra de negócio e Prisma

| Domínio | Negócio | Prisma |
|---------|---------|--------|
| inventory | `inventory.service.ts` | `inventory.repository.ts` + transações em `service` via `prisma.$transaction` |
| vault | `vault.service.ts` | `vault.repository.ts` + transações em `service` |

Controllers **não** importam `prisma` diretamente.

---

## 10–11. DTOs e schemas

- **inventory:** `mapInventoryItemDto` — `imageUrl`, `imageSource`, `ownedMachineId` (compatível com resposta anterior).
- **vault:** `mapVaultItemDto` — mesma forma.
- **vault schemas:** movidos de `server/utils/vaultSchemas.ts` para `vault.schemas.ts` (shim no utils).

---

## 12. Auth / autorização

- Todas as rotas exigem `requireAuth`.
- Queries filtram por `userId` da sessão (`req.user.id` → service).
- Locks por utilizador (`user_ops:`, `vault:`) e row locks (`lockUserInventoryRowForUpdate`, etc.) preservados.

---

## 13. Payload compatível

Respostas mantidas:

- `{ ok: true, inventory: [...] }`
- `{ ok: true, vault: [...] }`
- `{ ok: true, message: "...", movedCount?: n }` em move/retrieve
- Códigos de erro vault (`VAULT_NOT_FOUND`, `VAULT_ALREADY_STORED`, etc.) inalterados no controller HTTP.

---

## 14–16. Segurança TS / Prisma

| Verificação | Resultado |
|-------------|-----------|
| `$queryRawUnsafe` | **0** |
| `new PrismaClient` em módulos | **0** (só `server/prisma/seed.ts` no repo) |
| `server/` sem `.js` fonte | OK |
| `client/src/` sem `.js`/`.jsx` | OK |
| Páginas soltas em `pages/` | OK |

---

## 17–22. Validação

Ambiente: `docker run node:20-bookworm-slim` + `npm ci` + `prisma generate`.

| Comando | Resultado |
|---------|-----------|
| `npm run typecheck:server` | OK |
| `npm run build:server` | OK |
| `npm run build:backend` | OK |
| `cd client && npm run typecheck` | OK |
| `cd client && npm run build` | OK |
| `docker compose build app worker` | OK |
| `node --test tests/inventory/inventoryMachineImages.test.mjs` | OK |

---

## 23. Pendências honestas

1. **Testes** que leem ficheiro `server/controllers/inventoryController.ts` continuam válidos via shim; podem apontar para `modules/inventory/inventory.service.ts` numa PR só de testes.
2. **Faucet / admin bulk** — fora deste escopo.
3. **`inventory.schemas.ts`** — validação Zod definida; rotas ainda usam coerção manual no controller (comportamento idêntico ao anterior).

---

## Módulos oficiais (lista atualizada)

`admin-miners`, `auth`, `checkin`, **`inventory`**, `machines`, `shop`, `stats`, `support`, `tasks`, **`vault`**, `wallet`
