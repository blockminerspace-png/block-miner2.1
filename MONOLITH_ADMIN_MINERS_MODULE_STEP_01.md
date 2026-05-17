# MONOLITH ADMIN MINERS MODULE STEP 01

## Correção do 500 em `/api/admin/miners`

1. **Causa real do 500**
   - Em produção, `GET /api/admin/miners?page=1&limit=25&filter=all&sort=recent` retornava 500 após aproximadamente 10s.
   - Log real capturado: `[admin miners error] timeout exceeded when trying to connect`.
   - No mesmo período havia múltiplos erros de conexão Prisma/PG no app (`timeout exceeded when trying to connect`) em endpoints autenticados e workers, indicando saturação/indisponibilidade de conexão com o banco.
   - A listagem de mineradoras ainda fazia `_count.userOwnedMachines` em cada linha, o que deixava a tela administrativa mais cara que o necessário e mais sensível a pool/DB sob carga.

2. **Stack/erro interno encontrado, sem secrets**
   - `PrismaPgAdapter.queryRaw`
   - `@prisma/client/runtime/client.js`
   - `pg-pool/index.js`
   - Mensagem: `timeout exceeded when trying to connect`
   - Nenhum segredo foi exposto no relatório ou nos logs copiados.

3. **Arquivo e linha corrigidos**
   - `server/services/adminMinersService.ts`
     - Normalização segura de `filter` e `sort`.
     - Suporte a `oldest`, `power_asc`, `power_desc`.
     - Remoção de `_count.userOwnedMachines` da listagem principal.
     - Inclusão de `totalPages`.
   - `server/routes/admin.ts`
     - Removidas rotas inline de mineradoras.
     - Montado `adminMinersRouter` após `requireAdminAuth` e `adminLimiter`.
   - `server/modules/admin-miners/*`
     - Criado módulo monolito modular para Catálogo de Mineradoras.
   - `client/src/pages/admin/AdminMiners.tsx`
     - Centralizadas chamadas no API module.
     - Adicionado abort/cancel de request anterior para evitar request concorrente em busca/filtro.

4. **Estrutura backend criada/organizada**
   - `server/modules/admin-miners/adminMiners.routes.ts`
   - `server/modules/admin-miners/adminMiners.controller.ts`
   - `server/modules/admin-miners/adminMiners.service.ts`
   - `server/modules/admin-miners/adminMiners.repository.ts`
   - `server/modules/admin-miners/adminMiners.schemas.ts`
   - `server/modules/admin-miners/adminMiners.dto.ts`
   - `server/modules/admin-miners/adminMiners.types.ts`
   - `server/modules/admin-miners/adminMiners.errors.ts`
   - `server/modules/admin-miners/index.ts`

5. **Estrutura frontend criada/organizada**
   - `client/src/pages/admin/miners/AdminMinersPage.tsx`
   - `client/src/pages/admin/miners/adminMiners.api.ts`
   - `client/src/pages/admin/miners/adminMiners.types.ts`
   - `client/src/pages/admin/miners/adminMiners.hooks.ts`
   - `client/src/pages/admin/miners/index.ts`
   - `client/src/pages/admin/miners/adminMiners.api.test.ts`

6. **Rotas preservadas**
   - `GET /api/admin/miners`
   - `POST /api/admin/miners`
   - `POST /api/admin/miners/upload-image`
   - `GET /api/admin/miners/:id`
   - `PATCH /api/admin/miners/:id`
   - `PUT /api/admin/miners/:id`
   - `POST /api/admin/miners/:id/duplicate`
   - `POST /api/admin/miners/:id/archive`
   - `POST /api/admin/miners/:id/toggle-store`
   - `POST /api/admin/miners/:id/toggle-active`

7. **Query params suportados**
   - `page`, `limit`, `q`, `search`, `filter`, `sort`.
   - Filtros: `all`, `active`, `inactive`, `store`, `hidden`, `free`, `paid`, `reward`, `shortlink`, `faucet`, `admin`, `event`, `common`, `uncommon`, `rare`, `epic`, `legendary`, `special`, `archived`, `slots_N`.
   - Sorts: `recent`, `oldest`, `name`, `price_asc`, `price_desc`, `power_asc`, `power_desc`, `hashrate_asc`, `hashrate_desc`, `sold`, `value`.
   - Filtro/sort desconhecido é normalizado para `all`/`recent`, sem gerar 500.

8. **DTO criado/revisado**
   - `adminMiners.dto.ts` serializa linha segura para listagem.
   - Mantém compatibilidade com `baseHashRate`, `showInShop`, `isStoreVisible`, `stockSold`.
   - Expõe aliases seguros `power`, `hashRate`, `isVisible`, `isStoreItem`, `salesCount`.

9. **Schemas criados/revisados**
   - `adminMiners.schemas.ts` centraliza parse de query/body e validação de imagem usando regras existentes.

10. **Prisma fields corrigidos**
   - Listagem usa campos reais do model `Miner`: `id`, `name`, `slug`, `baseHashRate`, `price`, `slotSize`, `imageUrl`, `tier`, `sourceType`, `isActive`, `showInShop`, `isArchived`, `stockSold`, `createdAt`, `updatedAt`.
   - Removido `_count.userOwnedMachines` da listagem principal para reduzir custo.

11. **Serialização Decimal/BigInt/Date**
   - `price` é serializado como string no DTO modular.
   - `baseHashRate/hashRate/power` são serializados como string no DTO modular.
   - `Date` é serializado como ISO string.
   - Não há BigInt no DTO da listagem atual.

12. **Correções de performance/lentidão**
   - Removido count relacional por linha na listagem.
   - Mantida paginação com `take/skip`.
   - Frontend cancela request anterior quando busca/filtro/sort mudam.
   - Busca mantém debounce existente de 250ms.

13. **Testes criados/ajustados**
   - `tests/admin/miners/adminMinersRoutes.test.mjs`
   - `client/src/pages/admin/miners/adminMiners.api.test.ts`
   - `tests/adminMinersService.test.mjs`
   - `tests/adminMinersUiSecurity.test.mjs`

14. **Resultado de `GET /api/admin/miners?page=1&limit=25&filter=all&sort=recent`**
   - Produção antes da correção: HTTP 500, log interno `timeout exceeded when trying to connect`.
   - Validação local direta não foi executada porque não havia container local rodando na porta 3000 no início da investigação.
   - Após deploy na VM, chamada pública sem cookie admin retornou HTTP 401 seguro:
     `{"ok":false,"code":"ADMIN_SESSION_INVALID","message":"Admin session invalid."}`.
   - Log pós-deploy: `/api/admin/miners?page=1&limit=25&filter=all&sort=recent` respondeu `401` em `0.891ms`, sem 500.
   - A validação autenticada da listagem exige sessão admin do navegador.

15. **Resultado de `cd client && npm run typecheck`**
   - Passou.

16. **Resultado de `cd client && npm run build`**
   - Passou.
   - Warnings existentes de Rollup/Reown e chunks grandes permanecem.

17. **Resultado de `cd client && npm test`**
   - Passou: 46 arquivos, 282 testes.

18. **Resultado de `npm test`**
   - Passou: 483 testes.

19. **Resultado de `npm run typecheck:server`**
   - Passou.

20. **Resultado de `npm run build:server`**
   - Passou.

21. **Resultado de `npm run build:backend`**
   - Passou.

22. **Resultado de `docker compose build --no-cache`**
   - Passou: imagens `app` e `worker` built.
   - Warnings não bloqueantes:
     - Docker buildx/Bake indisponível.
     - Dockerfile alerta sobre ARG/ENV `VITE_TURNSTILE_SITE_KEY*`.
     - npm peer/deprecated warnings existentes.

23. **Resultado do teste manual**
   - Não executei criação/edição manual local porque não havia ambiente local rodando e não rodei fluxo destrutivo/alteração de dados.
   - Deploy em produção executado por ZIP para `/root/block-miner`, preservando `.env`, `.env.production`, `.env.production.vm-backup` e `deploy.secrets.local`.
   - `docker compose --env-file .env.production build --no-cache app worker` passou na VM.
   - `docker compose --env-file .env.production up -d --no-deps app worker` recriou apenas `app` e `worker`.
   - `https://blockminer.space/health` retornou HTTP 200.
   - `https://blockminer.space/api/admin/miners?page=1&limit=25&filter=all&sort=recent` sem cookie retornou HTTP 401 seguro, não 500.
   - Teste autenticado no navegador ainda depende de sessão admin ativa.

24. **Confirmação de que nenhum `.js` fonte foi recriado em `server/`**
   - Confirmado por `find`: nenhum `.js` fonte em `server/` fora de exclusões.

25. **Confirmação de que `client/src` continua sem `.js/.jsx`**
   - Confirmado por `find`: nenhum `.js/.jsx` em `client/src`.

26. **Próximo módulo recomendado**
   - Modularizar `admin-users` ou `admin-finance`, porque ambos ainda concentram rotas administrativas extensas e sensíveis em `server/routes/admin.ts`.
