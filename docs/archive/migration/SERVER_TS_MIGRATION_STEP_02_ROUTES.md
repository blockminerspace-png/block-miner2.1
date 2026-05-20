# Server TypeScript migration — Step 02: `server/routes/**/*.ts`

## Summary

- **Arquivos `.js` em `server/routes/` antes da etapa:** 40 (todo o conjunto de rotas Express do servidor principal estava em JavaScript).
- **Estado final:** `find server/routes -name "*.js" -type f` retorna **vazio** (nenhum fonte `.js` duplicado ao lado do `.ts`).
- **Arquivos migrados para `.ts`:** 40 (lista abaixo na seção 2).
- **`@ts-nocheck` / `@ts-ignore`:** não utilizados.
- **`any` explícito em `server/routes/*.ts`:** nenhum (`grep` sem ocorrências).

## 1. Quantidade e inventário

### 1.1 Contagem

| Métrica | Valor |
|--------|------|
| Arquivos `.ts` em `server/routes/` | 40 |
| Arquivos `.js` fonte restantes em `server/routes/` | 0 |

### 1.2 Lista completa dos arquivos `.ts` (ordenada)

`admin-auth.ts`, `admin-auto-mining-rewards.ts`, `admin-logs.ts`, `admin-mini-pass.ts`, `admin-offer-events.ts`, `admin-youtube-stream.ts`, `admin.ts`, `auth.ts`, `auto-mining-gpu.ts`, `broadcast.ts`, `chat.ts`, `checkin.ts`, `daily-tasks.ts`, `deposit-tickets.ts`, `faucet.ts`, `game2048.routes.ts`, `games.ts`, `internal-offerwall.ts`, `inventory.ts`, `machines.ts`, `mining.ts`, `mini-pass.ts`, `notification.ts`, `offer-events.ts`, `ptp.ts`, `racks.ts`, `ranking.ts`, `read-earn.ts`, `rooms.ts`, `session.ts`, `shop.ts`, `shortlink.ts`, `sidebar-nav.ts`, `stats.ts`, `support.ts`, `swap.ts`, `user.ts`, `vault.ts`, `wallet.ts`, `youtube.ts`

### 1.3 Arquivos `.js` restantes em `server/routes/`

Nenhum. Saída compilada permanece apenas em `dist/server/routes/*.js` (esperado).

## 2. Tabela de auditoria (resumo por arquivo)

Legenda **Tipo:** `public` = sem sessão obrigatória para o path; `user` = autenticação típica (`requireAuth` ou equivalente); `admin` = `requireAdminAuth` ou rotas montadas sob admin; `support` = painel suporte; `mixed` = combinação explícita (ex.: endpoint público + outros com auth).

| Arquivo TS | Tipo | Middlewares / gates notáveis | Controllers / handlers | Risco | Status |
|-------------|------|-------------------------------|-------------------------|-------|--------|
| `auth.ts` | public + user | rate limit distribuído, Turnstile, validação Zod, CSRF cookies, `requireAuth` onde aplicável | handlers inline + modelos/serviços | Alto (login/registro) | Migrado |
| `admin.ts` | admin | `requireAdminAuth`, `adminLimiter`, multer upload, error handler de upload | `adminController`, serviços Prisma, backup/fraud | Alto | Migrado |
| `admin-auth.ts` | admin | stack admin existente | `adminAuth` controller | Médio | Migrado |
| `admin-*.ts` (logs, mini-pass, offer-events, youtube-stream, auto-mining-rewards) | admin | `requireAdminAuth` (via router pai) | controllers admin dedicados | Médio | Migrado |
| `wallet.ts`, `user.ts`, `inventory.ts`, `machines.ts`, `mining.ts`, `vault.ts`, `swap.ts`, `shop.ts`, `stats.ts`, `rooms.ts`, `racks.ts`, `daily-tasks.ts`, `mini-pass.ts`, `notification.ts`, `deposit-tickets.ts`, `offer-events.ts`, `ptp.ts`, `chat.ts`, `games.ts`, `game2048.routes.ts`, `sidebar-nav.ts`, `session.ts` | user | `requireAuth`, rate limits onde já existiam | controllers `.js` existentes | Médio | Migrado |
| `checkin.ts`, `faucet.ts`, `shortlink.ts`, `youtube.ts`, `auto-mining-gpu.ts` | user | `requireAuth`, `requireVisibleSidebarPath(sidebarRegistryPath(...))`, limiters | controllers `.js` | Médio | Migrado |
| `internal-offerwall.ts` | mixed | IP limiter, `requireAuth` em writes, sidebar gate | controller `.js` | Médio | Migrado |
| `read-earn.ts` | mixed | sidebar gate; `requireAuth` + limiter no redeem | controller `.js` | Baixo | Migrado |
| `support.ts` | mixed | sidebar gate, limiters, `authenticateTokenOptional` / `requireAuth`, multer | `supportController` | Médio | Migrado |
| `broadcast.ts`, `ranking.ts` | user | `requireAuth` | handlers inline + Prisma | Baixo | Migrado |

*(Demais arquivos da lista da seção 1.2 seguem o mesmo padrão do projeto: import ESM com sufixo `.js`, `Router` Express, middlewares já migrados em `server/middleware/**/*.ts`.)*

## 3. Rotas por visibilidade (agrupamento)

- **Públicas / semi-públicas:** `auth.ts` (register, login, session, forgot password, fluxos sem cookie obrigatório onde já era assim), trechos de `internal-offerwall.ts` e `read-earn.ts` com endpoints públicos preservados.
- **Privadas (utilizador):** maior parte de `wallet`, `user`, `inventory`, `mining`, `checkin`, `faucet`, `tasks`, `shop`, `ranking`, `broadcast`, etc., com `requireAuth` mantido.
- **Admin / suporte:** `admin.ts`, `admin-*.ts`, rotas de suporte em `support.ts` e integrações admin já existentes.

## 4. Middlewares e segurança preservados

- Autenticação: `requireAuth`, `requireAdminAuth`, `authenticateTokenOptional` onde já existia.
- Rate limiting: limiters distribuídos e `createRateLimiter` intactos nas rotas sensíveis (auth, faucet, check-in, shortlink, suporte, etc.).
- Validação: `validateBody` / schemas Zod nas rotas que já usavam.
- Sidebar: `requireVisibleSidebarPath` agora recebe sempre `string` via **`sidebarRegistryPath`** em `server/middleware/sidebarFeatureGate.ts` (erro explícito se path de registry vier vazio — falha de configuração, não silêncio).
- Multer: callbacks e error handlers tipados; `@types/multer` no projeto e no **Dockerfile** para `tsc` na imagem.
- Nenhuma URL de API alterada; nenhum middleware removido “só para compilar”.

## 5. Problemas de tipagem e resolução

| Tema | Resolução |
|------|-----------|
| `string \| null` em paths do registry de sidebar | `sidebarRegistryPath()` exportado ao lado de `requireVisibleSidebarPath` |
| `req.user` opcional após `requireAuth` | Uso de `req.user!` onde o middleware garante utilizador (`broadcast`, `auth` mark-adblock / change-password) |
| `enqueueAuditEvent` exige `prismaOrTx` no tipo | Passagem explícita de `prismaOrTx: prisma` fora de transação; `tx` dentro de `$transaction` |
| Campo `isTwoFactorEnabled` não no tipo Prisma `User` | Leitura via objeto estreito `(user as { isTwoFactorEnabled?: boolean })` sem mudar regra de negócio |
| JWT `expiresIn` / `SignOptions` | `expiresIn` cast para `SignOptions["expiresIn"]`; payload de reset com tipo `JwtPayload & { typ: string }` |
| `admin.ts` erros `unknown` / `{}` | `adminErrMessage`, `prismaErrorCode`, handlers Express tipados, `Prisma.TransactionWhereInput[]` para `AND`/`OR` |
| `ranking` `req.params` e `reduce` | Normalização de `username` para `string`; anotações de acumulador e tipos derivados do resultado Prisma |
| Finance activity `userId` dentro de `OR` com filtros `user` | `userOr` tipado como `Prisma.TransactionWhereInput[]` incluindo `{ userId: uid }` |

## 6. Uso de `any`

Não introduzido em `server/routes/**/*.ts` (verificação por busca).

## 7. Confirmação explícita

- **`@ts-ignore` / `@ts-nocheck`:** não presentes em `server/routes`.
- **Duplicata `.js` + `.ts` no mesmo path em `server/routes/`:** não há.

## 8. Resultados de comandos (executados nesta etapa)

| Comando | Resultado |
|---------|-----------|
| `npm run typecheck:server` | **exit 0** |
| `npm run build:server` | **exit 0** |
| `npm run typecheck` | **exit 0** (inclui `typecheck:backend`) |
| `npm run build:backend` | **exit 0** |
| `node --test tests/httpErrors.test.mjs` | **exit 0** (1 suite, 1 teste) |
| `find server/routes -name "*.js" -type f \| sort` | *(vazio)* |
| `find server/routes -name "*.ts" -type f \| sort` | 40 ficheiros (lista na §1.2) |
| `find dist/server/routes -name "*.js" -type f \| sort` | 40 ficheiros `.js` gerados em `dist/server/routes/` |
| `docker compose build --no-cache` | **exit 0** (`app` e `worker` construídos; passo `tsc` com `@types/multer` incluído) |

## 9. Testes completos (`npm test`)

`npm test` **falhou** com falhas já conhecidas fora do âmbito desta etapa de rotas, por exemplo:

- `tests/ipIntelligenceService.test.mjs` (asserção `providerType` / `unknown` vs `residential`).
- `tests/registerBodySchema.test.mjs` (validação de `refCode`).

Não foram atribuídas a alterações em `server/routes/*.ts` (schemas/controllers de registro e serviço de IP não foram objeto desta etapa).

## 10. Docker / runtime

- **Build:** sucesso com `typescript` + pacotes `@types/*` incluindo **`@types/multer@1.4.12`** na linha `npm install --no-save` do `Dockerfile` (alinhado ao `tsc` em imagem).
- **`docker compose up`:** não executado aqui (depende de `.env`, Postgres, Redis e risco de ambiente); o utilizador pode subir localmente quando seguro.
- **Entry:** mantém-se `CMD ["node", "dist/server/server.js"]`.

## 11. Pendências — próxima etapa (não executar agora)

- Migrar **`server/controllers/**/*.js`** para TypeScript (etapa 03), mantendo `allowJs` até lá.
- Opcional: alinhar modelo Prisma / campo real se `isTwoFactorEnabled` existir na base mas ainda não estiver no `schema.prisma` (fora do escopo desta etapa).

## 12. Alterações de suporte mínimas (fora de `server/routes/`)

- `server/middleware/sidebarFeatureGate.ts`: função `sidebarRegistryPath`.
- `Dockerfile`: `@types/multer` no install efémero do `tsc`.
- `package.json`: `@types/multer` em devDependencies (já presente na árvore do projeto).

---

*Documento gerado como parte da etapa 02 (rotas).*
