# BlockMiner 2.1 — Documentação

## Parte 1 — Visão geral e stack

### O que é o BlockMiner

BlockMiner é uma **simulação de mineração Web3** rodando como aplicação web. O usuário não minera criptomoeda real — ele acumula **poder de mineração** dentro do jogo realizando ações monetizáveis (assistir vídeo, completar tarefa de offerwall, clicar em PTC, fazer check-in diário, jogar mini-games como 2048) e esse poder é convertido em **BLK**, o token interno do jogo. O BLK pode ser sacado pra carteira do usuário na rede **Polygon**, fechando o loop entre engajamento → receita de publicidade/offerwall → recompensa on-chain.

**Game-loop em uma linha:** o jogador gera atividade publicitária → o app captura receita via parceiros (Zerads, OfferwallMe, PTC, YouTube watch, shortlinks) → uma fatia volta pro jogador como BLK → o jogador saca pra Polygon.

**Domínio público:** `https://blockminer.space`
**Deploy:** VPS único (89.167.119.164), Docker Compose, 6 containers.
**Arquitetura:** monolito modular em TypeScript (um único processo Node servindo API + SPA, mas com fronteiras de módulo dentro de `server/modules/` — detalhado na Parte 2).

---

### Stack — o quê e o porquê

#### Linguagem: **TypeScript** em todo o monorepo

Backend (`server/`, `backend/`) e frontend (`client/`) são 100% TS. Compilado por `tsc` no servidor e por Vite no cliente.

**Por quê:** O domínio tem muitos cálculos sensíveis (recompensas, conversões BLK ↔ moeda, anti-fraude, validação de jogo) onde um erro de tipo vira bug de dinheiro. TS dá segurança em refatorações grandes (e esse projeto refatora bastante — migração de rotas pra módulos, mudança de adapter Prisma, etc.). Tipos compartilhados entre `server/` e `client/` via `backend/` reduzem drift de contrato.

---

#### Runtime: **Node.js ≥18** (Docker usa 20-bookworm-slim)

**Por quê:** Mesmo runtime no cliente (Vite/React) e no servidor permite compartilhar código TS (ex: `game2048Engine.ts` é compilado pelo servidor e *o mesmo arquivo* é copiado pra dentro do build do cliente — engine única, validação on-server, simulação no cliente). Ecossistema de libs Web3 (ethers, viem, wagmi) é Node-first. `bookworm-slim` no Docker porque precisamos do `apt` pra instalar OpenSSL (Prisma), Xvfb e ffmpeg (captura RTMP) — uma imagem Alpine não daria conta.

---

#### Framework HTTP: **Express 5**

**Por quê:** Maduro, estável, ecossistema enorme de middleware (helmet, cors, compression, multer, rate-limit). Express 5 (não 4) porque já tem suporte nativo a `async` em handlers — sem precisar de `express-async-errors`. O projeto não usa Next/NestJS porque não precisa de SSR (a SPA é estática, servida pelo próprio Express) e nem do peso de DI/decorators do Nest — a estrutura modular é convencional, não framework-imposta (ver Parte 2).

---

#### Realtime: **Socket.io 4**

**Por quê:** O jogo precisa de eventos push em tempo real — saldo BLK atualizando enquanto o usuário minera, notificações de recompensa, chat público, status de fila de offerwall. WebSocket puro daria mais trabalho (reconnect, fallback, rooms, namespaces). Socket.io entrega isso pronto. Configurado com `ping interval 30s` e `ping timeout 180s` pra tolerar conexões móveis ruins.

---

#### Banco de dados: **PostgreSQL 15** + **Prisma 7** (adapter `@prisma/adapter-pg`)

**Por quê PostgreSQL:** transações ACID são obrigatórias — qualquer recompensa BLK precisa ser atômica (debitar pool + creditar usuário + log de auditoria, tudo num `BEGIN/COMMIT`). Suporte a `JSONB` (configs de evento, metadata de offerwall), índices parciais, advisory locks (usados em `transactionLocks`) e tipos nativos como `Decimal` pra valores monetários sem float.

**Por quê Prisma:** schema declarativo único (`schema.prisma`, ~2.249 linhas, 100+ models) é a fonte da verdade — migrations geradas, tipos TS derivados automaticamente, cliente type-safe. O adapter `@prisma/adapter-pg` (em vez do binário padrão) usa o `pg` driver nativo, o que dá pooling configurável (`PG_POOL_MAX=40` na app, `12` no worker) — necessário pra aguentar picos sem esgotar conexões.

---

#### Cache + Filas: **Redis 7** + **BullMQ 5**

**Por quê Redis:** três usos distintos no mesmo container.
1. **BullMQ** (filas de jobs assíncronos — distribuição de recompensa, enriquecimento de IP, snapshots de transparência, ciclos BLK).
2. **Cache** (preço de cripto, configs de evento, IP intelligence).
3. **Sessões/Socket.io** (pub-sub entre processos, se for escalar).

**Por quê BullMQ (não Bull antigo, não SQS):** BullMQ tem retry exponencial, dead-letter queue, priorização, e roda 100% em Redis (sem dependência externa). Crítico pra desacoplar trabalho lento (calcular ciclo de recompensa pra 10k usuários) da request HTTP — a request enfileira, o worker processa, o usuário vê via Socket.io quando termina.

⚠️ Note: rate-limit e auth-lockout **não usam** Redis por padrão (`API_RATE_LIMIT_USE_MEMORY=true`, `AUTH_LOCKOUT_USE_MEMORY=true`). O processo da app é único, então memória basta — e evita advisory lock no Postgres a cada request.

---

#### Frontend: **React 19 + Vite + TailwindCSS**

**Por quê React + Vite (não Next):** SPA pura serve melhor o caso de uso — dashboard altamente interativo, muito state local, zero conteúdo precisa de SEO (área logada). Next traria peso de SSR/SSG que não usaríamos. Vite dá dev-server instantâneo (HMR sub-segundo) e build com tree-shaking agressivo.

**Stack do cliente:**
- **React 19** + **React Router 7** — roteamento client-side em ~40 páginas.
- **React Query 5** — cache de requests, refetch automático, optimistic updates. Substitui boa parte do que seria Redux.
- **Zustand** — state global leve (auth, carteira, notificações). Sem boilerplate do Redux.
- **Wagmi 3 + viem** — conexão de carteira Web3 (MetaMask, WalletConnect). Wagmi é o padrão de fato; viem é o cliente Ethereum moderno (substituiu ethers no client; o server ainda usa ethers 6).
- **TailwindCSS** — utilitários CSS, sem CSS-in-JS pesado.
- **framer-motion** — animações declarativas.
- **Sonner** — toasts. Leve, bonito, ergonômico.
- **i18next** — internacionalização (jogo é multi-idioma).
- **Recharts** — gráficos no admin e dashboards de transparência.

---

#### Smart contracts: **Solidity + Hardhat** (em `contracts/`)

**Por quê:** O lado on-chain do BLK precisa de pelo menos um contrato — `BlockMinerDeposit.sol` recebe depósitos custodiais (cada usuário tem um endereço HD derivado via BIP-44 da carteira mestre). Hardhat porque é o toolchain padrão JS — integra direto com o repo TS, sem precisar de Foundry (que pediria Rust toolchain no CI).

**Rede:** Polygon. **Por quê Polygon:** gas barato (saques de BLK custariam fortunas em Ethereum mainnet), EVM-compatible (mesmas libs), liquidez decente.

---

#### Auth: **JWT** (`jsonwebtoken`) + **bcryptjs** + **otplib** + **email 2FA**

- JWT pra session stateless (access + refresh token).
- bcrypt pra hash de senha.
- 2FA **opt-in** em duas variantes (cada usuário escolhe nas configs):
  - **TOTP app** (`otplib`) — Google Authenticator-compatível, flag `isTwoFactorEnabled`.
  - **Código por email** — usa o SMTP do projeto, flag `emailTwoFactorEnabled`.
- Por padrão, conta nova **não tem 2FA ativo**. Login e saque só pedem 2FA se o usuário habilitou (com exceções globais via env: kill-switch da feature, forçar pra todos, forçar pra creators/admins).

---

#### Validação: **Zod 3**

**Por quê:** Schema declarativo que vira tipo TS automaticamente — não duplicamos "shape do request" em interface + validador. Cada módulo tem seu próprio `*.schemas.ts`.

---

#### Email: **nodemailer** (Hostinger SMTP)

Verificação de conta, reset de senha, notificações críticas.
**Quirk:** Hostinger oferece 465 (SSL) e 587 (STARTTLS) — mas a porta 465 é **bloqueada pelo provedor da VM** (confirmado via `nc`). Por isso a config força `SMTP_PORT=587` e `SMTP_SECURE=false` (STARTTLS).

---

#### Outros pacotes notáveis

| Pacote | Pra que serve |
|---|---|
| `helmet` | headers de segurança (CSP, HSTS) |
| `cors` | controle de origem nas rotas API |
| `compression` | gzip de respostas |
| `multer` | upload de arquivos (imagens de miners, avatares) |
| `node-cron` | tarefas agendadas (ciclos BLK, snapshots, sweeps anti-fraude) |
| `qrcode` | QR de 2FA + endereços de depósito |
| `ethers 6` | server-side Web3 (assinatura, verificação, leitura de chain) |

---

#### Infra de runtime

| Camada | Tech | Por quê |
|---|---|---|
| **Containerização** | Docker + Compose | Stack reproduzível, isolamento de processos, deploy idempotente |
| **Reverse proxy** | nginx (container) | TLS termination (Let's Encrypt bind-mounted), gzip, serving estático eventual, isolamento da app |
| **Captura de tela do admin** | Xvfb + ffmpeg + Playwright | RTMP do dashboard pra YouTube ao vivo (admin streama métricas pra audiência) |
| **Deploy** | script Python via SSH (`scripts/vm-deploy-local-over-ssh.py`) | `git archive` → `sftp` → `docker compose up -d --build`, com backup/restore automático do `.env.production` |

---

### Resumo: por que essa stack e não outra

- **Por que monolito modular e não microserviços:** Um time pequeno, um produto, sem escala que justifique a complexidade operacional de N serviços. Os módulos têm fronteiras claras (Parte 2) — se algum dia for preciso extrair, o caminho está pavimentado.
- **Por que Postgres e não Mongo:** dinheiro exige ACID.
- **Por que Express e não Fastify/Nest:** maturidade + ecossistema + zero overhead conceitual. O projeto não precisa do que Fastify/Nest oferecem a mais.
- **Por que Prisma e não TypeORM/Knex:** type-safety automática + migrations gerenciadas + schema único.
- **Por que React+Vite e não Next:** zero necessidade de SSR.
- **Por que Polygon e não outra L2:** custo + maturidade + compatibilidade EVM.

---

---

## Parte 2 — Arquitetura: monolito modular

### O que significa "monolito modular" aqui

Um **único processo Node** (`dist/server/server.js`) serve toda a API e a SPA. Não há microserviços, não há message bus entre domínios, não há serviços separados conversando por HTTP interno. Tudo roda na mesma memória, no mesmo event loop.

Mas o código **não é uma sopa**: cada domínio do produto (check-in, faucet, shop, wallet, offerwall, etc.) vive numa pasta isolada em `server/modules/`, com fronteiras explícitas. Modules não importam uns aos outros — só falam com camadas compartilhadas (`server/services/`, `server/utils/`, `server/middleware/`, Prisma). Isso dá disciplina de microserviço sem o custo operacional de microserviço.

**Tradução prática:** quando você abre a pasta `server/modules/checkin/`, tem ali **tudo** que envolve check-in — rotas, controller, regras de negócio, repositório de banco, validação, erros, tipos. Não precisa caçar pedaços em outras pastas. E quando você muda algo em check-in, sabe que não vai quebrar `faucet/` por acidente — porque `faucet/` literalmente não importa de `checkin/`.

---

### Por que monolito modular (e não as alternativas)

| Alternativa | Por que não |
|---|---|
| **Monolito plano** (controllers/, services/, models/ no nível raiz) | Já tentou. Com 25 domínios e 100+ models, vira impossível saber o que pertence a quê. Mudar uma feature exige tocar 5 pastas em locais aleatórios. |
| **Microserviços** | 1 time, 1 produto, ~poucos milhares de usuários. Custo operacional (N pipelines, N databases, observabilidade distribuída, latência de rede entre serviços) não se paga. |
| **Framework com DI/decorators (Nest)** | Adiciona conceito (módulo Nest, provider, injector) por cima do conceito que já temos (módulo de domínio). Curva de aprendizado sem benefício real aqui. |

Monolito modular é o meio-termo: **operações simples como monolito, código organizado como microserviço**. Se um dia um módulo precisar virar serviço próprio (ex: `ip-intelligence` virar API externa), o caminho está pronto — basta expor o `*Router` por outro entrypoint.

---

### Anatomia de um módulo

Todo módulo vive em `server/modules/<nome>/` e segue uma convenção de nomes baseada em sufixos. Pegando `checkin/` como exemplo canônico:

```
server/modules/checkin/
├── checkin.routes.ts          ← Express router (define endpoints HTTP)
├── checkin.controller.ts      ← Handlers (lê request, chama service, devolve response)
├── checkin.service.ts         ← Lógica de negócio (orquestra repository + regras)
├── checkin.repository.ts      ← Acesso a banco (queries Prisma)
├── checkin.schemas.ts         ← Validação Zod do input
├── checkin.dto.ts             ← Shape dos dados que entram/saem
├── checkin.types.ts           ← Tipos TS internos do módulo
├── checkin.errors.ts          ← Erros tipados do domínio
├── checkin.config.ts          ← Feature flags + constantes
├── checkin.calendar.ts        ← Sub-domínio: cálculo de calendário
├── checkin.rewards.ts         ← Sub-domínio: cálculo de recompensa
├── checkin.milestoneRules.ts  ← Sub-domínio: regras de milestone
├── checkin.contract.ts        ← Lógica relacionada ao contrato on-chain
├── streakRecovery.controller.ts ← Feature subsidiária (controller próprio)
└── index.ts                   ← Fachada pública: re-exporta router + helpers
```

**Convenção de camadas (de fora pra dentro):**

1. **Routes** — só amarra path HTTP → controller. Sem lógica.
2. **Controller** — adapta HTTP ↔ domínio. Lê `req.body`, valida via schema, chama service, formata resposta. Não acessa banco direto.
3. **Service** — regras de negócio. Orquestra repository e regras. Não conhece HTTP.
4. **Repository** — queries Prisma. Não conhece regras nem HTTP.
5. **Schemas/DTO/Types/Errors** — vocabulário do domínio.

**Por que essa separação:** dá pra testar service sem subir Express, testar controller mockando service, testar repository contra banco real. Cada camada tem uma responsabilidade.

---

### Tamanhos variam — e tudo bem

Nem todo módulo é grande como `checkin`. A regra é "ter o que precisar, nada mais":

| Módulo | Tamanho | Forma |
|---|---|---|
| `checkin/` | Grande | Stack completa + sub-domínios (calendar, rewards, milestoneRules) |
| `faucet/` | Médio | Stack completa (routes + controller + service + repository + schemas + dto + types + errors) — sem sub-domínios |
| `zerads/` | Mínimo | Só routes + controller. É um webhook receiver de offerwall — não tem regra de negócio rica, só recebe callback do parceiro e credita BLK |

Módulo cresce conforme o domínio exigir. `zerads` é "fino" porque a lógica é mesmo simples (validar IP do parceiro, validar password, creditar). Forçar um repository ou service ali seria over-engineering.

---

### Como módulos são registrados (a parte interessante)

**Módulos NÃO se auto-registram.** Não tem código tipo `app.use(checkinRouter)` dentro de `server/modules/checkin/`. Por quê? Porque módulos não conhecem o `app` Express — eles só exportam o router deles via `index.ts`:

```ts
// server/modules/checkin/index.ts
export { checkinRouter } from "./checkin.routes.js";
export { balanceCheckinSyntheticTxHash, ... } from "./checkin.controller.js";
```

A **montagem central** acontece num único arquivo: `backend/src/app/mount/userApiRoutes.mount.ts`. Ele importa todos os routers e faz o `app.use()`:

```ts
import { checkinRouter } from "#server/modules/checkin/index.js";
import { faucetRouter } from "#server/modules/faucet/index.js";
// ...

app.use("/api/checkin", checkinRouter);
app.use("/api/faucet", faucetRouter);
```

**Por quê centralizar a montagem:**
- Um arquivo só pra responder "que rotas o app tem?". Não tem mágica.
- Ordem de middleware é explícita (auth antes de rotas autenticadas, rate-limit antes de tudo).
- Pra remover um módulo, basta apagar a linha — não tem registry distribuído pra rastrear.

---

### Regra de ouro: módulos não conversam entre si

**Módulos importam APENAS de camadas compartilhadas — nunca de outros módulos.**

```ts
// ✅ Permitido — dentro de qualquer módulo:
import prisma from "../../src/db/prisma.js";
import { applyUserBalanceDelta } from "../../src/runtime/miningRuntime.js";
import { logger } from "../../utils/logger.js";
import { requireAuth } from "../../middleware/auth.js";

// ❌ Proibido — sibling module:
import { something } from "../wallet/wallet.service.js";   // NUNCA
import { faucetClaim } from "../faucet/faucet.service.js"; // NUNCA
```

**Por quê:** se `checkin` importasse de `faucet`, mexer em faucet quebraria checkin silenciosamente. A regra elimina essa classe inteira de bug. Quando dois módulos precisam compartilhar algo (ex: calcular recompensa BLK), esse algo sobe pra `server/services/` — vira capacidade compartilhada, não dependência cruzada.

---

### Camadas compartilhadas (o que vive fora de `modules/`)

| Pasta | O que tem | Por que existe |
|---|---|---|
| `server/services/` | Serviços com lógica que atravessa domínios: auth core, fraud signals, mining engine, BLK distribution, IP intelligence, deposit service, audit chain. ~50+ arquivos. | Quando uma capacidade não pertence a um domínio só (ex: "calcular recompensa BLK" é usada por mining, faucet, checkin, offerwall), ela mora aqui. |
| `server/utils/` | Logger, tokens JWT, helpers de data, crypto price, transaction locks, CORS, checkinStreak helpers. | Funções puras sem dependência de domínio. |
| `server/middleware/` | `requireAuth`, rate-limit, CSRF, helmet, CSP, feature gates. | Middleware Express reutilizado por vários módulos. |
| `server/models/` | Fachadas de acesso a entidades base (User, MinerProfile, Database). | Abstração fina sobre Prisma quando faz sentido reutilizar. |
| `server/types/` | Tipos TS compartilhados. | Vocabulário comum (UserId, BlkAmount, etc.). |
| `server/validation/` | Validadores genéricos reutilizados. | Validação que não pertence a um módulo só. |
| `server/prisma/` | `schema.prisma` + migrations. | Schema único. Fonte da verdade do banco. |
| `server/src/` | Bootstrap, mining runtime, socket handlers, audit kernel, db client. | "Núcleo" runtime — coisas que não são módulo de produto mas que módulos consomem. |
| `server/cron/` | Tarefas agendadas via `node-cron`. | Ciclos BLK, snapshots, sweeps anti-fraude. |
| `server/jobs/` | Filas BullMQ + worker. | Trabalho assíncrono fora da request. |
| `server/routes/` | Rotas legadas (pré-modularização). 45 arquivos. | Sendo migradas pra `server/modules/` aos poucos — coexistem. |

---

### Por que `backend/` existe (e o que é)

Olhando o repo, você vê dois lugares com cara de "backend":
- `server/` — onde mora todo o código de negócio (modules, services, utils, schema).
- `backend/` — uma pasta menor com `tsconfig.json` e `src/app/`.

**`backend/` não é um segundo backend.** É a **camada de composição HTTP** — o "casco" que monta o Express e amarra os módulos do `server/`. Ele faz três coisas:

1. **Setup do Express** (`backend/src/app/setupExpressHttpStack.ts`): middleware global, body parser, helmet, cors, compression, rate-limit.
2. **Montagem central de rotas** (`backend/src/app/mount/*.mount.ts`): importa cada `*Router` de `server/modules/` e faz `app.use()`.
3. **Registro de error handlers** (`backend/src/app/registerHttpRoutes.ts`).

**Por que separar do `server/`:**

- **Isolamento de responsabilidade:** `server/modules/` é "o que o produto faz". `backend/` é "como esse produto vira um servidor HTTP". Trocar Express por Fastify amanhã, em tese, seria isolado em `backend/`.
- **Path alias `#server/*`:** o `tsconfig.json` do `backend/` resolve `#server/modules/checkin/index.js` → `dist/server/modules/checkin/index.js`. Isso permite que `backend/` consuma `server/` como se fosse uma lib externa, com tipos.
- **Compilação separada:** `server/` compila com `tsconfig.server.json`, `backend/` compila com `backend/tsconfig.json`. Permite ciclo de build mais rápido (compilar só o que mudou).
- **Teste:** consegue testar a montagem HTTP sem subir o mundo inteiro de domínio.

**O fluxo de boot** (resumo):

```
dist/server/server.js              ← entrypoint (process.argv[0])
  └─ dynamic import →
     backend/dist/app/setupExpressHttpStack.js   ← cria o app Express
     backend/dist/app/registerHttpRoutes.js      ← monta rotas
        └─ import →
           server/modules/*/index.js              ← cada módulo expõe seu router
```

`server.ts` é o orquestrador: ele inicializa banco, redis, sockets, cron, e depois delega o HTTP pro `backend/`.

---

### Trabalho assíncrono: workers separados (ainda dentro do monolito)

Mesmo sendo monolito, **nem tudo roda no processo da app**. Dois workers vivem em containers próprios:

1. **`block-miner-worker`** — roda `dist/server/jobs/runBlockminerWorker.js`. Consome filas BullMQ (Redis). Faz o trabalho pesado: ciclos de recompensa BLK, enriquecimento de IP, snapshots de transparência, finalização de offer events.
2. **`block-miner-telegram-worker`** — roda `services/telegram-proof-worker/telegramProofWorker.js`. Consome a tabela `TelegramOutboxEvent` e dispara notificações pelo Bot API.

**Por que separar do app process:**
- Se o Telegram cair, **não derruba a API**. Worker fica acumulando outbox, app segue.
- Worker BullMQ pode usar pool de conexões menor (`PG_POOL_MAX=12` vs `40` da app) — sem competir por conexões com requests HTTP.
- Pode escalar horizontalmente o worker (subir N réplicas) sem precisar mexer no app.
- Se o worker travar/OOM, restart isolado, sem afetar usuários online.

**Importante:** o worker importa **o mesmo código** do `server/` que a app — mesmas regras, mesmos services. Não é "outro projeto". É outro processo executando uma fatia diferente do código.

---

### Resumindo a filosofia

- **Um processo** (mais workers periféricos), **uma codebase**, **uma database**.
- **Cada domínio numa pasta** — fronteira clara, sem importações cruzadas.
- **Composição HTTP separada** do código de domínio (`backend/` ↔ `server/`).
- **Camadas compartilhadas** (`services/`, `utils/`, `middleware/`) pra capacidades transversais.
- **Workers** rodam o mesmo código em filas separadas — desacoplam trabalho lento da request.

A meta dessa arquitetura: **velocidade de monolito, organização de microserviço, opção futura de extrair sem reescrever**.

---

---

## Parte 3 — Modelo de dados (Prisma)

### A regra: um schema único

Todo o banco vive em **um arquivo só**: `server/prisma/schema.prisma` (~2.249 linhas, 100+ models). Não é dividido por módulo, não é dividido por domínio. Schema único, banco único, migrations únicas.

**Por quê schema único, mesmo sendo monolito modular:**
- O banco **é compartilhado** — Prisma precisa enxergar tudo pra resolver relations (`User → UserVault → Transaction`).
- Migrations geradas tocam tabelas de múltiplos domínios numa transação só. Quebrar em N schemas viraria N migrations sincronizadas — pesadelo.
- Tipos gerados (`@prisma/client`) precisam do schema completo pra dar autocomplete cross-domain.

**Convenção:** mesmo no arquivo único, os models são organizados em blocos lógicos por comentário (`// === MINING ===`, `// === OFFERWALL ===`). Quem abrir o schema consegue navegar.

---

### Os domínios do banco

100+ models é muita coisa — mas eles se agrupam em ~12 domínios bem definidos. Cada grupo abaixo responde "por que esses models existem juntos".

---

#### 1. Identidade — quem é o usuário

**Models:** `User`, `Session`, `RefreshToken`, `UserIpLog`, `IpIntelligenceCache`, `PageView`, `Referral`, `ReferralEarning`

**Por que esses models existem:**
- `User` é o centro do banco — quase tudo tem FK pra `User.id`.
- `Session` + `RefreshToken` separam o token JWT curto (15min) do refresh token longo (dias). Permite revogar sessão sem invalidar o JWT em si.
- `UserIpLog` + `IpIntelligenceCache` são a base do anti-fraude — registra cada IP que o usuário usou, e cacheia info do IP (ASN, proxy/VPN/datacenter) pra não bater na API externa toda hora.
- `PageView` é tracking interno — não usa Google Analytics porque precisamos correlacionar com `User.id` pra fraude e atribuição.
- `Referral` + `ReferralEarning` modelam o programa de indicação: A indicou B, B mina, A ganha % — `ReferralEarning` registra cada split.

---

#### 2. Mining & Economia BLK — o coração do jogo

**Models:** `Miner`, `UserMiner`, `UserOwnedMachine`, `RackConfig`, `UserRack`, `UserRoom`, `BlkEconomyConfig`, `BlkRewardCycle`, `BlkRewardLog`, `BlockMinerReward`, `BlockDistribution`, `MiningRewardsLog`, `AutoMiningReward`, `AutoMiningGpu`, `AutoMiningGpuLog`, `AutoMiningV2Session`, `AutoMiningV2PowerGrant`, `AutoMiningV2BannerImpression`

**Por que esses models existem:**

**Catálogo + posse:**
- `Miner` é o **catálogo** de máquinas disponíveis (tipo "Asic Pro 5000"). Define hashrate, preço, imagem.
- `UserMiner` / `UserOwnedMachine` é a **posse** — qual usuário tem qual miner, quantos, em que estado.
- `RackConfig` + `UserRack` + `UserRoom` modelam o **layout físico simulado**: o usuário organiza miners em racks, racks em salas. Visual no front, mas relevante pro cálculo (sala ventilada = bonus, etc.).

**Economia BLK:**
- `BlkEconomyConfig` guarda **parâmetros globais** da economia (taxa de emissão, supply alvo, ajustes de dificuldade). Editável no admin sem deploy.
- `BlkRewardCycle` registra cada **ciclo de distribuição** (rodou em T, distribuiu X BLK pra Y usuários). Roda via cron.
- `BlkRewardLog` é o **ledger por usuário** dentro do ciclo — quanto cada um recebeu, baseado em quê.
- `BlockDistribution` registra o **total emitido** ao longo do tempo (auditoria, transparência).
- `BlockMinerReward` + `MiningRewardsLog` são logs paralelos com granularidades diferentes (`Reward` por evento, `Log` agregado).

**Auto-mining (V1 e V2):**
- O usuário deixa o miner rodando sem clicar — sistema acumula recompensa.
- `AutoMiningGpu` + `AutoMiningGpuLog` é a V1 (modelo simples de GPU virtual).
- `AutoMiningV2Session` é a V2 — refatoração com sessões timeboxadas.
- `AutoMiningV2PowerGrant` registra grants de poder dentro da sessão.
- `AutoMiningV2BannerImpression` liga **impressão de banner** a grant — o sistema só dá poder se o anúncio foi visto. É o vínculo entre "ver ad" e "ganhar BLK".

**Por que V1 e V2 coexistem:** migração gradual. V1 ainda tem usuários ativos com sessões abertas; nova lógica entra como V2. Quando V1 zerar, é deletado.

---

#### 3. Inventário, Vault e Shop — onde os itens moram

**Models:** `UserInventory`, `UserVault`, `UserRewardInbox`, `Transaction`, `EventMiner`, `EventPurchase`

**Por que esses models existem:**
- `UserInventory` é o **estoque ativo** — miners que o usuário tem disponíveis pra usar.
- `UserVault` é o **cofre** — itens guardados, fora de uso, não geram hashrate. Separação importante porque algumas regras dependem do estado ("miners no cofre não contam pro cap").
- `UserRewardInbox` é a **caixa de entrada de recompensas** — recompensas pendentes que o usuário precisa clicar pra coletar. Diferente de crédito direto (que vai pro saldo via `Transaction`).
- `Transaction` é o **ledger universal** de movimentos de saldo (BLK, moedas internas). Toda mudança de saldo passa por aqui — fundamental pra auditoria.
- `EventMiner` + `EventPurchase` modelam **eventos sazonais** de loja (ex: "Black Friday — miner exclusivo por X BLK").

---

#### 4. Mini-Pass (Battle Pass) — monetização sazonal

**Models:** `MiniPassSeason`, `MiniPassMission`, `MiniPassLevelReward`, `UserMiniPassEnrollment`, `UserMiniPassXpLedger`, `UserMiniPassMissionProgress`, `UserMiniPassRewardClaim`, `UserMiniPassPurchase`

**Por que esses models existem:**

Battle pass clássico — temporadas, missões, níveis, recompensas free + premium.

- `MiniPassSeason` = **temporada** (data início, fim, configs).
- `MiniPassMission` = **missões** da temporada (ex: "complete 5 check-ins").
- `MiniPassLevelReward` = **recompensa por nível** (free tier vs premium tier).
- `UserMiniPassEnrollment` = **inscrição** do usuário na temporada (free) ou compra (premium).
- `UserMiniPassXpLedger` = **histórico de XP ganho** (auditoria — de onde veio cada ponto).
- `UserMiniPassMissionProgress` = progresso de cada missão por usuário.
- `UserMiniPassRewardClaim` = recompensas já reclamadas (evita dupla coleta).
- `UserMiniPassPurchase` = compras de upgrade pra premium (registro fiscal/auditoria).

**Por que tanto detalhe:** mini-pass é receita direta. Cada centavo precisa ser rastreado. XP precisa ter procedência (não pode aparecer XP "do nada"). Reclamações de recompensa não podem ser dupla-creditadas. Por isso ledger separado de progress separado de claim.

---

#### 5. Engajamento — check-in, tasks diárias, power boost

**Models:** `DailyCheckin`, `PeriodicCheckin`, `DailyPowerBoost`, `UserCheckinStreakReward`, `CheckinStreakMilestone`, `CheckinStreakRecovery`, `DailyTaskDefinition`, `UserDailyTaskProgress`, `UserDailyTaskDedupeTick`

**Por que esses models existem:**

**Check-in (volta diária):**
- `DailyCheckin` = registro do check-in do dia (idempotente por `userId + dateKey`).
- `PeriodicCheckin` = variantes (semanal, mensal).
- `UserCheckinStreakReward` = recompensas dadas por manter streak.
- `CheckinStreakMilestone` = milestones de streak (7, 30, 100 dias).
- `CheckinStreakRecovery` = **mecanismo de "perdoar" 1 dia perdido** (pago ou ganho) — sem isso, qualquer falha quebra streak e desincentiva. Recovery é receita potencial.

**Daily Power Boost:**
- `DailyPowerBoost` = boost de hashrate por X horas/dia. Renova diariamente. Incentiva login diário.

**Daily Tasks:**
- `DailyTaskDefinition` = catálogo de tarefas (ex: "Veja 3 vídeos hoje").
- `UserDailyTaskProgress` = progresso por usuário.
- `UserDailyTaskDedupeTick` = **deduplicação por tick** — evita que a mesma ação conte duas vezes pra mesma task (ex: clicar 2x no mesmo botão). Tabela parece duplicada com Progress, mas serve pra travar concorrência.

---

#### 6. Games & Power — onde o usuário gera poder ativamente

**Models:** `Game`, `Game2048Session`, `UserPowerGame`, `YoutubeWatchPower`, `YoutubeWatchHistory`, `ShortlinkPower`, `ShortlinkReward`, `ShortlinkCompletion`

**Por que esses models existem:**

**Mini-jogos:**
- `Game` = catálogo (2048, e outros que possam vir).
- `Game2048Session` = sessão validada server-side. **Por que validada server-side:** o cliente roda o jogo, mas o **servidor recalcula** (mesmo `game2048Engine.ts` que o cliente usa). Sem isso, qualquer trapaceiro envia "score = 999999".
- `UserPowerGame` = power ganho via mini-jogos.

**YouTube watch:**
- `YoutubeWatchPower` = power acumulado por assistir vídeos.
- `YoutubeWatchHistory` = histórico (qual vídeo, quanto tempo, quando). Auditoria + anti-fraude (evita assistir 1 vídeo 100x).

**Shortlinks (Linkvertise-style):**
- `ShortlinkPower` / `ShortlinkReward` / `ShortlinkCompletion` = três models porque há três momentos: definição do link (`Power`), recompensa configurada (`Reward`) e completion validada (`Completion`).

---

#### 7. Faucet — torneira de BLK

**Models:** `FaucetClaim`, `FaucetPartnerVisit`, `FaucetReward`

**Por que esses models existem:**
- `FaucetClaim` = cada claim com `userId`, `timestamp`, valor. Cooldown enforced via query (último claim < X minutos atrás).
- `FaucetPartnerVisit` = **visita ao parceiro** que o usuário precisa fazer antes de claim. Modela o gate "vai lá, fica 30s, volta e reivindica".
- `FaucetReward` = config de recompensa (range mín-máx, cooldown). Tunável no admin.

---

#### 8. Offerwall — múltiplos canais de receita

**Models:** `OfferEvent`, `InternalOfferwallOffer`, `InternalOfferwallAttempt`, `InternalOfferwallFrameHost`, `ReadEarnCampaign`, `ReadEarnRedemption`, `PtcSettings`, `PtcAdTier`, `PtpAd`, `PtpEarning`, `PtpView`, `ZeradsCallback`, `OfferwallMeCallback`

**Por que esses models existem:**

**Offer Events (unificado):**
- `OfferEvent` = **modelo unificado de evento de offer** de qualquer parceiro (genérico). Recebe webhook → cria event → worker processa → distribui BLK.

**Offerwall interno:**
- `InternalOfferwallOffer` = nossas próprias offers (não vêm de parceiro).
- `InternalOfferwallAttempt` = tentativa do usuário (começou, completou, falhou).
- `InternalOfferwallFrameHost` = **allowlist de domínios em iframe** — pra exibir offers de terceiros via iframe sem CSP bloquear.

**Read & Earn:**
- `ReadEarnCampaign` = campanhas onde usuário insere um código depois de ler conteúdo do parceiro.
- `ReadEarnRedemption` = códigos resgatados (1 por user por campanha).

**PTC (Paid To Click):**
- `PtcSettings` = configs globais (caps, rates).
- `PtcAdTier` = tiers de ad (preço por click).
- `PtpAd`, `PtpEarning`, `PtpView` = anúncios PTC + ganhos + visualizações.

**Callbacks de parceiros externos:**
- `ZeradsCallback` = log bruto de callbacks do parceiro Zerads (auditoria de receita).
- `OfferwallMeCallback` = idem pra OfferwallMe.

**Por que cada parceiro tem seu próprio callback model:** o shape do payload muda por parceiro. Guardamos o raw pra auditoria e debug, depois normalizamos pra `OfferEvent`.

---

#### 9. Tournaments — competição

**Models:** `Tournament`, `TournamentEntry`, `TournamentPrize`

**Por que esses models existem:**
- `Tournament` = competição timeboxada (data início/fim, regras).
- `TournamentEntry` = participação + score acumulado.
- `TournamentPrize` = distribuição de prêmios por posição.

Simples e isolado — pode rodar paralelo a tudo mais.

---

#### 10. Wallet / Blockchain — a parte on-chain

**Models:** `PolygonHdAddress`, `CcpaymentDepositEvent`, `TransparencyWalletSettings`, `TransparencyWalletSnapshot`, `TransparencyTrackedWallet`, `TransparencyLiquidityPoolPosition`, `TransparencyEntry`

**Por que esses models existem:**

**Depósitos custodiais:**
- `PolygonHdAddress` = endereço HD derivado por usuário (BIP-44). Cada usuário ganha seu endereço único derivado da carteira mestre. **Por que HD em vez de endereço único compartilhado:** atribuição automática — depósito chegou no endereço X → sabemos exatamente quem é o usuário.
- `CcpaymentDepositEvent` = eventos de depósito recebidos via CCPayment (gateway alternativo). Auditoria + reconciliação.

**Transparência on-chain:**
- `TransparencyWalletSettings` = config de quais carteiras são públicas.
- `TransparencyWalletSnapshot` = snapshot periódico do saldo (cron).
- `TransparencyTrackedWallet` = carteiras que o admin escolheu trackear publicamente.
- `TransparencyLiquidityPoolPosition` = posições em LPs (DEX).
- `TransparencyEntry` = entradas de auditoria pública.

**Por que tanto detalhe de transparência:** projeto Web3 vive de confiança. Mostrar publicamente "temos X BLK em treasury, Y em LP, Z em hot wallet" combate FUD. Snapshot histórico permite mostrar gráfico de evolução.

---

#### 11. Conteúdo & Streaming

**Models:** `StreamDestination`, `YoutubeVideoSubmission`, `YoutuberProfile`, `YoutuberRewardSettings`

**Por que esses models existem:**
- `StreamDestination` = destinos RTMP onde o admin streama (YouTube live). O backend faz captura via Xvfb+ffmpeg e empurra pra cá.
- `YoutubeVideoSubmission` = vídeos que **criadores parceiros** submetem pra serem assistidos por usuários (que ganham power).
- `YoutuberProfile` + `YoutuberRewardSettings` = perfis de criadores e suas configs de recompensa (alguns criadores recebem mais por view do que outros).

---

#### 12. Social, Support, Notificações

**Models:** `ChatMessage`, `PrivateMessage`, `SupportTicket`, `SupportMessage`, `SupportReply`, `PublicSupportTicket`, `PublicSupportMessage`, `Notification`, `BroadcastMessage`, `BroadcastMessageView`

**Por que esses models existem:**
- `ChatMessage` = chat público em tempo real (via Socket.io).
- `PrivateMessage` = DM entre usuários.
- `SupportTicket` + `SupportMessage` + `SupportReply` = sistema de suporte autenticado (usuário logado).
- `PublicSupportTicket` + `PublicSupportMessage` = suporte público (usuário não logado, ex: "perdi acesso"). Separado porque shape e regras são diferentes (rate-limit, captcha, etc.).
- `Notification` = notificações in-app por usuário.
- `BroadcastMessage` + `BroadcastMessageView` = mensagens broadcast do admin (anúncios). `View` rastreia quem viu (não duplicar).

---

#### 13. Admin & Auditoria — accountability

**Models:** `AuditLog`, `AuditEvent`, `AuditEventOutbox`, `AuditEventChain`, `SidebarNavConfig`, `DashboardBanner`, `DashboardUpdate`

**Por que esses models existem:**

**Auditoria em 4 camadas:**
- `AuditLog` = log clássico de ações admin (quem fez o quê, quando).
- `AuditEvent` = eventos estruturados (mais granulares).
- `AuditEventOutbox` = **padrão outbox** — antes do evento sair pra fora (Telegram, webhook externo), passa por aqui pra garantir entrega.
- `AuditEventChain` = **cadeia tipo blockchain interna** — cada evento contém hash do anterior. Permite detectar se alguém adulterou audit log no banco.

**Configuração de UI admin:**
- `SidebarNavConfig` = itens da sidebar do admin (editável sem deploy).
- `DashboardBanner` = banners exibidos no dashboard do usuário.
- `DashboardUpdate` = "novidades" mostradas pro usuário.

**Por que audit chain:** banco pode ser comprometido. Se admin malicioso editar `AuditLog`, ninguém saberia. Com chain (hash linkado), qualquer alteração quebra a cadeia — detectável.

---

#### 14. Telegram & Withdrawal — comunicação externa

**Models:** `WithdrawalTelegramSettings`, `TelegramOutboxEvent`, `CallbackQueue`, `Payout`

**Por que esses models existem:**
- `WithdrawalTelegramSettings` = config de notificação por usuário (recebe alerta no Telegram quando saque rola).
- `TelegramOutboxEvent` = padrão outbox — eventos pendentes que o `telegram-worker` consome e envia. Garante que se Telegram cair, evento não se perde.
- `CallbackQueue` = fila de callbacks externos pendentes (genérico).
- `Payout` = registro de saques on-chain (txHash, status, valor).

---

### Decisões transversais do schema

#### 1. `Decimal` em vez de `Float` pra dinheiro

Saldos BLK, valores em USD, hashrates — tudo `Decimal`. **Por quê:** float dá imprecisão (0.1 + 0.2 ≠ 0.3). Em dinheiro, isso vira centavos perdidos ou criados. Decimal preserva precisão exata.

#### 2. `dateKey` derivado em vez de comparar timestamp

Tabelas como `DailyCheckin` têm `dateKey` (string `YYYY-MM-DD`) em vez de comparar `DATE(timestamp)`. **Por quê:** queries `WHERE dateKey = '2026-05-26'` são indexáveis; `WHERE DATE(timestamp) = '...'` não. E timezone é resolvido na hora de gerar o `dateKey` — banco fica neutro.

#### 3. Tabelas de dedupe explícitas (`*DedupeTick`)

Aparecem em vários domínios. **Por quê:** race conditions em distribuição de recompensa. Em vez de tentar travar com transação, registramos o "tick" (combinação user+ação+timestamp) numa tabela com unique constraint. Insert duplo = erro = recompensa não dada duas vezes.

#### 4. Outbox pattern (`*Outbox`)

Aparece em audit, telegram. **Por quê:** entrega externa não pode estar dentro da transação principal. Padrão outbox: na transação, gravo na tabela outbox; depois um worker consome e entrega. Garante atomicidade interna + eventual delivery externa.

#### 5. Ledgers em vez de campo "total"

Não temos `User.totalBlkEarned`. Temos `BlkRewardLog` que é reconstrutível por soma. **Por quê:** verdade única — soma do ledger. Campo agregado dessincroniza. Se precisar de performance, virá cache (Redis), não denormalização no banco.

#### 6. Soft-deletes raros

Maioria das tabelas usa `deletedAt` ou status flag em vez de DELETE físico. **Por quê:** auditoria. Em produto com dinheiro, "ele apagou X" é informação que pode ser necessária 6 meses depois.

---

### Resumindo

- **Schema único** porque Prisma + Postgres precisam disso, mesmo monolito sendo modular.
- **~12 domínios**, cada um com seus models — mesmo agrupamento dos módulos em `server/modules/`.
- **Dinheiro vira `Decimal`**, datas viram `dateKey` indexável.
- **Outbox** desacopla entrega externa de transação interna.
- **Audit chain** dá tamper-evidence.
- **Ledger** é a verdade — agregados são derivados, não denormalizados.

---

---

## Parte 4 — Infraestrutura e deploy

### Onde tudo roda

**Um único VPS.** Sem cluster, sem K8s em produção, sem load balancer externo. Tudo num servidor só.

- **Host:** `89.167.119.164`
- **App root:** `/root/block-miner-v3`
- **Orquestração:** Docker Compose (`docker-compose.yml` na raiz)
- **TLS:** Let's Encrypt em `/etc/letsencrypt`, bind-mounted no container nginx
- **Domínio:** `blockminer.space`

**Por que um único VPS:** o produto não precisa de mais. Picos atuais cabem num servidor decente. Operar 1 máquina é radicalmente mais simples que operar N — backup, upgrade, rede, firewall, observabilidade — tudo num lugar só. K8s está no repo (`k8s/`) caso precise escalar no futuro, mas não está em uso.

---

### Os 6 containers

```
┌─────────────────────────────────────────────────────────────┐
│ Internet                                                    │
└──────────────────────┬──────────────────────────────────────┘
                       ▼
        ┌──────────────────────────┐  porta 80/443
        │  block-miner-nginx       │  TLS + gzip + reverse proxy
        │  nginx:alpine            │
        └──────────────┬───────────┘
                       │ proxy para 127.0.0.1:3000
                       ▼
        ┌──────────────────────────┐  porta 3000 (loopback)
        │  block-miner-app         │  Express + Socket.io + SPA
        │  build local (Node 20)   │
        └─────┬──────────────┬─────┘
              │              │
       ┌──────▼─────┐  ┌─────▼─────┐
       │  block-    │  │  block-   │
       │  miner-db  │  │  miner-   │
       │  postgres  │  │  redis    │
       │  15-alpine │  │  7-alpine │
       └──────▲─────┘  └─────▲─────┘
              │              │
        ┌─────┴──────────────┴────────────┐
        │  block-miner-worker             │  BullMQ jobs
        │  (reusa imagem da app)          │
        └─────────────────────────────────┘
        ┌─────────────────────────────────┐
        │  block-miner-telegram-worker    │  Outbox Telegram
        │  (reusa imagem da app)          │
        └─────────────────────────────────┘
```

| Container | Imagem | O que faz | Por que existe separado |
|---|---|---|---|
| **`block-miner-nginx`** | `nginx:alpine` | TLS termination, gzip, reverse proxy pra `app:3000`, serve `certbot-www/` pra renovação Let's Encrypt | Separar TLS da app — atualizar cert sem mexer no Node. Nginx também é melhor que Express em servir estático e gerenciar conexões persistentes. |
| **`block-miner-app`** | build local (Dockerfile) | Express 5 + Socket.io + serve SPA. Escuta em `127.0.0.1:3000` (não exposta direto na internet — só nginx fala com ela) | É a aplicação. Único container que recebe request HTTP de fora (via nginx). |
| **`block-miner-db`** | `postgres:15-alpine` | PostgreSQL. Volume nomeado `postgres_data` persistido | Banco isolado, restart próprio, healthcheck `pg_isready`. App + worker só sobem depois que DB tá saudável (`depends_on: condition: service_healthy`). |
| **`block-miner-redis`** | `redis:7-alpine` | Cache + filas BullMQ | Mesma lógica do DB — isolado, healthcheck `redis-cli ping`. |
| **`block-miner-worker`** | reusa imagem da app | Roda `node dist/server/jobs/runBlockminerWorker.js`. Consome filas BullMQ | Trabalho lento (ciclos BLK, enriquecimento de IP, snapshots) fora da request HTTP. Se travar, não derruba a API. |
| **`block-miner-telegram-worker`** | reusa imagem `block-miner-worker` | Roda `services/telegram-proof-worker/telegramProofWorker.js`. Consome `TelegramOutboxEvent` | Isolar Telegram do app — se a API do Telegram cair, outbox acumula, app segue. |

**Detalhes importantes:**
- App bindada em `127.0.0.1:3000`, **não** `0.0.0.0:3000`. Só nginx (que tá na mesma rede docker) consegue chegar nela. Reduz superfície de ataque.
- Worker e telegram-worker **não expõem porta** — não recebem HTTP, só consomem filas.
- DB e Redis expõem porta no host (`DB_PUBLISH_PORT:5432`, `REDIS_PUBLISH_PORT:6379`) — útil pra admin local via tunnel SSH, mas firewall do host bloqueia acesso externo direto.

---

### Volumes — o que persiste

```yaml
volumes:
  postgres_data:              # dados do Postgres
  ./data:/app/data            # dados de runtime da app
  ./backups:/app/backups      # backups gerados pelo npm run backup
  ./uploads:/app/uploads      # uploads de usuário (imagens de miner, avatares)
  ./data/uploads:/app/data/uploads  # alias legado (compat)
  ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
  /etc/letsencrypt:/etc/letsencrypt:ro
  ./certbot-www:/var/www/certbot:rw   # pra desafio ACME http-01
  ./logs/nginx:/var/log/nginx
```

**Por que bind-mounts em vez de só named volumes:**
- `nginx.conf`, `letsencrypt` — quero editar no host e refletir no container sem rebuild.
- `uploads`, `backups`, `data` — quero acesso direto via SSH pra inspecionar, backupar pra fora, fazer download.
- `postgres_data` é **named volume** porque queremos que o Docker gerencie (mais portável, performance melhor em alguns FS, evita acidentes de `rm -rf`).

---

### Dockerfile — build em 2 estágios

**Estágio 1: `frontend-builder` (Node 20 slim)**
- Instala deps do `client/`
- Copia `dist/server/services/game2048Engine.js` pra dentro do client (engine única — server e client usam o mesmo arquivo de regras do 2048)
- Roda `npm run build` → gera `client/dist/`

**Estágio 2: runtime (Node 20 slim)**
- Instala via `apt`: `openssl` (Prisma precisa), `rclone` (backup pra cloud), `netcat-openbsd` (debug de rede), `postgresql-client` (psql no container pra emergência), **`xvfb`** + **`ffmpeg`** (captura de tela do admin pra RTMP)
- Instala deps prod (`npm install --omit=dev`)
- Roda `prisma generate` (gera client Prisma com binários certos)
- Compila TS (server + backend) com `tsc` rodado dentro do container
- Copia `client/dist/` do estágio 1
- `ENTRYPOINT docker-entrypoint.sh` → roda migrations + `node dist/server/server.js`

**Por que multi-stage:** imagem final não carrega `node_modules` do client nem fonte React — só o bundle. Imagem fica ~70% menor que um build single-stage.

**Por que `xvfb` + `ffmpeg` no runtime:** o admin tem uma feature de **stream pro YouTube** — ele abre uma página do dashboard num browser headless (Playwright), captura o display virtual (`xvfb`) e codifica/empurra pra RTMP (`ffmpeg`). Tudo dentro do mesmo container da app.

---

### Boot da app — `docker-entrypoint.sh`

Quando o container `block-miner-app` sobe:

1. **Espera DB ficar pronto** (loop com `pg_isready`).
2. **Roda migrations** Prisma (`prisma migrate deploy`).
3. **Roda seed** se precisar.
4. **Inicia o processo** Node (`node dist/server/server.js`).

**Por que migration no entrypoint (e não num job separado):** simplicidade. Atualizou imagem → derrubou container → subiu de novo → migra → roda. Sem step manual entre deploy e start.

**Risco:** se a migration falhar, app não sobe. **Mitigação:** todas as migrations são testadas em staging (e revisadas) antes do deploy de produção.

---

### Env files — como o ambiente é configurado

```yaml
env_file:
  - .env.production
  - path: .env
    required: false
```

**Ordem de carregamento:** `.env.production` primeiro, depois `.env` por cima (override). Ambos vivem **no host**, gitignored. `.env.production` tem secrets reais; `.env` é override local opcional (raramente usado em produção).

Além disso, no `docker-compose.yml` há `environment:` inline com defaults — esses só preenchem se a variável não veio do env_file:

```yaml
environment:
  REDIS_URL: "${REDIS_URL:-redis://redis:6379}"
  PG_POOL_MAX: "${PG_POOL_MAX:-40}"
```

**Vars importantes:**

| Var | Pra que serve |
|---|---|
| `NODE_ENV` | sempre `production` no compose |
| `DATABASE_URL` | hard-coded no compose pra apontar `db` service |
| `REDIS_URL` | idem pra `redis` service |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` | Hostinger SMTP, **porta 587**, STARTTLS (`SMTP_SECURE=false`) |
| `JWT_SECRET` | assinatura JWT |
| `ZERADS_CALLBACK_SECRET` | senha que o Zerads envia em cada callback |
| `ZERADS_SERVER_IP` | IP autorizado do parceiro (default `162.0.208.108`) |
| `VITE_*` | vars baked no build do cliente (WalletConnect, Polygon RPC, Turnstile, etc.) |

⚠️ **Vars `VITE_*` são compiladas no JS do cliente em build-time.** Não dá pra mudar elas em runtime — pra atualizar precisa rebuild. E elas precisam estar disponíveis **no `docker compose build`**, não no `up`. Por isso o compose tem:

```yaml
build:
  args:
    VITE_WALLETCONNECT_PROJECT_ID: ${VITE_WALLETCONNECT_PROJECT_ID:-}
```

…que pega do shell na hora do build.

---

### Deploy — `scripts/vm-deploy-local-over-ssh.py`

Deploy é via SSH, scriptado em Python. Não usa CI/CD externo (GitHub Actions / GitLab) por simplicidade. Fluxo:

```
[local dev]
  ↓ python3 scripts/vm-deploy-local-over-ssh.py
  ↓
  1. git archive HEAD → tarball
  2. sftp tarball → VM
  3. SSH na VM:
     a. backup do .env.production (cópia preservada)
     b. extrai tarball sobre /root/block-miner-v3
     c. restaura .env.production (porque o git archive não inclui)
     d. docker compose up -d --build
     e. healthcheck nas portas
```

**Por que git archive em vez de git pull:**
- Não precisa de git no servidor (menos coisa instalada).
- Não precisa de chave SSH com acesso ao repo na VM.
- O que sobe é exatamente o que está no `HEAD` local — sem `.git/`, sem branches alheias, sem submódulos sujos.

**Por que `--build` sempre:** o Dockerfile tem cache de layers, então rebuild é rápido se só TS mudou. Forçar `--build` garante que código novo está na imagem (sem `--build` ele reusa imagem antiga).

---

### O quirk dos quirks: `restart` ≠ `up -d`

Esse é o pior gotcha do projeto. Vale tatuagem.

```bash
# ❌ ERRADO — se você mudou .env.production e roda isso, o container
# continua com o env antigo. .env.production NÃO é recarregado.
docker compose restart app

# ✅ CERTO — recria o container com o env_file relido
docker compose up -d --force-recreate app worker
```

**Por que:** `docker compose restart` literalmente faz `stop` + `start` no container existente. Container existente tem o env que foi carregado quando ele foi **criado**. `restart` não recria — só reinicia o processo dentro do container.

**Quando isso já mordeu o projeto:** patch de SMTP. `scripts/vm-patch-smtp.py` atualizava `.env.production` e dava `restart`. Vars SMTP "sumiam" — porque o container nunca via as novas. Fix: o script foi atualizado pra usar `up -d --force-recreate app worker`.

**Regra:** qualquer mudança em `.env.production` → `up -d --force-recreate`. Sem exceção.

---

### O outro quirk: SMTP porta 465 bloqueada

Hostinger SMTP oferece duas portas:
- **465** — SSL puro (TLS desde o início da conexão).
- **587** — STARTTLS (começa em plaintext, faz `STARTTLS` pra upgradar).

A maioria dos tutoriais e bibliotecas defaultam pra 465. Mas o **provedor da VM bloqueia outbound na porta 465**. Testes com `nc` e `openssl s_client` confirmaram: 465 dá timeout, 587 conecta normal.

**Config:**
```
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=587
SMTP_SECURE=false   # false porque STARTTLS faz upgrade depois
SMTP_USER=...
SMTP_PASS=...
```

`SMTP_SECURE=false` parece errado mas é certo pra STARTTLS — o `nodemailer` faz o upgrade automaticamente. `true` seria pra 465 (SSL implícito).

---

### Healthchecks

**DB:**
```yaml
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U blockminer -d blockminer_db"]
  interval: 5s
  timeout: 5s
  retries: 10
```

**Redis:**
```yaml
healthcheck:
  test: ["CMD", "redis-cli", "ping"]
  interval: 5s
  timeout: 3s
  retries: 20
```

**App e workers** dependem de `db` e `redis` saudáveis (`depends_on: condition: service_healthy`). Garante que app não tenta conectar num Postgres ainda subindo.

**App não tem healthcheck próprio (atualmente).** Idealmente teria — `GET /health` que checa DB + Redis. Refactor futuro.

---

### Logs

- App e workers usam `logger` interno (Pino/console) → stdout/stderr → Docker captura.
- `docker compose logs -f app` mostra logs em tempo real.
- Nginx escreve em `./logs/nginx/` (bind-mount) — `access.log` e `error.log` legíveis direto no host.
- Não há agregador externo (Datadog, Loki) por enquanto — logs ficam no host.

---

### Backup

`npm run backup` (rodado via cron ou manualmente):
1. Dump do Postgres (`pg_dump` ou Prisma data dump).
2. Compacta em `./backups/`.
3. Opcionalmente: sobe pra cloud via `rclone` (instalado no container).

`./backups/` é bind-mount — backups ficam acessíveis no host pra cópia externa.

---

### Scripts úteis (`scripts/`)

| Script | Pra que serve |
|---|---|
| `vm-deploy-local-over-ssh.py` | **Deploy completo** — git archive → sftp → rebuild |
| `vm-patch-smtp.py` | Patch focado nas vars SMTP + `force-recreate` |
| `fix-and-redeploy.py` | Quando migration quebra — fix + rebuild |
| `fraud-enrich-ips.mjs` | Enriquece `UserIpLog` com ASN + proxy detection (background fill) |
| `backup.js` | Backup do banco (chamado por `npm run backup`) |
| `security-audit.mjs` | Auditoria de segurança das deps (`npm run audit:security`) |
| `clear-faucet-inventory-expiry.mjs` | Limpa inventário expirado de faucet |
| `fixDuplicateMinerImageUrls.js` | Cleanup pontual de URLs duplicadas |
| `openrouter-ask.mjs` | Helper LLM ad-hoc (pra dev) |

---

### Resumindo a infra

- **1 VPS**, **6 containers**, **1 docker-compose.yml**.
- **nginx** termina TLS, fala com a app em loopback.
- **App + 2 workers** rodam a mesma imagem, processos diferentes.
- **DB + Redis** isolados, healthchecks, dependência declarada.
- **Bind-mounts** pro que o operador toca; **named volume** pra dados do Postgres.
- **`.env.production`** é a fonte da verdade de config — `up -d --force-recreate` pra aplicar mudanças.
- **Deploy** é script Python via SSH, sem CI/CD externo, com backup/restore automático do `.env.production`.
- **Quirks tatuados:** `restart` não recarrega env_file, SMTP só na 587, `VITE_*` é build-time.

---

---

## Parte 5 — Fluxos críticos (end-to-end)

Os fluxos abaixo descrevem o que **acontece de fato** quando ações importantes rolam. Cada fluxo nomeia módulos, services e tabelas envolvidos pra você poder caçar o código.

---

### Fluxo 1 — Registro de usuário

```
[client]  POST /api/auth/register  { email, password, refCode?, turnstileToken }
   │
   ▼
[backend mount]  app.use("/api/auth", authRouter)
   │
   ▼
[server/modules/auth]
   1. Valida shape via Zod (auth.schemas.ts)
   2. Verifica Turnstile (Cloudflare captcha)
   3. Verifica IP — UserIpLog + IpIntelligenceCache
      └─ Se IP é proxy/VPN/datacenter, bloqueia ou marca pra review
   4. Hash da senha (bcryptjs)
   5. Gera User row + atribui referrer (se refCode válido)
   6. Cria PolygonHdAddress derivado da carteira mestre
      └─ usa BIP-44, index = User.id (1 endereço único por usuário)
   7. Envia email de verificação (nodemailer → SMTP 587)
   8. Retorna { userId, requiresEmailVerification: true }
```

**Coisas importantes:**
- O endereço HD é gerado **na hora do registro**, não no primeiro depósito. Por quê: latência. Quando o usuário clica "depositar", a tela já tem o endereço pronto.
- Se `refCode` veio, registra `Referral { referrerId, refereeId }`. Earnings vêm depois (`ReferralEarning` por ação do referee).
- A verificação de IP **não bloqueia** todos os proxies — só os de alto risco (datacenter conhecido, ASN flagged). Bloquear tudo afetaria usuários legítimos atrás de CGNAT/VPN corporativa.

---

### Fluxo 2 — Login

```
[client]  POST /api/auth/login  { email, password, turnstileToken }
   │
   ▼
[server/modules/auth/login]
   1. Valida Turnstile
   2. Verifica lockout em memória (AUTH_LOCKOUT_USE_MEMORY=true)
      └─ 5 falhas em 15min → bloqueia 30min
   3. Busca User por email
   4. Compara senha (bcrypt)
   5. Decide se exige 2FA via shouldRequireEmailTwoFactorForLogin():
      └─ se feature globalmente desligada (env)         → não exige
      └─ se env força "required for all users"          → exige
      └─ se env força "required for admins" e é creator → exige
      └─ se user.isTwoFactorEnabled (TOTP app)          → exige
      └─ se user.emailTwoFactorEnabled (código email)   → exige
      └─ caso contrário                                 → NÃO exige
   6. Se exigiu 2FA:
      a. Emite challenge (token temporário) e dispara código por email
      b. Cliente reenvia POST /api/auth/login com challengeToken + code
      c. Valida o code → segue
   7. Gera JWT (curto) + RefreshToken (salvo em DB)
   8. Registra Session
   9. Loga IP em UserIpLog (assíncrono)
   10. Retorna { jwt, refreshToken, user }
```

**Importante:** 2FA no login é **opcional e controlado pelo usuário** nas configs. Por padrão, conta criada não tem 2FA ativo. O usuário pode habilitar **email 2FA** (código por email — `emailTwoFactorEnabled`) ou **TOTP app** (Google Authenticator — `isTwoFactorEnabled`). Cada flag é independente; qualquer um dos dois aciona o challenge no login.

Há **três sobrescritas globais via env** que podem forçar 2FA mesmo sem o usuário ter ativado:
- Feature totalmente desligada (kill switch).
- Forçar pra todos os usuários.
- Forçar só pra admins/creators.

Código relevante: `server/modules/auth/login/login.twoFactor.ts:46–61` (função `shouldRequireEmailTwoFactorForLogin`).

**Por que rate-limit em memória:** o processo da app é único. Memória basta e evita advisory lock no Postgres a cada tentativa.

**Por que refresh token em DB:** permite **revogar sessão remota**. JWT puro é stateless — uma vez emitido, vale até expirar. Refresh token em DB pode ser deletado/expirado quando o usuário faz logout em outro device.

---

### Fluxo 3 — Ciclo de mining (auto-mining V2)

Esse é o fluxo central do produto.

**Setup (uma vez):**
```
Usuário compra/ganha um Miner do catálogo
  └─ UserOwnedMachine row criada
  └─ Miner ativo dentro de UserRack/UserRoom
```

**Quando o usuário começa uma sessão de auto-mining:**
```
[client]  POST /api/auto-mining/v2/start
   │
   ▼
[server/modules/?  → routes/auto-mining-gpu.ts]
   1. Valida que usuário tem miner ativo
   2. Cria AutoMiningV2Session { userId, startedAt, expiresAt }
   3. Retorna sessionId
```

**Loop de impressão de banner (durante a sessão):**
```
[client] tela mostra banner de ad
[client] POST /api/auto-mining/v2/impression { sessionId, adId }
   │
   ▼
[server]
   1. Valida sessão ativa
   2. Verifica dedupe (UserDailyTaskDedupeTick equivalente — não dar grant 2x pro mesmo ad)
   3. AutoMiningV2BannerImpression row
   4. Calcula power grant (baseado no tier do ad + hashrate do miner)
   5. AutoMiningV2PowerGrant row
   6. Emite via Socket.io: "power_granted" → cliente atualiza saldo na hora
```

**Ciclo de recompensa BLK (rodando em background, via cron):**
```
[server/cron]  cron job a cada N minutos
   │
   ▼
[server/services/blkDistribution]
   1. Lê BlkEconomyConfig (taxa de emissão atual)
   2. Cria BlkRewardCycle { startedAt, totalEmitted: 0 }
   3. Para cada usuário com sessão ativa:
      a. Soma AutoMiningV2PowerGrant não-creditado
      b. Aplica fórmula: BLK = power × multiplier × economy.emissionRate
      c. Insere BlkRewardLog (audit trail)
      d. Atualiza saldo via Transaction
      e. Marca grants como creditados
   4. Fecha cycle, soma total em BlockDistribution
   5. Emite via Socket.io broadcast: "cycle_complete"
```

**Por que essa separação de tabelas:**
- `BannerImpression` = fato físico (usuário viu o ad).
- `PowerGrant` = fato derivado (quanto power isso vale).
- `BlkRewardLog` = fato financeiro (quanto BLK isso virou).
- `Transaction` = movimento de saldo (universal).

Cada camada é auditável independente. Se algo deu errado na conversão de power → BLK, dá pra reprocessar a partir de `PowerGrant` sem reabrir os ads.

---

### Fluxo 4 — Check-in diário (com streak)

```
[client]  POST /api/checkin
   │
   ▼
[server/modules/checkin]
   1. Resolve dateKey do usuário (YYYY-MM-DD no timezone configurado)
   2. UNIQUE check: DailyCheckin { userId, dateKey } já existe?
      └─ Sim → 409 "já fez check-in hoje"
   3. Calcula streak:
      a. busca último DailyCheckin do user
      b. se foi ontem → streak += 1
      c. se foi anteontem → quebrou streak (ou aplica recovery se elegível)
      d. atualiza User.streakCount
   4. Calcula recompensa:
      a. base reward (de checkin.rewards.ts)
      b. se streak hit milestone (7, 30, 100 dias):
         └─ busca CheckinStreakMilestone definido
         └─ cria UserCheckinStreakReward
   5. Insere DailyCheckin
   6. Credita via Transaction
   7. Emite via Socket.io
   8. Retorna { reward, streakCount, nextMilestone }
```

**Por que `dateKey` em vez de comparar timestamp:**
Query `WHERE dateKey = '2026-05-26'` é indexada e instantânea. Comparar `DATE(timestamp)` força full scan. E o timezone fica resolvido na hora de gerar a string — banco fica neutro.

**Por que streak recovery existe:**
Sem recovery, qualquer falha (viagem, internet caiu) zera streak — desmotiva. Recovery oferece "perdoar 1 dia" pago ou via item. É uma feature monetizada (receita) + UX (usuário não desiste).

---

### Fluxo 5 — Callback de offerwall (Zerads)

Zerads é offerwall PTC externo. Quando o usuário clica num ad e completa, o **Zerads chama nosso endpoint público** (não vai via cliente — é server-to-server).

```
[Zerads server]  GET https://blockminer.space/zeradsptc.php
                    ?pwd=ZERADS_CALLBACK_SECRET
                    &user=12345          ← User.id
                    &amount=2            ← clicks
                    &clicks=2
   │
   ▼
[nginx]  proxy → app:3000
   │
   ▼
[server/modules/zerads]  routes registradas em path NÃO-/api
   1. Valida IP do request == ZERADS_SERVER_IP (default 162.0.208.108)
   2. Valida pwd == ZERADS_CALLBACK_SECRET
   3. Grava ZeradsCallback row (raw payload, audit)
   4. Calcula recompensa:
      a. amount * ZERADS_EXCHANGE_RATE (default 0.07 ZER/click)
      b. cap em ZERADS_MAX_ZER_PER_CALLBACK (default 5) — proteção contra explosão
   5. Cria OfferEvent normalizado { source: 'zerads', userId, amount }
   6. Enfileira processamento (BullMQ → block-miner-worker)
   7. Retorna 200 OK pro Zerads
```

**Por que IP + senha (não JWT):** Zerads é parceiro externo, não tem como assinar JWT. Modelo: senha compartilhada + whitelist de IP. Se Zerads mudar IP, atualizamos `ZERADS_SERVER_IP` no env.

**Por que enfileirar em vez de processar inline:**
1. Callback precisa retornar rápido (Zerads tem timeout).
2. Processamento (split com referrer, audit chain, broadcast Socket.io) demora.
3. Worker faz o trabalho pesado, callback só registra.

**Por que cap (`ZERADS_MAX_ZER_PER_CALLBACK`):** bug do parceiro mandando `clicks=999999` não pode zerar nossa treasury. Cap é defesa em profundidade.

**Por que `OfferEvent` normalizado:** offerwall vem de vários parceiros (Zerads, OfferwallMe, internal). Cada um tem payload diferente. `OfferEvent` é o **shape unificado** que o worker processa — independente da origem. `ZeradsCallback` fica como auditoria do que recebemos cru.

---

### Fluxo 6 — Depósito on-chain (Polygon)

Usuário quer depositar MATIC/USDC pra comprar miners.

**Setup (já feito no registro):**
- Cada usuário tem `PolygonHdAddress` derivado.

**Fluxo do depósito:**
```
[client]  GET /api/wallet/deposit-address
   │
   ▼ retorna { address: "0xabc...", chainId: 137 }

[user]  manda transação on-chain pro endereço retornado

[server/services/deposit-watcher]  (cron ou listener)
   1. Polling do RPC Polygon (ou listener de eventos do contrato)
   2. Detecta nova transferência pro endereço HD
   3. Identifica o User dono do endereço (lookup em PolygonHdAddress)
   4. Cria CcpaymentDepositEvent (ou equivalente) { txHash, userId, amount, token }
   5. Em transação Postgres:
      a. Confirma N blocos (proteção reorg)
      b. Credita saldo via Transaction
      c. Notifica via Socket.io + Telegram outbox
```

**Por que HD address por usuário (em vez de 1 endereço compartilhado com memo):**
- Atribuição automática — depósito chegou em `0xabc...`, é do user 12345. Sem memo, sem confusão.
- Privacidade — usuários não veem depósitos de outros se compartilharem block explorer.
- Compatibilidade — alguns contratos não suportam memo/extraData.

**Por que confirmações:** reorg de chain. Tx aparece, depois "some" se houve fork. Esperar N blocos (Polygon: ~6-12) torna isso virtualmente impossível.

**Trade-off:** cada endereço HD precisa ser monitorado. Com 10k usuários, 10k endereços. Solução: contrato `BlockMinerDeposit.sol` agrupa depósitos com `forwarder` pattern — o contrato emite evento, o backend escuta um único endereço de contrato.

---

### Fluxo 7 — Saque (withdrawal)

O fluxo mais sensível. Cuidado redobrado.

```
[client]  POST /api/wallet/withdraw  { amount, destinationAddress }
   │
   ▼
[server/modules/wallet]
   1. Carrega User { emailTwoFactorEnabled, ... }
   2. Se user.emailTwoFactorEnabled === true:
      a. Não veio code/challengeToken? → emite challenge (envia código por email),
         retorna { requires2fa: true, challengeToken }
      b. Cliente reenvia com { withdrawalCode, withdrawalChallengeToken }
      c. Valida code antes de prosseguir
      Caso emailTwoFactorEnabled === false → segue direto, sem 2FA
   3. Valida amount:
      a. >= mínimo configurado
      b. <= saldo User.balance
      c. <= cap diário/mensal
   4. Anti-fraude:
      a. Verifica idade da conta (conta nova = bloqueio)
      b. Verifica multi-account risk score
      c. Verifica IP intelligence (proxy/VPN = manual review)
      d. Verifica histórico de chargebacks/reverses
   5. Debita saldo via Transaction (estado: PENDING_WITHDRAWAL)
   6. Cria Payout { userId, amount, destAddress, status: PENDING, txHash: null }
   7. Enfileira processamento (BullMQ)
   8. Notifica Telegram (TelegramOutboxEvent → telegram-worker → user + admin)
   9. Retorna { payoutId, status: 'pending_review' }
```

**Processamento async (worker):**
```
[block-miner-worker] consome fila withdrawal
   1. Re-verifica Payout.status (não foi cancelado)
   2. Verifica saldo on-chain da hot wallet
      └─ se insuficiente, alerta admin via Telegram, deixa pending
   3. Assina e envia tx (ethers)
   4. Aguarda confirmações
   5. Atualiza Payout { status: COMPLETED, txHash }
   6. Notifica via Socket.io + Telegram
```

**2FA no saque é opt-in.** Se o usuário ativou `emailTwoFactorEnabled` nas configs, o saque exige código enviado por email antes de processar. Se não ativou, o saque segue direto pra etapa de validação de saldo e anti-fraude. Não há override de env aqui (diferente do login) — é estritamente decisão do usuário. Código relevante: `server/modules/wallet/wallet.controller.ts:337–346`.

**Recomendação:** o front incentiva ativar 2FA por email pra qualquer conta com saldo relevante. Mas o sistema não bloqueia saque por isso.

**Por que anti-fraude tão pesado:** offerwall + faucet atrai bot farm. Sem fraud check, qualquer botnet com 1000 contas drena treasury num dia.

**Por que async:** assinar e enviar tx é lento (espera RPC, espera bloco). Bloquear request HTTP por isso é ruim.

**Por que `Payout` separado de `Transaction`:** `Transaction` é o ledger de saldo interno; `Payout` é o registro on-chain. Saldo já foi debitado no insert de `Transaction`; `Payout` rastreia o que acontece **depois** (assinatura, envio, confirmação, falha, retry).

---

### Fluxo 8 — Faucet claim

```
[client]  GET /api/faucet/can-claim  (consulta cooldown)
[client]  visita parceiro (gera FaucetPartnerVisit)
[client]  POST /api/faucet/claim
   │
   ▼
[server/modules/faucet]
   1. Verifica cooldown (último FaucetClaim do user)
   2. Verifica FaucetPartnerVisit recente (gate "passou pelo parceiro")
   3. Anti-fraude:
      a. Mesmo IP em N contas recentes? → bloqueia
      b. IpIntelligenceCache flag de proxy? → bloqueia/reduz
   4. Sorteia recompensa (range de FaucetReward config)
   5. Cria FaucetClaim row
   6. Credita via Transaction
   7. Emite Socket.io
```

**Por que `FaucetPartnerVisit` separado:** o parceiro paga pra mostrar página. Sem evidência de visita real, não há receita pra cobrir o claim. Gate explícito.

---

### Fluxo 9 — Audit chain (tamper-evident)

Não é fluxo de usuário, mas roda atrás de todos. Toda ação sensível (saque, mudança de saldo administrativa, deleção, etc.) passa por aqui.

```
[any action] → emit audit event
   │
   ▼
[server/services/auditEventService]
   1. Cria AuditEvent { actor, action, target, payload }
   2. Em transação:
      a. Busca último AuditEventChain (hash do anterior)
      b. Calcula hash = SHA256(prevHash + thisEvent)
      c. Insere AuditEventChain { eventId, prevHash, hash }
   3. Enfileira em AuditEventOutbox (pra entrega externa: webhook, S3)
```

**Por que chain:** se admin malicioso editar `AuditLog`, hash do próximo evento não bate. Verificável por qualquer auditor com snapshot do banco.

**Por que outbox:** garantir que evento crítico chegue a um sistema externo (cold storage, monitor) mesmo se a app cair logo após o commit local.

---

### Resumindo os fluxos

- **Registro/login** — Turnstile + IP intel + 2FA **opt-in** (email ou TOTP app, controlado pelo usuário; pode ser forçado globalmente por env). JWT curto + RefreshToken em DB.
- **Mining** — banner impression → power grant → cron BLK distribution → cycle log. 4 camadas auditáveis.
- **Check-in** — `dateKey` indexável, streak com recovery monetizado.
- **Offerwall callback** — IP+senha do parceiro, raw audit, normalização pra `OfferEvent`, processamento async.
- **Depósito** — HD address por usuário, watcher, N confirmações.
- **Saque** — 2FA por email **se** usuário ativou (opt-in), anti-fraude pesado, `Payout` separado de `Transaction`, processamento async no worker.
- **Faucet** — partner visit gate + IP check.
- **Audit chain** — todo evento sensível encadeado com hash do anterior.

A constante em todos: **trabalho pesado vai pro worker via fila**, **trabalho síncrono é o mínimo pra responder rápido**, **dinheiro nunca move sem auditoria correspondente**.

---

## Fim da documentação base

Essas 5 partes cobrem o BlockMiner em profundidade suficiente pra alguém novo entender o "o quê" e o "porquê" do projeto:

1. **Visão geral e stack** — o que é o produto, que tecnologias usa, por que cada uma.
2. **Arquitetura monolito modular** — como o código é organizado, por que essas fronteiras.
3. **Modelo de dados** — 14 domínios no banco, por que cada um existe.
4. **Infraestrutura e deploy** — 6 containers, deploy via SSH, quirks operacionais.
5. **Fluxos críticos** — registro, login, mining, check-in, offerwall, depósito, saque, faucet, audit.

Outros recursos em `docs/`:
- `audits/` — auditorias arquivadas
- `rules/` — regras/convenções do projeto
- `archive/` — relatórios históricos de fixes e migrations
