# Client TypeScript migration — Step 13 (Admin pages)

## 1. Quantidade inicial de `.js` / `.jsx` em `client/src/pages/admin`

**Início desta continuação (após reversão da migração em massa):** **25** arquivos `.jsx` e **0** `.js` de página em `client/src/pages/admin`.

**Motivo da reversão:** converter todas as páginas Admin de uma vez produziu centenas de erros de `tsc` (`implicit any`, props ausentes, etc.); a estratégia aprovada é fatiar por página/componente com tipos explícitos.

**Após esta etapa:** **24** `.jsx` restantes; **14** `.ts` / `.tsx` na pasta Admin (`AdminMiniPass.jsx` → `AdminMiniPass.tsx`).

## 2. Arquivos migrados para `.ts` / `.tsx` (lista completa na pasta Admin)

| Arquivo | Notas |
|---------|--------|
| `admin.api.ts` | Cliente HTTP admin (Step 12 / anterior) |
| `admin.types.ts` | Tipos compartilhados; ampliado com `AdminMiniPassSeasonListRow` |
| `adminDailyTasks/adminDailyTasksModel.ts` | Modelo daily tasks |
| `adminInternalOfferwallValidate.ts` + `.test.ts` | Validação + teste |
| `adminMiniPassForm.ts` + `.test.ts` | Form mini pass |
| `AdminLogin.tsx` | Login admin tipado |
| `AdminDashboard.tsx` | Dashboard tipado |
| `AdminDailyTasks.tsx` | Daily tasks |
| `AdminMiniPass.tsx` | **Nesta sessão:** migrado de `AdminMiniPass.jsx` |
| `components/AdminLayout.tsx` | Layout |
| `components/AdminSidebar.tsx` | Sidebar |
| `components/AdminSidebar.test.tsx` | **Nesta sessão:** migrado de `.jsx` |

Não há par duplicado `.jsx` + `.tsx` para os arquivos acima.

## 3. `.js` / `.jsx` restantes em `client/src/pages/admin`

**22** páginas `Admin*.jsx` (analytics, backups, banners, broadcast, check-in, creators, deposit tickets, finance, fraud, internal offerwall, logs, metrics, miners, mini-pass season, offer events, read-earn, streaming, support, transparency, user sidebar, users, etc.) e **2** componentes:

| Arquivo | Justificativa |
|---------|----------------|
| `components/AdminSupportPlayerDossier.jsx` | Componente grande (~700 linhas); migração TS exige tipagem explícita de props, tickets e anexos sem `any`; reservado para sub-fatia dedicada. |
| `components/AdminSupportPlayerDossier.test.jsx` | Segue o dossier em JSX até o componente base migrar. |
| Demais `Admin*.jsx` | Páginas com tabelas, formulários e estado implícito; falha em massa na checagem estrita; migrar em lotes pequenos com tipos de API e filtros. |

## 4. Estado de `AdminLogin`

Migrado para **`AdminLogin.tsx`**: formulário, loading, erros e resposta `api.post` tipados; sem mudança de endpoint ou layout.

## 5. Estado de `AdminDashboard`

Migrado para **`AdminDashboard.tsx`**: métricas, listas e estados de loading/erro tipados; fallbacks para dados ausentes preservados.

## 6. Componentes Admin migrados (TSX)

`AdminLayout`, `AdminSidebar`, e testes `AdminSidebar.test.tsx`.

## 7. Testes Admin migrados

- `components/AdminSidebar.test.tsx` (Vitest + Testing Library inalterados conceitualmente).

## 8. API clients Admin

Chamadas continuam centralizadas em **`admin.api.ts`** onde já aplicável; `AdminMiniPass` usa `api.get` tipado inline com tipo de resposta local (`MiniPassSeasonsResponse`) — opcional mover para `admin.api.ts` numa sub-fatia.

## 9. Tipos criados ou ampliados

- **`AdminMiniPassSeasonListRow`** em `admin.types.ts` para linhas de `GET /admin/mini-pass/seasons`.

## 10–11. Problemas de tipagem e resolução

- **Migração em massa** de todas as páginas Admin para TSX gerou volume inviável de eras (`implicit any`, unions, etc.).
- **Resolução:** manter páginas pesadas em JSX; migrar fatias pequenas com tipos explícitos (`AdminMiniPass`, teste da sidebar).

## 12. Uso de `any`

**Nenhum** `any`, `as any`, `Record<string, any>` introduzido em `client/src/pages/admin` para contornar tipos.

## 13. `@ts-ignore` / `@ts-nocheck`

**Não utilizados** (confirmado com `grep` em `*.ts` / `*.tsx` da pasta admin).

## 14. `cd client && npm run typecheck`

```
> client@0.0.0 typecheck
> tsc --noEmit -p tsconfig.json

(sucesso, exit code 0)
```

## 15. `cd client && npm run build`

```
> client@0.0.0 build
> vite build
✓ built in ~15s
(exit code 0)
```

## 16. `cd client && npm test`

```
> client@0.0.0 test
> vitest run
Test Files  40 passed (40)
Tests       254 passed (254)
(exit code 0)
```

## 17. `npm test` (raiz)

```
pretest → build:server, build:backend
node scripts/run-node-tests.mjs
(exit code 0 — suíte completa)
```

## 18. `npm run typecheck:server`

```
> tsc -p tsconfig.server.json --noEmit
(exit code 0)
```

## 19. `npm run build:server`

```
> tsc -p tsconfig.server.json
(exit code 0)
```

## 20. `npm run build:backend`

```
> tsc -p backend/tsconfig.json
(exit code 0)
```

## 21. `docker compose build --no-cache`

Build concluído com sucesso (imagens `block-miner-app:latest` e `block-miner-worker:latest` exportadas; **exit code 0**).

## 22. Visual / rotas

Nenhum redesenho de UI nem alteração de rotas; apenas tipagem e extensão de arquivo onde indicado.

## 23. Fonte `.js` em `server/`

Comando:

`find server -name "*.js" -type f -not -path "server/node_modules/*" -not -path "server/dist/*"`

Resultado: **nenhum** arquivo `.js` de fonte listado na árvore `server/` (alinhado a servidor em TypeScript).

## 24. Próxima fatia recomendada

1. Tipar e migrar **`AdminSupportPlayerDossier.jsx`** (+ teste) com tipos de ticket/anexo/user em `admin.types.ts` ou `adminSupport.types.ts`.
2. Páginas Admin **médias** sem tabela gigante: ex. settings menores, depois **AdminUsers** / **AdminSupport** com tipos de paginação e filtros.
3. Opcional: extrair `GET /admin/mini-pass/seasons` para **`admin.api.ts`**.

---

## Auditoria (comandos solicitados)

### `find` — JSX/JS

24 arquivos `.jsx` listados (sem `.js` de página em `pages/admin`).

### `find` — TS/TSX

14 arquivos `.ts` / `.tsx` (incluindo `admin.api.ts`, `admin.types.ts`, modelos e testes).

### `grep` extensões em imports (`admin` + `app`)

Único hit em `client/src/app/App.tsx`: import de utilitário compartilhado com sufixo `.js` (`routePrefetch.js`) — **fora** do escopo Admin; nenhum import `.jsx` para páginas admin.

### `grep` padrões proibidos em `client/src/pages/admin`

Sem `@ts-ignore`, `@ts-nocheck`, `: any` ou ` as any` em `*.ts` / `*.tsx`.

---

## Tabela resumida (amostra de auditoria)

| Arquivo atual | Tipo | Migrar para | Depende de | API admin | Form | Tabela | Risco | Status |
|----------------|------|-------------|------------|-----------|------|--------|-------|--------|
| `AdminLogin.tsx` | page | — | `api`, `admin.types` | sim | sim | não | baixo | **TSX** |
| `AdminDashboard.tsx` | page | — | `api`, tipos dashboard | sim | não | sim | médio | **TSX** |
| `AdminMiniPass.tsx` | page | — | `api`, `admin.types` | sim | não | sim | baixo | **TSX** |
| `AdminSupportPlayerDossier.jsx` | component | `.tsx` futuro | `api`, anexos | sim | sim | sim | alto | **JSX** |
| `AdminUsers.jsx` | page | `.tsx` futuro | `api`, estado complexo | sim | sim | sim | alto | **JSX** |
