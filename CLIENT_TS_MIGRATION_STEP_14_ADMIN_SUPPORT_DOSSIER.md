# Client TypeScript migration — Step 14 (Admin Support — Player Dossier)

## Auditoria inicial (resumo)

| Arquivo atual | Tipo | Migrar para | Props / dados | API | Risco | Status |
|----------------|------|-------------|-----------------|-----|-------|--------|
| `AdminSupportPlayerDossier.jsx` | component | `AdminSupportPlayerDossier.tsx` | `bundle`, `loading`, `error`, `params`, `onParamsChange`, `onRetry` | Consumo apenas via props (fetch em `AdminSupport.jsx`) | Médio (muitos subcampos) | **Migrado** |
| `AdminSupportPlayerDossier.test.jsx` | test | `AdminSupportPlayerDossier.test.tsx` | `resolveAdminAssetUrl` | N/A | Baixo | **Migrado** |
| `admin.types.ts` | types | Ampliado | Tipos dossier / params / bundle | Alinhado a `supportPlayerDossierService` | Baixo | **Atualizado** |

Comandos executados antes da implementação:

- `find client/src/pages/admin/components -iname "*Dossier*" -type f | sort`
- `grep -R "AdminSupportPlayerDossier" client/src` (import em `AdminSupport.jsx` sem extensão)

---

## 1. Estado inicial — `AdminSupportPlayerDossier.jsx`

Componente em JSX (~688 linhas): props documentadas em JSDoc; `resolveAdminAssetUrl` exportada; subfunções `DossierPagedTable`, `Pager`, `DossierMachineGrid`, `DossierMachineCard` (as duas últimas não referenciadas no JSX principal, igual ao arquivo original).

## 2. Estado final — `AdminSupportPlayerDossier.tsx`

Mesmo markup e fluxos (loading, erro, não vinculado, órfão, dossiê completo, tabelas paginadas, miners, colisões de conta). Tipagem explícita de props, handlers e tabelas genéricas (`DossierPagedTable<Row>`). `resolveAdminAssetUrl` mantida com assinatura estrita. Atributos `title` de células ajustados para `string | undefined` (compatível com React), sem mudar texto visível.

## 3. Teste — inicial e final

- **Inicial:** `AdminSupportPlayerDossier.test.jsx` — três casos para `resolveAdminAssetUrl`.
- **Final:** `AdminSupportPlayerDossier.test.tsx` — mesmos asserts; import `./AdminSupportPlayerDossier` sem extensão.

## 4. Props tipadas

Definido em `admin.types.ts`:

- `AdminSupportPlayerDossierProps`: `bundle`, `loading`, `error`, `params`, `onParamsChange`, `onRetry`.

## 5. Tipos criados ou ampliados em `admin.types.ts`

Incluem, entre outros:

- `AdminSupportPlayerDossierParams` — espelha paginação do servidor (`limit`, `depositsPage`, …, `vaultPage`).
- `AdminSupportPlayerDossierBundle` — corpo de sucesso do GET player-dossier (`ok`, `linked`, `orphanTicket?`, `dossier`).
- `AdminSupportPlayerDossierData`, `AdminSupportDossierSummary`, `AdminSupportDossierAccountCollisions` e tipos de linhas paginadas (depósitos, CC Payment, tickets, saques, payouts, miners, máquinas inventory/vault).
- `AdminSupportDossierPaged<T>`.

## 6. APIs envolvidas

Nenhuma chamada HTTP foi adicionada ou alterada neste componente. O endpoint continua sendo chamado em `AdminSupport.jsx`: `GET /admin/support/:id/player-dossier` com `params` de paginação.

## 7. Arquivos alterados

| Ação | Caminho |
|------|---------|
| Criado | `client/src/pages/admin/components/AdminSupportPlayerDossier.tsx` |
| Removido | `client/src/pages/admin/components/AdminSupportPlayerDossier.jsx` |
| Criado | `client/src/pages/admin/components/AdminSupportPlayerDossier.test.tsx` |
| Removido | `client/src/pages/admin/components/AdminSupportPlayerDossier.test.jsx` |
| Alterado | `client/src/pages/admin/admin.types.ts` |

Import em `AdminSupport.jsx` permanece `./components/AdminSupportPlayerDossier` (sem extensão).

## 8. Problemas de tipagem encontrados

- `title` em `<td>`: valores `string | null | undefined` não aceitos como `string | undefined` pelo tipo do React.

## 9. Como foram resolvidos

Uso de `title={row.walletAddress ?? undefined}` e `title={row.address ?? undefined}` para satisfazer o tipo sem alterar o comportamento quando o valor existe.

## 10. Uso de `any`

**Não foi necessário** `any`, `as any`, nem `Record<string, any>`.

## 11. `@ts-ignore` / `@ts-nocheck`

**Não utilizados.** (`grep` em `client/src/pages/admin/**/*.ts(x)` sem ocorrências.)

## 12. `cd client && npm run typecheck`

Sucesso (exit code 0).

## 13. `cd client && npm run build`

Sucesso — `vite build` concluído (exit code 0).

## 14. `cd client && npm test`

Sucesso — **40** arquivos de teste, **254** testes (exit code 0).

## 15. `npm test` (raiz)

Sucesso (exit code 0), incluindo `pretest` → `build:server` / `build:backend` e `node scripts/run-node-tests.mjs`.

## 16. `npm run typecheck:server`

Sucesso (exit code 0).

## 17. `npm run build:server`

Sucesso (exit code 0).

## 18. `npm run build:backend`

Sucesso (exit code 0).

## 19. `docker compose build --no-cache`

Sucesso (exit code 0).

## 20. Visual / textos / rotas

Nenhum redesenho, mudança de copy, de rota ou de endpoint.

## 21. Fonte `.js` em `server/`

`find server -name "*.js" …` excluindo `node_modules` e `dist`: **nenhum** arquivo listado (projeto servidor em TypeScript).

## 22. `.jsx` / `.js` restantes em `client/src/pages/admin`

**22** páginas `Admin*.jsx` (incluindo `AdminSupport.jsx`). Nenhum `AdminSupportPlayerDossier.jsx` remanescente.

## 23. Próxima fatia recomendada

Migrar `AdminSupport.jsx` para `AdminSupport.tsx` com tipagem de mensagens, anexos e estado do dossiê, **ou** continuar com páginas Admin menores isoladas antes da página Support completa.

---

## Verificações adicionais solicitadas

```bash
find client/src/pages/admin/components -iname "*Dossier*" -type f | sort
# → AdminSupportPlayerDossier.test.tsx, AdminSupportPlayerDossier.tsx

grep -R "AdminSupportPlayerDossier.jsx" client/src …
# → sem ocorrências
```
