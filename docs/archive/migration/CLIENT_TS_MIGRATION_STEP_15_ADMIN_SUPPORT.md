# Client TypeScript migration — Step 15 (Admin Support page)

## Auditoria (tabela)

| Arquivo atual | Tipo | Migrar para | Estados principais | APIs | Dossiê | Form | Lista | Risco | Status |
|---------------|------|-------------|----------------------|------|--------|------|-------|-------|--------|
| `AdminSupport.jsx` | page | `AdminSupport.tsx` | mensagens, seleção, reply, dossier, socket, filtros | `GET/POST /admin/support…`, upload imagem | sim | sim (reply + ficheiros) | sim | médio | **Migrado** |

Não existe teste dedicado `*AdminSupport*.test.*` no repositório.

---

## 1. Estado inicial — `AdminSupport.jsx`

Página em JSX (~586 linhas): lista com `api.get('/admin/support')`, detalhe `api.get('/admin/support/:id')`, dossiê `player-dossier`, reply `POST …/reply`, upload `POST /admin/upload-image`, Socket.IO `support:subscribeAdmin` / `support:reply`, filtros locais e pesquisa.

## 2. Estado final — `AdminSupport.tsx`

Comportamento e markup preservados; estados e respostas `api` tipados com genéricos; `Socket` tipado (`socket.io-client`); eventos `ChangeEvent` / `MouseEvent`; `mergeReplyUnique` e `defaultDossierParams` tipados; validação de filtro com type guard `isAdminSupportListFilter`; corpo do dossiér validado com `isAdminSupportPlayerDossierBundle` (sem `any`).

## 3. Arquivos alterados

| Caminho | Alteração |
|---------|-----------|
| `client/src/pages/admin/AdminSupport.tsx` | **Novo** (substitui `.jsx`) |
| `client/src/pages/admin/AdminSupport.jsx` | **Removido** |
| `client/src/pages/admin/admin.types.ts` | Tipos de inbox, detalhe, anexos, socket, upload, reply; função `isAdminSupportPlayerDossierBundle` |
| `client/src/games/minerGamesSocketGuards.ts` | `lastLaneEmit` inicial `-Infinity` (correção de throttle na 1.ª emissão; falha de teste detetada na validação desta etapa) |
| `client/src/app/App.tsx` | Sem alteração necessária (`lazy(() => import('../pages/admin/AdminSupport'))` resolve `.tsx`) |

`admin.api.ts` não foi alterado (chamadas mantidas inline como no JSX).

## 4. Tipos criados ou ampliados em `admin.types.ts`

- `AdminSupportAttachment`, `AdminSupportUserSnippet`
- `AdminSupportInboxMessage`, `AdminSupportListApiResponse`
- `AdminSupportReplyEntry`, `AdminSupportMessageDetail`, `AdminSupportMessageApiResponse`
- `AdminSupportListFilter`, `AdminSupportSubscribeAck`, `AdminSupportSocketReplyPayload`
- `AdminSupportUploadImageResponse`, `AdminSupportReplyPostResponse`
- `isAdminSupportPlayerDossierBundle(value: unknown)` — type guard para resposta do dossiê

## 5. APIs envolvidas (inalteradas)

- `GET /admin/support` — lista (paginação `page`, `limit`)
- `GET /admin/support/:id` — detalhe da mensagem
- `GET /admin/support/:id/player-dossier` — dossiê (query `dossierParams`)
- `POST /admin/support/:id/reply` — resposta admin
- `POST /admin/upload-image` — anexos da resposta
- Socket: `support:subscribeAdmin`, evento `support:reply`

## 6. Integração com `AdminSupportPlayerDossier.tsx`

Import `./components/AdminSupportPlayerDossier` sem extensão; `bundle` como `AdminSupportPlayerDossierBundle | null`; `params` / `onParamsChange` alinhados a `AdminSupportPlayerDossierParams`.

## 7. Problemas de tipagem encontrados

- Atributo `title` em elementos (já tratado no dossiér na Step 14); aqui não aplicável de novo.
- Resposta do dossiér via axios: estreitar `unknown` → bundle com type guard.
- `mergeReplyUnique` e estado de `replies` precisavam de tipo explícito.

## 8. Resoluções

- Genéricos em `api.get<T>` / `api.post<T>` para listas, detalhe, reply e upload.
- `isAdminSupportPlayerDossierBundle` para `setDossierBundle` seguro.
- `socketRef` como `useRef<Socket | null>(null)`.
- Filtro do `<select>` validado com `isAdminSupportListFilter`.

## 9. Uso de `any`

Não foi introduzido `any`, `as any`, nem `Record<string, any>`.

## 10. `@ts-ignore` / `@ts-nocheck`

Não utilizados (`grep` em `client/src/pages/admin/**/*.ts(x)` limpo).

## 11. `cd client && npm run typecheck`

Sucesso (exit code 0).

## 12. `cd client && npm run build`

Sucesso — `vite build` (exit code 0).

## 13. `cd client && npm test`

Sucesso — 40 ficheiros, 254 testes (exit code 0).

**Nota:** Na primeira execução falhou `minerGamesSocketGuards.test.ts` (1.ª chamada a `tryEmitLane` com `laneEmitMinMs: 1000` quando `performance.now() < 1000`). Corrigido o estado inicial de `lastLaneEmit` para `-Infinity` em `minerGamesSocketGuards.ts`.

## 14. `npm test` (raiz)

Sucesso (exit code 0).

## 15. `npm run typecheck:server`

Sucesso (exit code 0).

## 16. `npm run build:server`

Sucesso (exit code 0).

## 17. `npm run build:backend`

Sucesso (exit code 0).

## 18. `docker compose build --no-cache`

Sucesso (exit code 0).

## 19. Visual / textos / rotas

Sem redesenho, sem alteração de copy ou rotas; mensagens continuam em `whitespace-pre-wrap` (texto), sem `dangerouslySetInnerHTML`.

## 20. Fonte `.js` em `server/`

`find server -name "*.js" …` (excl. `node_modules`, `dist`): **nenhum** ficheiro listado.

## 21. `.jsx` / `.js` restantes em `client/src/pages/admin`

**21** páginas `Admin*.jsx` (Analytics … Users); **0** `AdminSupport.jsx`.

Ficheiros Support relacionados em TS:

- `AdminSupport.tsx`
- `components/AdminSupportPlayerDossier.tsx`
- `components/AdminSupportPlayerDossier.test.tsx`

## 22. Próxima fatia recomendada

Migrar uma página Admin **menor** (ex.: `AdminMetrics.jsx` ou `AdminOfferEvents.jsx`) antes de `AdminUsers.jsx` / `AdminMiners.jsx` completos.

---

## Verificações solicitadas

- `grep -R "AdminSupport.jsx" client/src` — sem resultados.
- `grep` por `@ts-ignore`, `@ts-nocheck`, `: any`, ` as any` em `client/src/pages/admin` — sem resultados.
