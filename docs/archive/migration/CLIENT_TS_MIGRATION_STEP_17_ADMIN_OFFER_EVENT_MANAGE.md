# Client TS migration — Step 17: `AdminOfferEventManage`

## 1. Auditoria inicial (resumo)

Comandos executados (equivalentes ao roteiro):

- `find client/src/pages/admin -iname "*OfferEventManage*" -type f | sort` → apenas `AdminOfferEventManage.tsx` após remoção do `.jsx`.
- `grep -R "AdminOfferEventManage" client/src` → referências em `App.tsx` (lazy import sem extensão), tipos em `admin.types.ts`, implementação em `AdminOfferEventManage.tsx`.

### Tabela

| Campo | Valor |
| --- | --- |
| **Arquivo atual** | `client/src/pages/admin/AdminOfferEventManage.jsx` (removido na migração) |
| **Tipo** | page (admin) |
| **Vai migrar para** | `client/src/pages/admin/AdminOfferEventManage.tsx` |
| **Parâmetros de rota** | `useParams<{ id: string }>()` — `id` é `'new'` (criação) ou identificador do evento na URL (string, como antes). |
| **APIs usadas** | `GET /admin/offer-events/:id`, `POST /admin/offer-events`, `PUT /admin/offer-events/:id`, `GET /admin/offer-events/:id/miners`, `POST /admin/offer-events/:id/miners`, `PUT /admin/offer-events/:id/miners/:minerId`, `DELETE .../miners/:minerId`, `GET /admin/offer-events/:id/purchases?pageSize=100` (base axios `/api`). |
| **Formulários** | Formulário do evento (título, descrição, imagem, início/fim `datetime-local`, ativo); modal de miner (campos existentes). |
| **Ações críticas** | Criar/atualizar evento; criar/editar/remover miner com `confirm` no delete; navegação de volta e após criação. |
| **Risco** | Baixo: troca de extensão + tipagem; `setSearchParams` passou a clonar `URLSearchParams` em vez de mutar a instância atual (comportamento equivalente para o router). |
| **Status** | Concluída — validações abaixo passaram. |

## 2. Estado inicial

- Página em JSX (~573 linhas): abas via `?tab=`, modo `id === 'new'`, carregamento de evento/miners/compras, formulários e toasts como documentado no Step 16/17.

## 3. Estado final

- Mesma UI, textos e endpoints; componente em TypeScript com estados, respostas de API e eventos tipados; helper `readAxiosResponseMessage(err: unknown)` para mensagens de erro sem `any`.

## 4. Arquivos alterados

- `client/src/pages/admin/AdminOfferEventManage.tsx` — novo (substitui o `.jsx`).
- `client/src/pages/admin/AdminOfferEventManage.jsx` — removido.
- `client/src/pages/admin/admin.types.ts` — tipos para abas, formulário do evento, detalhe do evento, miners, compras e respostas de API.
- `client/src/app/App.tsx` — sem alteração necessária (import lazy sem extensão).
- `client/src/pages/admin/AdminOfferEvents.tsx` — sem alteração.

## 5. Tipos criados ou ampliados (`admin.types.ts`)

- `AdminOfferEventManageTab`
- `AdminOfferEventManageFormState`
- `AdminOfferEventDetail`
- `AdminOfferEventGetResponse`
- `AdminOfferEventMutationResponse`
- `AdminOfferEventMinerRow`
- `AdminOfferEventMinersListResponse`
- `AdminOfferEventPurchaseUser`, `AdminOfferEventPurchaseRow`, `AdminOfferEventPurchasesListResponse`
- `AdminOfferEventMinerFormState`

## 6. APIs envolvidas

Ver coluna “APIs usadas” na tabela; payloads e corpos de resposta alinhados ao uso pré-existente no JSX.

## 7. Problemas de tipagem encontrados

- Respostas `axios` genéricas e corpos `{ ok, message, event, ... }`.
- `tab` vindo da query string é `string` (valores arbitrários possíveis, como no original).
- Erros em `catch` precisavam de narrowing seguro para `response.data.message`.

## 8. Como foram resolvidos

- Genéricos em `api.get` / `api.post` / `api.put` com tipos de união discriminada por `ok`.
- Estados `useState<T>` para formulários, listas e flags.
- `readAxiosResponseMessage` com checagens `typeof` / `in` sobre `unknown` (sem `@ts-ignore`).

## 9. Uso de `any`

- **Não utilizado** como tipo ou “gambiarra”. Ocorrências da palavra `any` no `.tsx` limitam-se ao atributo HTML `step="any"` dos inputs numéricos.

## 10. Confirmação `@ts-ignore` / `@ts-nocheck`

- **Não** foram usados `@ts-ignore` nem `@ts-nocheck` nesta página nem nos tipos adicionados.

## 11. Resultado `cd client && npm run typecheck`

```
> client@0.0.0 typecheck
> tsc --noEmit -p tsconfig.json
```
**Exit code: 0**

## 12. Resultado `cd client && npm run build`

```
> client@0.0.0 build
> vite build
✓ built in ~10s
```
**Exit code: 0**

## 13. Resultado `cd client && npm test`

```
> vitest run
Test Files  40 passed (40)
Tests       254 passed (254)
```
**Exit code: 0**

## 14. Resultado `npm test` (raiz)

- Executa `pretest` (`npm run build:server && npm run build:backend`) e `node scripts/run-node-tests.mjs`.
- **Exit code: 0** (suíte completa + relatório de cobertura ao final).

## 15. Resultado `npm run typecheck:server`

```
> tsc -p tsconfig.server.json --noEmit
```
**Exit code: 0**

## 16. Resultado `npm run build:server`

```
> tsc -p tsconfig.server.json
```
**Exit code: 0**

## 17. Resultado `npm run build:backend`

```
> tsc -p backend/tsconfig.json
```
**Exit code: 0**

## 18. Resultado `docker compose build --no-cache`

```
app  Built
worker  Built
```
**Exit code: 0**

## 19. Confirmação visual

- Nenhum redesign: mesma estrutura de abas, tabelas, modal e classes Tailwind.

## 20. Confirmação `server/` sem `.js` fonte recriado

```bash
find server -name "*.js" -type f -not -path "*/node_modules/*" -not -path "*/dist/*" | sort
```
→ **nenhum arquivo** (lista vazia).

## 21. `.jsx` / `.js` restantes em `client/src/pages/admin`

Após a migração, permanecem **19** arquivos `.jsx` em `client/src/pages/admin` (sem `.js` nesse diretório no nível da pasta):

- `AdminAnalytics.jsx`
- `AdminBackups.jsx`
- `AdminBanners.jsx`
- `AdminBroadcast.jsx`
- `AdminCheckinMilestones.jsx`
- `AdminCreators.jsx`
- `AdminDepositTickets.jsx`
- `AdminFinance.jsx`
- `AdminFraudSignals.jsx`
- `AdminInternalOfferwall.jsx`
- `AdminLogs.jsx`
- `AdminMetrics.jsx`
- `AdminMiners.jsx`
- `AdminMiniPassSeason.jsx`
- `AdminReadEarn.jsx`
- `AdminStreaming.jsx`
- `AdminTransparency.jsx`
- `AdminUserSidebar.jsx`
- `AdminUsers.jsx`

*(Contagem: `find client/src/pages/admin -maxdepth 1 -name "*.jsx"` → 19.)*

## 22. Próxima fatia recomendada

- `AdminMetrics.jsx` ou `AdminTransparency.jsx` (páginas menores), depois `AdminInternalOfferwall.jsx` quando fizer sentido; **não** iniciar migração completa de Users/Miners como próximo passo obrigatório.

## 23. Verificações pós-migração

- `grep -R "AdminOfferEventManage.jsx" client/src` → **sem ocorrências**.
- `grep -rE '@ts-ignore|@ts-nocheck| as any|: any' client/src/pages/admin --include='*.ts' --include='*.tsx'` → **sem matches** (o atributo HTML `step="any"` não corresponde ao padrão `: any` de TypeScript).
