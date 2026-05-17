# BlockMiner — Auth: login/register errors & 2FA (Step 01)

## Correção do erro genérico “Login falhou”

### 1. Causa real do erro mostrado na tela

- O `catch` do `loginPost` no backend devolvia **`500` + `message: "Login failed."`** (`code: LOGIN_FAILED`) para **qualquer exceção** no fluxo, **sem log estruturado**, escondendo falhas reais (Prisma, rede, etc.).
- No frontend, o fallback **`auth.login.errors.login_failed`** (“Login falhou.”) era usado quando não havia `code` mapeado ou corpo útil, e o fluxo **2FA por e-mail** ainda era descrito como “Authenticator”, gerando confusão.

### 2. Status HTTP e body antes da correção (referência de código)

| Situação | Antes (resumo) |
|----------|----------------|
| Usuário inexistente | `401` + `code: IDENTIFIER_NOT_FOUND` + mensagem **“Email ou username não existe.”** (enumeração de conta) |
| Senha errada | `401` + `INVALID_CREDENTIALS` + “Invalid credentials.” |
| Exceção no handler | `500` + `LOGIN_FAILED` + “Login failed.” |
| 2FA necessário | `200` + `require2FA` + `twoFactorChallengeToken` + mensagem genérica em inglês |
| 2FA inválido | `401` + mensagem curta sem `error` duplicado |

### 3. Mensagem exibida antes (exemplos)

- Genérico: **“Login falhou.”** / `Login failed.`
- Conta inexistente: **“Email ou username não existe.”** (indesejável do ponto de vista de enumeração)
- 2FA: texto fixo **“Insira o código do seu Authenticator.”** mesmo para **e-mail**

### 4. Mensagem exibida depois (comportamento alvo)

- Credenciais inválidas (usuário inexistente **ou** senha errada): mesma mensagem segura (**“Credenciais inválidas…”** via i18n + API alinhada).
- 2FA e-mail: título/subtítulo por **`twoFactorMethod`** + toast **`auth.login.two_factor_email_hint`**.
- Erro interno: **`auth.login.errors.internal_error`** (mapeamento de `INTERNAL_ERROR`) em vez de “Login failed.”.
- Códigos 2FA inconsistentes (código sem challenge, etc.): mensagens dedicadas (`TWO_FACTOR_CHALLENGE_REQUIRED`, `TWO_FACTOR_CODE_REQUIRED`).

### 5. Como o frontend lê erro da API agora

- Novo helper **`readAuthErrorMessage`** em `client/src/pages/auth/shared/auth.errors.ts`: lê `errors[0].message` (validação Zod), depois **`message`**, depois **`error`**, depois fallbacks por **status** (`429`, `401` sem corpo).
- **`LoginPage`**: ordem **campo Zod** → **`messageKey` de segurança** (`errors.security.*`) → **mapa por `code`** → **texto da API** (`readAuthErrorMessage`) → **`auth.login.errors.generic_fallback`** (substitui o antigo “Login falhou” como último recurso).
- **`useAuthStore.login`**: usa `readAuthErrorMessage` + `i18n.t('auth.login.errors.generic_fallback')` para o estado global `error`.

### 6. Como o backend padroniza erro de Auth agora

- Novo **`server/modules/auth/auth.errors.ts`**: mensagens estáveis em português (`AUTH_LOGIN_MESSAGES`) + **`buildAuthFailureJson(code, message, extra?)`** → sempre `{ ok: false, code, message, error }` (`error` espelha `message` para compatibilidade com o contrato pedido).
- **`loginPost`** (`server/modules/auth/login/login.controller.ts`):
  - Usuário não encontrado: responde **`INVALID_CREDENTIALS`** + mensagem genérica (auditoria interna continua com `IDENTIFIER_NOT_FOUND`).
  - Conta banida: `403` + `ACCOUNT_DISABLED`.
  - 2FA: fluxo explícito **sem challenge com código** / **challenge sem código**; primeiro passo continua emitindo challenge; resposta inclui `message` + `error` + `twoFactorMethod`.
  - `catch`: log **`auth.login.unexpected`** apenas com **`unknownErrorMessage(error)`** (sem senha/OTP/challenge); resposta **`500` + `INTERNAL_ERROR`**.

### 7. Como o fluxo 2FA foi validado

- **Código**: primeira resposta `200` com `require2FA`, `code: "TWO_FACTOR_REQUIRED"` (compat: `REQUIRE_2FA`), `twoFactorChallengeToken`, `twoFactorMethod: "email"`, `message`/`error` iguais a “Digite o código enviado ao seu e-mail.”; segunda requisição exige **código + challenge**; ausência de challenge com código → **`400` `TWO_FACTOR_CHALLENGE_REQUIRED`**.
- **Testes automatizados**: `client/tests/auth/LoginPage.test.tsx` cobre 2FA em duas etapas, `INVALID_CREDENTIALS`, mensagem customizada quando `code` é desconhecido, e **bloqueio de double submit** com `loginSubmitLockRef`.
- **Teste manual / Network**: não executado nesta sessão (sem reprodução guiada no browser); endpoint real do cliente continua sendo **`POST /api/auth/login`** (`client/src/pages/auth/login/login.api.ts` + `api` com `baseURL: '/api'`).

### 8. Testes criados/ajustados

| Arquivo | Conteúdo |
|---------|----------|
| `client/src/pages/auth/shared/auth.errors.test.ts` | Unit tests de `readAuthErrorMessage` |
| `client/tests/auth/LoginPage.test.tsx` | Mensagem da API, double submit, fluxos existentes |
| `tests/auth/authFailureJson.test.mjs` | Formato `buildAuthFailureJson` |
| `tests/auth/authPublicUserDto.test.mjs` | DTO público sem `passwordHash` no JSON |

### 9. Confirmação de logs seguros

- Não foram adicionados logs de **senha**, **OTP**, **`twoFactorChallengeToken` completo**, cookies ou segredos.
- Log novo: **`auth.login.unexpected`** com **apenas** mensagem de erro sanitizada via `unknownErrorMessage`.
- Log **`AUTH_LOGIN_2FA_REQUIRED`** com **`userId`** apenas (sem PII extra além do já usado no módulo).

### 10. Resultados dos comandos de validação (neste ambiente)

| Comando | Resultado |
|---------|-----------|
| `cd client && npm run typecheck` | OK |
| `cd client && npm run build` | OK |
| `cd client && npm test` | OK (264 testes) |
| `npm test` | OK |
| `npm run typecheck:server` | OK |
| `npm run build:server` | OK |
| `npm run build:backend` | OK |
| `docker compose build --no-cache` | OK (`app` e `worker` built) |

### Confirmações finais

- **`POST /api/auth/login`** é o endpoint usado pelo SPA (`client/src/pages/auth/login/login.api.ts`).
- **`GET /api/auth/session`** continua como “me” de sessão (`checkSession` no store).
- Nenhum `any` / `@ts-ignore` introduzido nos arquivos alterados do escopo Auth.
- Escopo respeitado: apenas `server/modules/auth/`, `client/src/pages/auth/`, `client/src/store/auth/`, `client/tests/auth/`, `tests/auth/`, `client/src/i18n/locales/*.json`.
- `find server … *.js` (excl. `node_modules`/`dist`) e `find client/src … *.js|*.jsx`: **0** arquivos (neste ambiente).

### Próximo passo sugerido

- Smoke manual: login sem 2FA, login com 2FA (dois passos), conta bloqueada, rate limit, e verificação no DevTools de que **não** há segunda requisição duplicada ao clicar duas vezes rápido no botão.

---

## 2FA opcional e separação Login/Register

### 1. Como o 2FA estava sendo exigido antes

- O handler de login tratava **qualquer** `isTwoFactorEnabled` no usuário como obrigação de fluxo por e-mail, sem um “master switch” de ambiente com default seguro.
- Não havia função única documentando a regra (per-user vs global vs contas elevadas).

### 2. Regra nova de 2FA opcional

- Função central: `shouldRequireEmailTwoFactorForLogin` em `server/modules/auth/login/login.twoFactor.ts`.
- **Nunca** exige e-mail 2FA se `emailTwoFactorEnabled` estiver falso (pipeline desligado).
- Exige se: (a) pipeline ligado **e** usuário com `isTwoFactorEnabled`; **ou** (b) `AUTH_EMAIL_2FA_REQUIRED_FOR_ALL_USERS`; **ou** (c) `AUTH_EMAIL_2FA_REQUIRED_FOR_ADMINS` **e** `isCreator` no `User`.
- Ausência de env opcionais = **false**; `AUTH_EMAIL_2FA_ENABLED` ausente = **false** (não tratar ausência como “ligado”).

### 3. Env / config usada

| Variável | Efeito |
|----------|--------|
| `AUTH_EMAIL_2FA_ENABLED` | Quando `true` (ex.: `1`, `yes`, `enabled`), permite o fluxo de challenge por e-mail. Default se ausente: **false**. |
| `AUTH_EMAIL_2FA_REQUIRED_FOR_ALL_USERS` | Exige 2FA para todos no login (com pipeline ligado). Default: **false**. |
| `AUTH_EMAIL_2FA_REQUIRED_FOR_ADMINS` | Exige 2FA para contas com `isCreator` (sinal elevado no modelo atual). Default: **false**. |

Parsing: `1` / `true` / `yes` / `enabled` / `on` → true; `0` / `false` / `no` / `disabled` / `off` / string vazia → false; valor não reconhecido cai no default do flag.

### 4. Usuário sem 2FA (conta comum, envs desligadas)

- Após senha válida: cookies de sessão + `{ ok: true, user }`.
- Sem `require2FA`, sem `twoFactorChallengeToken` na resposta de sucesso.

### 5. Usuário com 2FA (quando a regra exige)

- **Primeira** `POST /api/auth/login`: `{ ok: false, require2FA: true, code: "TWO_FACTOR_REQUIRED", twoFactorMethod: "email", twoFactorChallengeToken, message, error }` (HTTP 200, como antes para o primeiro passo).
- **Segunda** chamada com `twoFactorToken` + `twoFactorChallengeToken`: sucesso → `{ ok: true, user }`; código inválido → `code: "INVALID_TWO_FACTOR_CODE"` com mensagem segura.

### 6. Nova estrutura backend Auth (resumo)

- `server/modules/auth/index.ts` — export do router.
- `server/modules/auth/auth.routes.ts` — montagem das rotas; login/registro/sessão apontam para subpastas.
- `server/modules/auth/shared/` — repositório, senha/JWT, segurança/cookies, constantes, `hashPassword` / `comparePassword`.
- `server/modules/auth/login/` — `login.controller.ts`, `login.schemas.ts`, `login.twoFactor.ts`.
- `server/modules/auth/register/` — `register.controller.ts`.
- `server/modules/auth/session/` — `getSession`, `logoutPost`, `markAdblockPost`.
- `server/modules/auth/auth.controller.ts` — apenas fluxos de senha / reset / change-password.

### 7–11. Pastas `login/`, `register/`, frontend

- Backend: `server/modules/auth/login/`, `server/modules/auth/register/`, `server/modules/auth/session/`, `server/modules/auth/shared/` (listar com `find server/modules/auth -type f | sort` após build).
- Frontend: `client/src/pages/auth/login/` (`LoginPage.tsx`, `login.api.ts`, `login.twoFactorUi.ts`, `login.validation.ts`), `client/src/pages/auth/register/` (`RegisterPage.tsx`, `register.api.ts`, `register.validation.ts`), `client/src/pages/auth/shared/` (`auth.errors.ts`, `auth.types.ts`, `auth.hooks.ts`, `auth.validation.ts`, testes).

### 12. Testes criados/ajustados

- `tests/auth/authLoginOptional2fa.test.mjs` — regra `shouldRequireEmailTwoFactorForLogin` + defaults de env.
- `client/tests/auth/twoFactorOptional.test.tsx` — `responseRequiresTwoFactorStep` (UI só entra em 2FA se o backend sinalizar).
- `client/tests/auth/LoginPage.test.tsx` — cenário `code: "TWO_FACTOR_REQUIRED"` sem `require2FA`.
- `client/src/pages/auth/shared/auth.errors.test.ts` — `readAuthErrorMessage` (movido para `shared/`).

### 13–16. Validação, segurança e restrições TS

- Rodar de novo na máquina de CI/dev: `npm run typecheck:server`, `npm run build:server`, `cd client && npm run typecheck && npm run build && npm test`, `npm test`, `docker compose build --no-cache`, e os `find`/`grep` pedidos no checklist do passo.
- Não logar senha, OTP, challenge completo, cookies ou segredos; DTO público continua sem `passwordHash` / tokens internos.
- Sem `@ts-ignore` / `@ts-nocheck` / `any` de contorno no escopo desta etapa.
- Sem `.js` fonte novo em `server/` fora de `dist`; sem `.js/.jsx` novo em `client/src`.

---

## Correção do 500 em /api/auth/session e /login

### 1. Causa real do 500

- No ambiente local, `docker compose logs --tail=300 app` e `worker` não retornaram logs porque não havia stack Compose ativa (`docker compose ps` sem serviços).
- A porta ativa detectada foi `3001`. Nela, `GET /api/auth/session`, `GET /api/auth/login` e `GET /login` retornavam `200` com `client/dist/index.html`, indicando runtime/build antigo ou fallback SPA capturando `/api/auth/*` nessa instância local.
- No código-fonte atual, a causa corrigida no Auth foi o contrato incompleto de export após modularização: `server/routes/auth.ts` preservava apenas export nomeado, mas não o `default` histórico esperado por parte do ecossistema/imports antigos.
- Também havia fragilidade em `GET /api/auth/session`: token ausente/inválido retornava formato antigo sem código estável, e erro inesperado respondia `{ ok:false }` sem log interno útil.

### 2. Stack/erro interno encontrado

- Sem stack trace local do Compose, pois o Compose não estava rodando.
- Evidência local dos endpoints em `3001`: corpo exato retornado foi HTML da SPA (`<!DOCTYPE html><html lang="pt-BR" ...>`), inclusive para `/api/auth/session`.
- O erro de produção visto no navegador permanece compatível com artefato antigo ou rota Auth quebrada em runtime após modularização.

### 3. Arquivos e linhas corrigidos

- `server/routes/auth.ts`: adicionado `export { authRouter as default }`.
- `server/modules/auth/session/session.controller.ts`: sessão sem token/token inválido agora retorna JSON seguro `UNAUTHENTICATED`; erro inesperado gera log interno `auth.session.unexpected` e resposta segura `INTERNAL_ERROR`.
- `client/src/store/auth.ts`: `checkSession` trata `401` como deslogado sem erro visual e `5xx` como mensagem limpa.
- `tests/auth/authSessionController.test.mjs`: cobertura de export default/nomeado e sessão sem/ inválida.
- `client/src/store/auth.test.ts`: cobertura de `401` sem crash e `500` com mensagem segura.

### 4. /api/auth/session antes

- Sem cookie: retornava `200 { ok:false, user:null }`.
- Token inválido/ausente não tinha `code` estável.
- Erro inesperado retornava `500 { ok:false }`, sem mensagem segura e sem log interno específico.

### 5. /api/auth/session agora

- Sem cookie: `401 { ok:false, code:"UNAUTHENTICATED", message:"Sessão expirada ou ausente.", error:"Sessão expirada ou ausente." }`.
- Sessão inválida: mesmo JSON seguro, limpando cookies de Auth quando aplicável.
- Usuário válido: mantém `200 { ok:true, user }` com DTO público sem `passwordHash`.
- Erro interno: `500 { ok:false, code:"INTERNAL_ERROR", message:"Não foi possível processar a autenticação agora.", error:"..." }`.

### 6. /login antes

- No local em `3001`, `GET /login` retornou `200` com `index.html`.
- No navegador de produção, `/login` apareceu como `500`; não foi reproduzido localmente com o stack Compose desligado.

### 7. /login agora

- O fallback SPA em `server/server.ts` continua impedindo `/api/*` de cair no HTML quando o servidor correto está rodando.
- A correção principal foi no Auth modularizado; se `/login` ainda retornar 500 em produção, a próxima checagem deve ser artefato `dist`/`client/dist/index.html` no container.

### 8. Sessão sem cookie

- Tratada como usuário deslogado, nunca 500.

### 9. Sessão inválida

- Tratada como `UNAUTHENTICATED`, cookies limpos, nunca expõe token/cookie.

### 10. Login inválido

- Fluxo existente preservado: `401` seguro via `buildAuthFailureJson("INVALID_CREDENTIALS", ...)`.

### 11. Login normal sem 2FA

- Regra existente preservada: quando 2FA por e-mail não é exigido, senha válida emite cookies e retorna `{ ok:true, user }`.

### 12. Login com 2FA opcional

- Regra existente preservada: só exige challenge quando `shouldRequireEmailTwoFactorForLogin` retorna verdadeiro.

### 13. Testes criados/ajustados

- `tests/auth/authSessionController.test.mjs`.
- `client/src/store/auth.test.ts`.

### 14. Resultado dos comandos de validação

- `docker compose logs --tail=300 app`: sem saída local.
- `docker compose logs --tail=300 worker || true`: sem saída local.
- `docker compose ps`: sem serviços ativos.
- `curl -i http://localhost:3000/api/auth/session`: conexão recusada.
- `curl -i http://localhost:3000/api/auth/login`: conexão recusada.
- `curl -i http://localhost:3000/login`: conexão recusada.
- `curl -i http://localhost:3001/api/auth/session`: `200` com HTML da SPA local antiga.
- `curl -i http://localhost:3001/api/auth/login`: `200` com HTML da SPA local antiga.
- `curl -i http://localhost:3001/login`: `200` com HTML da SPA.
- `rg "authRouter|/api/auth/session|/auth/session|loginPost|session" ...`: confirmou `/api/auth` montado via `backend/src/app/mount/userApiRoutes.mount.ts` e rotas Auth em `server/modules/auth/auth.routes.ts`.
- `npx prisma validate --schema=server/prisma/schema.prisma`: OK.
- `npm run typecheck:server`: OK.
- `npm run build:server`: OK.
- `npm run build:backend`: OK.
- `npm run typecheck --prefix client`: OK.
- `npm run build --prefix client`: OK; apenas warnings de chunk grande/Rollup em dependências Web3 já existentes.
- `npm test --prefix client -- src/store/auth.test.ts tests/auth/LoginPage.test.tsx tests/auth/twoFactorOptional.test.tsx`: OK, 3 arquivos / 24 testes.
- `npm test --prefix client`: OK, 45 arquivos / 280 testes.
- `npm test`: OK, 480 testes.
- `docker compose build --no-cache`: OK, imagens `app` e `worker` built.
- `find server -name "*.js" ...`: sem saída.
- `find client/src \( -name "*.js" -o -name "*.jsx" \) ...`: sem saída.
- `grep -R "@ts-ignore\|@ts-nocheck\| as any\|: any" ...`: apenas falso positivo textual em `server/middleware/admin.ts` (`any logged-in user`), sem `any` TypeScript.
- Smoke local em `PORT=3010 node dist/server/server.js`: servidor subiu, mas com erros de DB local `SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string`.
- `GET http://localhost:3010/api/auth/session`: `401` com JSON seguro `UNAUTHENTICATED`, sem 500.
- `GET http://localhost:3010/login`: `200` com `index.html` da SPA, sem 500.
- `POST http://localhost:3010/api/auth/login` com CSRF válido e credenciais inválidas: `500 INTERNAL_ERROR` por DB local inválido antes de consultar usuário; resposta ao cliente foi JSON seguro, sem stack trace.

### 15. Secrets

- Nenhum secret, senha, token, cookie, private key, seed, mnemonic, API key ou `DATABASE_URL` foi exposto no relatório/logs.

### 16. `server/` sem `.js`

- Nenhum `.js` fonte foi criado em `server/`.

### 17. `client/src` sem `.js/.jsx`

- Nenhum `.js/.jsx` foi criado em `client/src`.
