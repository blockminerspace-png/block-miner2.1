# MONOLITH ADMIN MINERS MODULE STEP 01

Relatório de fechamento do módulo **Admin Miners** (backend + frontend + testes), sem alterar Wallet.

**Checkpoint git local:** `edefc516` (alterações desta etapa ainda não commitadas).

---

## 1. Estado inicial do módulo Admin Miners

- Backend já tinha pasta `server/modules/admin-miners/` com controller, routes, service, dto, errors e types.
- **Gap:** `adminMiners.repository.ts` e `adminMiners.schemas.ts` apenas reexportavam `server/services/adminMinersService.ts` (~430 linhas de Prisma/validação fora do módulo).
- Frontend tinha API/types em `client/src/pages/admin/miners/`, mas `AdminMinersPage.tsx` era só reexport de `../AdminMiners` (~770 linhas na raiz `admin/`).
- Testes: `tests/admin/miners/adminMinersRoutes.test.mjs` parcial; sem teste de página nem validação 503 no client.

---

## 2. Arquivos encontrados antes

**Backend**

- `server/modules/admin-miners/*` (9 arquivos)
- `server/services/adminMinersService.ts` (fonte real de queries)
- `server/routes/admin.ts` monta `adminMinersRouter` após `requireAdminAuth` + `adminLimiter`

**Frontend**

- `client/src/pages/admin/AdminMiners.tsx` (UI monolítica)
- `client/src/pages/admin/miners/adminMiners.api.ts`, `adminMiners.types.ts`, `adminMiners.hooks.ts` (`export {}`)

**Testes**

- `tests/admin/miners/adminMinersRoutes.test.mjs`
- `tests/adminMinersService.test.mjs`
- `tests/adminMinersUiSecurity.test.mjs`

---

## 3. Nova estrutura backend

```txt
server/modules/admin-miners/
  index.ts
  adminMiners.routes.ts
  adminMiners.controller.ts
  adminMiners.service.ts
  adminMiners.repository.ts    ← Prisma + regras de catálogo (antes em adminMinersService)
  adminMiners.schemas.ts       ← parse query/body + validateMinerImageUrl + minerSelect
  adminMiners.dto.ts
  adminMiners.types.ts
  adminMiners.errors.ts
```

`server/services/adminMinersService.ts` permanece como **facade de compatibilidade** (reexporta schemas + repository) para testes legados (`tests/adminMinersService.test.mjs`).

---

## 4. Nova estrutura frontend

```txt
client/src/pages/admin/miners/
  AdminMinersPage.tsx           ← UI completa (movida de AdminMiners.tsx)
  adminMiners.api.ts
  adminMiners.types.ts
  adminMiners.hooks.ts          ← useAdminMinersList (debounce, abort, erro 503)
  adminMiners.validation.ts
  adminMiners.api.test.ts
  adminMiners.validation.test.ts
  AdminMinersPage.test.tsx
  components/AdminMinersError.tsx
  index.ts

client/src/pages/admin/AdminMiners.tsx  → barrel: export { default } from './miners/AdminMinersPage'
```

Componentes granulares (`AdminMinersTable`, `AdminMinerForm`, etc.) **não foram extraídos** para evitar redesenho/refactor visual; a tela permanece uma página, com erro 503 isolado em componente.

---

## 5. Rotas preservadas

Montagem em `server/routes/admin.ts`: `adminRouter.use(adminMinersRouter)` após auth admin.

| Método | Rota |
|--------|------|
| GET | `/api/admin/miners` |
| POST | `/api/admin/miners` |
| POST | `/api/admin/miners/upload-image` |
| GET | `/api/admin/miners/:id` |
| PATCH/PUT | `/api/admin/miners/:id` |
| POST | `/api/admin/miners/:id/duplicate` |
| POST | `/api/admin/miners/:id/archive` |
| POST | `/api/admin/miners/:id/toggle-store` |
| POST | `/api/admin/miners/:id/toggle-active` |

---

## 6. Endpoints testados

| Cenário | Resultado esperado |
|---------|-------------------|
| GET `/api/admin/miners` sem cookie admin | 401/403, não 500 |
| GET com `filter=all&sort=recent` | 200 (com DB migrado) ou 503 schema |
| Query inválida (`page=bad`) | 400 `ADMIN_MINERS_INVALID_QUERY` |
| Schema desatualizado (coluna ausente) | 503 `ADMIN_MINERS_SCHEMA_OUT_OF_DATE` |

---

## 7. Query params suportados

- **page:** default 1, mínimo 1; inválido → `invalid_pagination` → 400.
- **limit:** default 25, máximo 100.
- **q / search:** até 120 chars.
- **filter:** `all`, `active`, `inactive`, `store`, `hidden`, `free`, `paid`, `reward`, `shortlink`, `faucet`, `admin`, `event`, tiers, `archived`, `slots_N`; desconhecido → `all`.
- **sort:** `recent`, `oldest`, `name`, `price_asc`, `price_desc`, `power_asc`, `power_desc`, `hashrate_asc`, `hashrate_desc`, `sold`, `value`; desconhecido → `recent`.

---

## 8. DTOs criados/revisados

- `adminMiners.dto.ts`: `toAdminMinerListRow`, `toAdminMinersListResponse`.
- Serializa `price`, `baseHashRate`/`power`/`hashRate` como **string**.
- `Date` → ISO string.
- Aliases: `isVisible`, `isStoreItem`, `salesCount` (de `stockSold`).
- Não expõe campos sensíveis (`passwordHash`, etc.).

---

## 9. Schemas criados/revisados

- `adminMiners.schemas.ts`: `parseAdminMinerQuery`, `parseMinerWriteBody`, `validateMinerImageUrl`, `minerSelect`.
- Validação de slug, tier, source, metadata, imagem, paginação.

---

## 10. Prisma / select / orderBy

- `minerSelect()` alinhado ao model `Miner` (incl. `longDescription`, `tier`, `stockSold`, etc.).
- `buildWhere` + `orderBy` tipados com `Prisma.MinerWhereInput` / `MinerOrderByWithRelationInput[]`.
- Listagem **sem** `_count.userOwnedMachines` por linha (usa `stockSold`).

---

## 11. Tratamento de schema desatualizado

- `isPrismaSchemaMismatch()` em `adminMiners.errors.ts` (P2021/P2022 ou mensagem “does not exist in the current database”).
- Controller retorna **503** com `code: ADMIN_MINERS_SCHEMA_OUT_OF_DATE` e mensagem segura (sem stack).
- Frontend: banner `AdminMinersError` com texto  
  *“Catálogo indisponível: o banco ainda precisa da migration do catálogo de mineradoras.”*  
  + botão “Tentar novamente”.

Migration crítica: `20260424170000_admin_miner_catalog`.

---

## 12. Correções de frontend

- Página em `miners/AdminMinersPage.tsx`; rota `/admin/miners` inalterada via barrel.
- Hook `useAdminMinersList`: debounce 250ms, cancelamento de request anterior, estado `listError`.
- Imagens da tabela com `loading="lazy"`.
- API centralizada em `adminMiners.api.ts` (sem `api.get` espalhado na página).

---

## 13. Correções de performance

- Sem `_count` na listagem.
- Paginação real (`skip`/`take` + `total`/`totalPages`).
- Abort de fetch ao mudar filtro/busca/sort/página.

---

## 14. Testes criados/ajustados

| Arquivo | Cobertura |
|---------|-----------|
| `tests/admin/miners/adminMinersRoutes.test.mjs` | rotas, DTO, schema mismatch, parse query, normalização filter/sort |
| `tests/adminMinersService.test.mjs` | CRUD/list via facade (inalterado, importa facade) |
| `tests/adminMinersUiSecurity.test.mjs` | lê `AdminMinersPage.tsx`, upload endpoint, mount auth |
| `client/.../adminMiners.api.test.ts` | params GET, toggle-store |
| `client/.../adminMiners.validation.test.ts` | 503 + mensagem |
| `client/.../AdminMinersPage.test.tsx` | render OK + banner 503 |

---

## 15–22. Validação obrigatória (2026-05-17, sessão atual)

| Comando | Resultado |
|---------|-----------|
| `cd client && npm run typecheck` | **OK** |
| `cd client && npm run build` | **OK** (warnings Rollup/chunks grandes — pré-existentes) |
| `cd client && npm test` | **OK** — 48 arquivos, **285** testes |
| `npm test` (raiz) | **OK** |
| `npm run typecheck:server` | **OK** |
| `npm run build:server` | **OK** |
| `npm run build:backend` | **OK** |
| `docker compose build app` | **OK** (build com cache; `--no-cache` não reexecutado nesta sessão) |

---

## 23. Teste manual

- **Não executado** nesta sessão (sem VM/login admin ativo no agente).
- Produção anterior (checkpoint `edefc516`): `/admin/miners` → 200; `/api/admin/miners` sem cookie → 401.
- Após deploy destas alterações: repetir login admin → listagem, filtros, busca, paginação; se DB sem migration → banner 503.

---

## 24. `server/` sem `.js` fonte

```bash
find server -name "*.js" -type f \
  -not -path "server/node_modules/*" \
  -not -path "server/dist/*"
# (vazio)
```

---

## 25. `client/src` sem `.js/.jsx`

```bash
find client/src \( -name "*.js" -o -name "*.jsx" \) -type f
# (vazio)
```

---

## 26. `@ts-ignore` / `any` no módulo

`grep` em `server/modules/admin-miners` e `client/src/pages/admin/miners` — **sem ocorrências** de `@ts-ignore`, `@ts-nocheck`, `as any`, `: any`.

---

## 27. Correção real do upload e preview de imagem (2026-05-19)

### 1. Causa real da imagem placeholder aparecer

| # | Causa | Efeito |
|---|--------|--------|
| 1 | `express.static('/uploads')` com **fallthrough** default (`true`) | Ficheiro inexistente → SPA devolvia `index.html` → `<img>` falhava → UI mostrava logo |
| 2 | `onError` no preview/tabela trocava silenciosamente para `/icon.png` | Parecia “logo BlockMiner” mesmo com `imageUrl` correto no input |
| 3 | Upload imediato revogava `objectURL` antes do remoto carregar | Preview saltava para URL remota que ainda podia falhar |
| 4 | `PATCH` com `imageUrl: ''` | Podia limpar imagem em edições sem intenção (corrigido antes; mantido) |
| 5 | Placeholder `/icon.png` aceite como URL persistível | Risco de gravar logo no banco |

### 2. Ficheiro no disco / pasta

- **Sim**, o upload grava em `uploads/miners/` (volume Docker `./uploads:/app/uploads`).
- Nome gerado no servidor: `miner-<timestamp>-<random>.{jpg|png|webp}` (ignora nome original para path).

### 3. `/uploads/miners/...` antes vs depois

- **Antes:** 404 ou HTML do SPA (fallthrough) → preview quebrado.
- **Depois:** `fallthrough: false` + `index: false` em `server/server.ts` → 404 real se faltar ficheiro; preview mostra **“Imagem não carregou”** em vez de logo.

### 4. Campo no banco

- `Miner.imageUrl` (string, path público relativo ou URL https externa válida).

### 5. Campo no frontend

- `form.imageUrl` — só URL real persistível (`normalizePersistableMinerImageUrl`).
- `selectedImageFile` — ficheiro pendente até **Salvar** (multipart no PATCH/POST).
- Placeholder **só** em render (`ADMIN_MINER_IMAGE_PLACEHOLDER`), nunca no payload.

### 6. FormData

- `buildAdminMinerFormData` / `createAdminMiner` / `updateAdminMiner` enviam multipart com campo **`image`** quando há ficheiro.
- Sem header `Content-Type` manual (boundary automático do axios).
- `POST /api/admin/miners/upload-image` mantido para upload antecipado opcional.

### 7–8. Armazenamento e URL pública

- Disco: `{UPLOADS_DIR}/miners/<arquivo>` (default `uploads/miners/`).
- URL: `/uploads/miners/<arquivo>`.

### 9. Servir `/uploads`

```ts
app.use("/uploads", express.static(UPLOADS_STATIC_ROOT, { index: false, fallthrough: false }));
```

Antes do fallback SPA (`attachSpaFallback`).

### 10. Ordem do preview

1. `URL.createObjectURL(file)` se ficheiro selecionado.
2. `imageUrl` real do formulário/BD (+ cache bust opcional).
3. Placeholder visual `/icon.png` só se não há URL.
4. Se URL existe mas falha: mensagem **“Imagem não carregou”** (sem substituir por logo).

### 11. Edição sem imagem nova

- `preserveImageUrlRef` + schema: `imageUrl` vazio no PATCH **não** apaga.
- `normalizePersistableMinerImageUrl` impede reenviar placeholder.

### 12–13. Segurança

- MIME: `image/png`, `image/jpeg`, `image/webp` apenas; SVG/HTML bloqueados.
- Tamanho máx. 5 MB.
- `path.basename` no nome final; rejeita `..` e `javascript:`.
- `isPlaceholderMinerImageUrl` bloqueia persistir logo.

### 14. Testes

- `tests/admin/miners/adminMinerImageUpload.test.mjs`
- `client/src/pages/admin/miners/adminMiners.image.test.ts`
- `client/src/pages/admin/miners/adminMiners.api.test.ts`
- `client/src/pages/admin/miners/components/AdminMinerImageInput.test.tsx`

### 15. Comandos (ambiente local)

| Comando | Resultado |
|---------|-----------|
| `node --test tests/admin/miners/adminMinerImageUpload.test.mjs` | **7/7 OK** |
| `tsc -p client/tsconfig.json` | **OK** (sem erros no módulo miners) |
| `npm test` / vitest miners | requer `jsdom` no ambiente CI/local completo |

### 16. Teste manual

Pendente pós-deploy: fluxo em `/admin/miners` → editar → GPU → salvar → `curl -I https://blockminer.space/uploads/miners/<file>` → 200.

### 17–18. Sem `.js` fonte

- `server/modules/admin-miners/` — apenas `.ts`.
- `client/src/pages/admin/miners/` — apenas `.ts` / `.tsx`.

---

## 28. Correção de tamanho/preview da imagem da mineradora (2026-05-19)

### 1. Causa real da imagem minúscula

- Preview usava classes fixas **`h-24 w-24` (96px)** dentro de caixas muito maiores (`Preview`, `Preview loja`, tabela).
- Placeholder e imagem real partilhavam o mesmo tamanho reduzido; GPU ficava “perdida” no centro.
- Loja pública (`ShopPage`) já usava `w-full h-full object-contain` em `aspect-square` — OK.

### 2. Componentes

- `components/AdminMinerImage.tsx` — renderização unificada (`form` | `table` | `shop`).
- `components/AdminMinerPreview.tsx` — label + frame do preview no formulário.
- `AdminMinerImageInput.tsx` — passa a usar `AdminMinerPreview`.

### 3. CSS

| Variante | Frame | Imagem real |
|----------|-------|-------------|
| `form` | `min-h-[180px] h-[200px] w-full` | `h-full w-full object-contain object-center` |
| `table` | preenche célula `h-16` | `h-full w-full object-contain` |
| `shop` | `min-h-[140px]` no drawer | `h-full w-full object-contain` |

Placeholder: ícone pequeno (`h-14` / `h-8`) com opacidade reduzida — **não** o mesmo tamanho da imagem real.

### 4. Ordem do preview

1. `objectURL` do ficheiro selecionado  
2. `imageUrl` real (+ cache bust)  
3. Placeholder visual  
4. Erro “Imagem não carregou” se URL falhar (sem trocar por logo)

### 5. Backend

- **Sem** `sharp` no projeto — não foi adicionada normalização de thumbnail nesta etapa.
- Upload seguro mantido (`uploadsRoot`, MIME, 5MB, `/uploads/miners/...`).

### 6. Loja pública

- `ShopPage` inalterada (layout já correto); usa `imageUrl` do catálogo.

### 7. Testes

- `AdminMinerImage.test.tsx`, `AdminMinerPreview.test.tsx`
- `adminMinerImageUpload.test.mjs` — rejeita `h-24 w-24` no preview principal

### 8. Validação

- `node --test tests/admin/miners/adminMinerImageUpload.test.mjs` — OK
- `tsc` client + server — OK

---

## 29. Próximo módulo recomendado

**Wallet** — explicitamente adiado até Admin Miners fechado.  
Após deploy desta etapa, seguir `MONOLITH_WALLET_MODULE_STEP_01.md` com o mesmo padrão (módulo em `server/modules/wallet/`, pasta `client/src/pages/wallet/`, testes em `tests/wallet/`).

---

## Critério de aceite (checklist)

- [x] Backend Admin Miners em módulo próprio (lógica Prisma em `repository` + `schemas`)
- [x] Frontend em `client/src/pages/admin/miners/`
- [x] `/admin/miners` preservado (barrel `AdminMiners.tsx`)
- [x] 503 schema + 400 query inválida (não 500 opaco)
- [x] DTO seguro
- [x] Testes passando
- [x] Docker build `app` OK
- [x] Sem `.js` fonte em `server/` e `client/src`
- [x] Relatório atualizado
- [ ] Commit/push (aguardando pedido do usuário)
- [ ] Teste manual autenticado pós-deploy
