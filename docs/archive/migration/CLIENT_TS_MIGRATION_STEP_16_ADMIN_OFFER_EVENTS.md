# Client TypeScript migration — Step 16 (Admin Offer Events list)

## Auditoria (tabela)

| Arquivo atual | Tipo | Migrar para | APIs | Tabela | Formulário | Ação crítica | Risco | Status |
|----------------|------|-------------|------|--------|------------|--------------|-------|--------|
| `AdminOfferEvents.jsx` | page | `AdminOfferEvents.tsx` | `GET /admin/offer-events`, `DELETE /admin/offer-events/:id` | sim | não (só checkbox filtros) | sim (`confirm` + arquivar) | baixo | **Migrado** |

Outros ficheiros na pasta com “offer” / “event” (fora do escopo desta fatia): `AdminOfferEventManage.jsx`, `AdminInternalOfferwall.jsx`, `adminInternalOfferwallValidate.ts` (+ teste).

---

## 1. Ficheiro Admin encontrado

`client/src/pages/admin/AdminOfferEvents.jsx` — lista de eventos de oferta com paginação (`page`, `pageSize: 20`), toggle “Mostrar arquivados”, refresh, novo evento, editar / miners / arquivar por linha.

## 2. Estado inicial (`.jsx`)

~155 linhas; estados sem tipos; `api.get` / `api.delete` sem genéricos; `catch (e)` não usado.

## 3. Estado final (`.tsx`)

Mesmo layout, textos PT e fluxos; `useState` tipado; `api.get<AdminOfferEventsListResponse>` com narrowing `if (res.data.ok)`; `softDelete(id: number)`; handlers `ChangeEvent<HTMLInputElement>`, `MouseEvent<HTMLButtonElement>` para ações da tabela; `void load()` em efeitos e refresh.

## 4. Ficheiros alterados

| Caminho | Ação |
|---------|------|
| `client/src/pages/admin/AdminOfferEvents.tsx` | Criado |
| `client/src/pages/admin/AdminOfferEvents.jsx` | Removido |
| `client/src/pages/admin/admin.types.ts` | `AdminOfferEventListRow`, `AdminOfferEventsListSuccess`, `AdminOfferEventsListResponse` |

`client/src/app/App.tsx` — sem alteração (`lazy(() => import('../pages/admin/AdminOfferEvents'))`).

`admin.api.ts` — não alterado (chamadas inline mantidas).

## 5. Tipos em `admin.types.ts`

- **`AdminOfferEventListRow`** — alinhado a `adminListOfferEvents` (`id`, `title`, datas, `isActive`, `deletedAt`, `minerCount`, `purchaseCount`, etc.).
- **`AdminOfferEventsListSuccess`** — `ok: true`, `page`, `pageSize`, `total`, `events`.
- **`AdminOfferEventsListResponse`** — união com `{ ok: false; message?: string }` para respostas de erro tipadas no `get`.

## 6. APIs envolvidas (inalteradas)

- `GET /admin/offer-events` — `page`, `pageSize`, `includeDeleted` (`"0"` | `"1"`).
- `DELETE /admin/offer-events/:id` — soft delete (arquivar).

## 7. Problemas de tipagem

- Resposta de lista pode ser sucesso ou erro; genérico único só com `ok: true` era insuficiente.

## 8. Resolução

- Tipo união `AdminOfferEventsListResponse` e branch `if (res.data.ok)` para estreitar `events` / `total`.

## 9. `any`

Não utilizado.

## 10. `@ts-ignore` / `@ts-nocheck`

Não utilizados (`grep` em `client/src/pages/admin/**/*.ts(x)` limpo).

## 11–18. Validação

| Comando | Resultado |
|---------|-----------|
| `cd client && npm run typecheck` | OK |
| `cd client && npm run build` | OK |
| `cd client && npm test` | 40 ficheiros, 254 testes — OK |
| `npm test` (raiz) | OK |
| `npm run typecheck:server` | OK |
| `npm run build:server` | OK |
| `npm run build:backend` | OK |
| `docker compose build --no-cache` | OK |

## 19. Visual

Sem alteração de UI, copy ou rotas.

## 20. `server/` fonte `.js`

`find server …` (excl. `node_modules`, `dist`): nenhum ficheiro listado.

## 21. `.jsx` / `.js` restantes em `client/src/pages/admin`

**20** ficheiros (inclui `AdminOfferEventManage.jsx`, `AdminInternalOfferwall.jsx`, etc.; **sem** `AdminOfferEvents.jsx`).

## 22. Próxima fatia recomendada

Migrar **`AdminOfferEventManage.jsx`** (gestão de um evento) ou **`AdminMetrics.jsx`**, antes de `AdminUsers` / `AdminMiners` completos.

---

## Greps solicitados

- `AdminOfferEvents.jsx` / `OfferEvents.jsx` em `client/src` — sem ocorrências.
- `@ts-ignore`, `@ts-nocheck`, `: any`, ` as any` em `pages/admin` — sem ocorrências.
