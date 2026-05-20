# MODULE_MIGRATION_ROOMS_REPORT

Migração do domínio **rooms** para `server/modules/rooms/` (monólito modular), sem alteração de comportamento, economia ou payloads públicos.

**Branch:** `chore/dead-code-cleanup`  
**Data:** 2026-05-19

---

## 1. Rotas rooms antes

Montagem: `backend/src/app/mount/userApiRoutes.mount.ts` → `app.use("/api/rooms", roomsRouter)`.

| Método | Path | Auth | Middlewares |
|--------|------|------|-------------|
| GET | `/api/rooms/` | `requireAuth` | — |
| POST | `/api/rooms/buy` | `requireAuth` | `rooms_write` rate limit |
| POST | `/api/rooms/rack/install` | `requireAuth` | rate limit + idempotência `rooms_rack_install` |
| POST | `/api/rooms/rack/uninstall` | `requireAuth` | rate limit + idempotência `rooms_rack_uninstall` |
| POST | `/api/rooms/rack/uninstall-batch` | `requireAuth` | rate limit + idempotência `rooms_rack_uninstall_batch` |
| GET | `/api/rooms/slots` | `requireAuth` | — |

Implementação única em `server/controllers/roomsController.ts` (~700 linhas) + `server/routes/rooms.ts`.

Não existiam `server/services/*room*` nem `server/models/*room*` dedicados. Não há rota `/api/public-room` neste repositório.

---

## 2. Rotas rooms depois

**Idênticas** (mesmos paths, métodos, middlewares e scopes de idempotência).

Router canónico: `server/modules/rooms/rooms.routes.ts`  
Shim: `server/routes/rooms.ts` → `export { roomsRouter } from "../modules/rooms/index.js"`.

---

## 3. Arquivos legados (shim)

| Arquivo | Estado |
|---------|--------|
| `server/controllers/roomsController.ts` | Shim: `export * from "../modules/rooms/rooms.controller.js"` |
| `server/routes/rooms.ts` | Shim: reexport `roomsRouter` do módulo |

Sem regra ativa, sem Prisma, sem duplicação de lógica.

---

## 4. Novos arquivos em `server/modules/rooms/`

| Arquivo | Responsabilidade |
|---------|------------------|
| `index.ts` | Export público do router |
| `rooms.routes.ts` | Rotas + `requireAuth` + rate limit + idempotência |
| `rooms.controller.ts` | HTTP: sessão, validação básica de body, idempotência crítica, status codes |
| `rooms.service.ts` | Regra de negócio: listar/comprar sala, install/uninstall rack, batch, slots |
| `rooms.repository.ts` | Queries Prisma (`userRoom`, `userRack`, `userInventory`, `user`) |
| `rooms.dto.ts` | Montagem de payload de listagem + imagens (`resolveOwnedMachineImageUrl`) |
| `rooms.schemas.ts` | Schemas Zod + `normalizeRackIds` |
| `rooms.types.ts` | Constantes (`RACKS_PER_ROOM`, `ROOM_MAX`, …) e tipos de listagem |
| `rooms.errors.ts` | Códigos de erro do domínio (referência; respostas HTTP mantêm códigos legados onde já existiam) |

---

## 5. Regra de negócio

| Área | Local |
|------|--------|
| Preços de sala, unlock sequencial, débito `polBalance` | `rooms.service.ts` (`buyRoomForUser`) |
| Listagem 1..`ROOM_MAX` com racks e miners | `rooms.service.ts` + `rooms.dto.ts` |
| Install 1/2 slots, adjacent rack, inventário → rack | `rooms.service.ts` |
| Uninstall / batch → inventário + owned machine snapshot | `rooms.service.ts` (`moveRackMinerBackToInventoryTx`) |
| Slots summary | `rooms.service.ts` |
| Hashrate sync, notificações, mining engine reload | `rooms.service.ts` (mesmas integrações que antes) |

Controller **não** contém regra de economia nem transações de negócio (apenas orquestra HTTP e idempotência).

---

## 6. Prisma / repository

- Cliente central: `import prisma from "../../src/db/prisma.js"`.
- Leituras simples: `rooms.repository.ts`.
- Transações (`$transaction`) e locks: `rooms.service.ts` (padrão alinhado com `inventory` / `faucet`).
- **0** `new PrismaClient` no módulo.
- **0** `$queryRawUnsafe` no módulo.
- Controller legado: **0** acesso Prisma.

---

## 7. DTOs

`rooms.dto.ts`:

- `getRoomPrices()` — env `ROOM_PRICES`
- `loadRoomListCatalogMaps` — catálogo evento + miner name
- `buildListedRoomsPayload` — salas locked/unlocked + racks com `miner.imageUrl`, `imageSource`, `minerName`
- `countRackTotals` — `totalRacks`, `occupiedRacks`, `freeRacks`

Payload de listagem compatível com o anterior (`ok`, `rooms`, totais de rack).

---

## 8. Schemas

`rooms.schemas.ts`: `installMinerBodySchema`, `uninstallMinerBodySchema`, `uninstallMinerBatchBodySchema`, `normalizeRackIds`.

Validação numérica de `rackId` / `inventoryId` / `rackIds` permanece também no controller (comportamento e mensagens iguais ao legado).

---

## 9. Auth / autorização

- Router: `requireAuth` global (401 JSON via middleware existente).
- Queries: `where: { userId }` em racks, inventário e salas.
- Rack de outro utilizador: 404 / não encontrado (sem vazar existência).
- Mutações críticas: idempotência + advisory lock `user_ops:{userId}` inalterados.

---

## 10. Imagens (`ownedMachine.imageUrl` + `minerName`)

- Select explícito no repository: `ownedMachine: { select: { imageUrl: true, minerName: true } }`.
- Resolução visual: `resolveOwnedMachineImageUrl` em `rooms.dto.ts` (mesmo helper que inventory).
- Catálogo: `loadEventMinerCatalogImageMap` / `loadMinerCatalogImageMapByDisplayNames`.
- Install persiste `inventoryItem.imageUrl` no `userMiner` e snapshot `MachineLocation.RACK` — sem placeholder no banco.
- **Rooms não redefine identidade de imagem**; reutiliza helpers partilhados.

---

## 11. Payload compatível

Confirmado por preservação literal de:

- Estrutura `listRooms`: `ok`, `rooms[]`, `totalRacks`, `occupiedRacks`, `freeRacks`
- `buyRoom`: `ok`, `roomNumber`, `roomId`, `message`, códigos `MAX_ROOMS_REACHED`, `INSUFFICIENT_BALANCE`
- Rack install/uninstall: mensagens e códigos (`RACK_OCCUPIED`, `ROW_EDGE_NO_SPACE`, etc.)
- `getSlotsSummary`: `ok`, contagens + `inventoryCount`

---

## 12–13. Segurança Prisma

| Verificação | Resultado |
|-------------|-----------|
| `$queryRawUnsafe` em código ativo rooms | 0 (só comentário em `db.ts`) |
| `new PrismaClient` em `server/modules/rooms` | 0 |

---

## 14–15. Fonte TS

| Verificação | Resultado |
|-------------|-----------|
| `server/**/*.js` (excl. node_modules/dist) | 0 |
| `client/src/**/*.js` / `.jsx` | 0 |

---

## 16. Typecheck / build

| Comando | Resultado |
|---------|-----------|
| `docker compose build app` | **OK** — `tsc -p tsconfig.server.json` + `tsc -p backend/tsconfig.json` dentro da imagem |
| `docker compose build worker` | **OK** |
| `npm run typecheck:server` (host sem `prisma generate`) | Falha ambiente local (tipos Prisma ausentes) — não regressão do módulo |

---

## 17. Docker build

- `block-miner-app`: built successfully (2026-05-19).
- `block-miner-worker`: built successfully (cache hit após app).

---

## 18. Testes existentes

| Teste | Resultado |
|-------|-----------|
| `tests/inventory/inventoryMachineImages.test.mjs` | **4/4 pass** — lê `rooms.dto.ts`, `rooms.repository.ts`, `rooms.service.ts` |
| `tests/rooms.test.js` | Não executado nesta sessão (requer DB/fixtures); shim `roomsController` mantém exports para imports existentes |

Nenhum teste novo criado. Nenhum teste apagado.

---

## 19. Smoke API

`GET https://blockminer.space/api/rooms` sem sessão: resposta **401** JSON (rota protegida) — comportamento esperado.

---

## 20. Frontend

Sem alterações. Chamadas existentes em `client/src/pages/machines/machines.api.ts` (`/rooms`, `/rooms/buy`, rack install/uninstall) inalteradas.

---

## 21. Pendências honestas

1. `tests/rooms.test.js` — validar em ambiente com PostgreSQL + `npm run pretest` quando disponível localmente.
2. Schemas Zod criados mas validação principal de body ainda espelha o legado no controller (pode unificar numa fase futura **sem** mudar mensagens).
3. Transações Prisma no service (não no repository) — consistente com outros módulos já migrados; opcional extrair `rooms.repository.tx*` mais tarde.

---

## Critério de aceite

| Item | OK |
|------|-----|
| Módulo oficial `server/modules/rooms` | ✓ |
| Legado shim sem regra ativa | ✓ |
| Prisma leituras no repository | ✓ |
| Controller sem Prisma | ✓ |
| Payload / rotas compatíveis | ✓ |
| Imagens via helpers partilhados | ✓ |
| Sem testes novos | ✓ |
| Teste inventory/rooms wiring passa | ✓ |
| Docker build app/worker | ✓ |
| Relatório criado | ✓ |
