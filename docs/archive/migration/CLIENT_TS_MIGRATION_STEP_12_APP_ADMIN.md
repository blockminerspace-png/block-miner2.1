# BlockMiner — Step 12: `App.tsx` + bloco Admin em TypeScript e pasta dedicada

**Data:** 2026-05-13  
**Estado:** concluído para a fatia definida (build, typecheck cliente, testes cliente, `npm test` raiz, Docker).

---

## Nota sobre o caminho de `App`

O pedido original referia `client/src/App.jsx`. Neste repositório o router principal já vivia em **`client/src/app/App.jsx`**. A migração aplicada é:

- **`client/src/app/App.jsx` → `client/src/app/App.tsx`** (removido o `.jsx`).
- **`client/src/main.tsx`** importa `./app/App` (sem extensão).

Não existe `client/src/App.jsx` na árvore atual; o equivalente funcional é `client/src/app/App.tsx`.

---

## 1. Estado inicial de `App.jsx`

Ficheiro único em `client/src/app/App.jsx`: `BrowserRouter`, `Routes`, layouts protegidos + Web3, ~25 lazy imports de páginas Admin em `../pages/Admin*`, `AdminLayout` em `../shared/components/AdminLayout`.

---

## 2. Estado final de `App.tsx`

- Mesmas rotas e mesma árvore de `<Routes>`.
- Lazy imports Admin atualizados para **`../pages/admin/...`** e layout para **`../pages/admin/components/AdminLayout`**.
- Tipagem leve: `import type { JSX } from 'react'` em `RouteLoader` e `ProtectedOutletFallback`.

---

## 3. Quantos ficheiros Admin `.js`/`.jsx` existiam (antes desta fatia)

Auditoria inicial (lista `*admin*` em `client/src` antes das movimentações): **27** entradas relevantes (páginas `Admin*.jsx`, `AdminDailyTasks.tsx`, `adminDailyTasks/`, `shared/components/AdminLayout.jsx`, `AdminSidebar.jsx`, `admin/AdminSupportPlayerDossier.jsx`, utilitários `shared/utils/admin*.js`).

---

## 4. Lista dos ficheiros Admin migrados para `.ts`/`.tsx`

| Ficheiro novo / migrado |
|-------------------------|
| `client/src/app/App.tsx` |
| `client/src/pages/admin/components/AdminLayout.tsx` |
| `client/src/pages/admin/components/AdminSidebar.tsx` |
| `client/src/pages/admin/admin.types.ts` |
| `client/src/pages/admin/admin.api.ts` |
| `client/src/pages/admin/adminMiniPassForm.ts` (antes `.js` em `shared/utils/`) |
| `client/src/pages/admin/adminInternalOfferwallValidate.ts` (antes `.js` em `shared/utils/`) |
| `client/src/pages/admin/adminMiniPassForm.test.ts` (Vitest; substitui `tests/miniPassAdminForm.test.mjs`) |
| `client/src/pages/admin/adminInternalOfferwallValidate.test.ts` (antes `.js`) |
| `client/src/pages/admin/AdminDailyTasks.tsx` (já era TS; mantido, agora sob `pages/admin/`) |

---

## 5. Ficheiros Admin `.js`/`.jsx` restantes e justificativa

- **Páginas Admin em `.jsx`:** `AdminLogin`, `AdminDashboard`, … (lista em `client/src/pages/admin/*.jsx`) — mantidas em JSX para **não forçar** centenas de correções `noImplicitAny` numa única fatia; continuam cobertas por `allowJs: true` / `checkJs: false` no `client/tsconfig.json`.
- **`AdminSupportPlayerDossier.jsx`** e **`AdminSidebar.test.jsx`**, **`AdminSupportPlayerDossier.test.jsx`:** ainda JSX; migração incremental recomendada na próxima fatia.
- **Contagem global** `find client/src -name "*.js" -o -name "*.jsx"`: **147** (redução face ao passo anterior pela conversão de utilitários + testes e reorganização).

---

## 6. Nova estrutura do Admin

```
client/src/pages/admin/
  admin.api.ts
  admin.types.ts
  adminMiniPassForm.ts
  adminMiniPassForm.test.ts
  adminInternalOfferwallValidate.ts
  adminInternalOfferwallValidate.test.ts
  adminDailyTasks/
    adminDailyTasksModel.ts
  components/
    AdminLayout.tsx
    AdminSidebar.tsx
    AdminSidebar.test.jsx
    AdminSupportPlayerDossier.jsx
    AdminSupportPlayerDossier.test.jsx
  Admin*.jsx          # páginas (lazy a partir de App.tsx)
  AdminDailyTasks.tsx
```

---

## 7. Componentes movidos para a pasta Admin

- `AdminLayout`, `AdminSidebar`: de `client/src/shared/components/` → `pages/admin/components/`.
- `AdminSupportPlayerDossier`: de `client/src/shared/components/admin/` → `pages/admin/components/`.

---

## 8. Ficheiros que ficaram em `shared` e porquê

- **Tudo o que não é exclusivo do Admin** (ex.: `Sidebar` do utilizador, `ImageUploader`, `csrfHeader`, `machine`, `SupportAttachmentThumbnails`) mantém-se em `shared/` porque é reutilizado fora do painel Admin.

---

## 9. API clients Admin organizados

- **`admin.api.ts`:** `fetchAdminAuthOk()` — encapsula `GET /admin/auth/check` com o mesmo comportamento que o layout (sucesso → `ok`, falha de rede → `false`).
- Chamadas `api.get/post` nas páginas `.jsx` mantêm-se como estavam (sem redesign da camada HTTP nesta fatia).

---

## 10. Tipos criados

- `admin.types.ts`: `AdminUserListItem`, `AdminPagination`, `AdminAuthCheckResponse`.
- `adminMiniPassForm.ts`: `RewardDraft`, `SeasonFormInput`, `MissionDraft`, `ProgressionTier`, `ValidateResult`, etc.
- `adminInternalOfferwallValidate.ts`: `InternalOfferwallFormInput`, `InternalOfferwallValidateResult`.
- `AdminSidebar.tsx`: `AdminMenuEntry`, `AdminSidebarProps`.

---

## 11. Problemas de tipagem encontrados

1. Renomear em massa páginas Admin `.jsx` → `.tsx` gerou **centenas** de `implicit any` / `never` (ex. `AdminAnalytics.tsx`).
2. `AdminDailyTasks` acidentalmente renomeado para `.jsx` apesar de conter sintaxe TypeScript.
3. `tests/miniPassAdminForm.test.mjs` importava `.ts` — **Node test runner** não carrega TS nativamente.
4. `AdminSupport.jsx` ainda apontava para `shared/components/admin/AdminSupportPlayerDossier` após a mudança de pasta.

---

## 12. Como foram resolvidos

1. Páginas Admin grandes **revertidas para `.jsx`**; TS concentrado em **shell**, **helpers** e **testes Vitest**.
2. `AdminDailyTasks` corrigido para **`.tsx`**.
3. Testes do `adminMiniPassForm` **movidos para Vitest** em `client/src/pages/admin/adminMiniPassForm.test.ts`; ficheiro em `tests/` removido.
4. Import em `AdminSupport.jsx` atualizado para `./components/AdminSupportPlayerDossier`.

---

## 13. Onde foi necessário usar `any`

**Não aplicável** — não foi introduzido `any` / `as any` / `Record<string, any>` para contornar erros.

---

## 14. Confirmação `@ts-ignore` / `@ts-nocheck`

```bash
grep -RE "@ts-ignore|@ts-nocheck| as any|: any" client/src/pages/admin --include="*.ts" --include="*.tsx" || true
```

**Sem correspondências** (na pasta admin em ficheiros `.ts`/`.tsx`).

---

## 15. `cd client && npm run typecheck`

**OK** (`tsc --noEmit -p tsconfig.json`).

---

## 16. `cd client && npm run build`

**OK** (`vite build`).

---

## 17. `cd client && npm test`

**OK** — 40 ficheiros, **254** testes (inclui `adminMiniPassForm.test.ts` e `adminInternalOfferwallValidate.test.ts`).

---

## 18. `npm test` (raiz)

**OK** — `scripts/run-node-tests.mjs` sobre `tests/*.test.{js,mjs}`; caminhos de ficheiros-fonte para auditorias Admin UI (`adminMinersUiSecurity`, etc.) atualizados para `client/src/pages/admin/...`.

---

## 19. `npm run typecheck:server`

**OK**.

---

## 20. `npm run build:server`

**OK**.

---

## 21. `npm run build:backend`

**OK**.

---

## 22. `docker compose build --no-cache`

**OK** — imagens `app` e `worker` construídas.

---

## 23. Visual não redesenhado

Alterações: reorganização de pastas, imports, tipagem e um helper de auth admin. **Sem** mudança intencional de Tailwind/markup das páginas.

---

## 24. Nenhum `.js` fonte novo em `server/`

```bash
find server -name "*.js" -type f -not -path "server/node_modules/*" -not -path "server/dist/*" | wc -l
```

**0** (apenas comentário em `server/controllers/adminController.ts` atualizado para o novo caminho do cliente).

---

## 25. Próxima fatia recomendada

1. Migrar **página a página** os `Admin*.jsx` restantes para `.tsx` com tipos de estado/resposta (começar por `AdminLogin`, `AdminDashboard`).
2. Converter **`AdminSupportPlayerDossier.jsx`** + testes para `.tsx`.
3. Opcional: `admin.hooks.ts` para lógica repetida entre páginas Admin.

---

## Tabela de auditoria (amostra)

| Arquivo atual | Tipo | Admin? | Vai para | Extensão alvo | Depende de | Risco | Status |
|---------------|------|--------|----------|---------------|------------|-------|--------|
| `app/App.jsx` | app | não | `app/App.tsx` | `.tsx` | router, store | médio | **feito** |
| `pages/AdminDashboard.jsx` | page | sim | `pages/admin/AdminDashboard.jsx` | `.jsx` (por agora) | `api`, rotas | baixo | **movido** |
| `shared/components/AdminLayout.jsx` | layout | sim | `pages/admin/components/AdminLayout.tsx` | `.tsx` | `admin.api` | médio | **feito** |
| `shared/utils/adminMiniPassForm.js` | util | sim | `pages/admin/adminMiniPassForm.ts` | `.ts` | — | baixo | **feito** |
| `shared/utils/adminInternalOfferwallValidate.js` | util | sim | `pages/admin/adminInternalOfferwallValidate.ts` | `.ts` | — | baixo | **feito** |

Inventário completo: `find client/src -iname "*admin*" -type f | sort`.

---

*Fim do relatório Step 12.*
