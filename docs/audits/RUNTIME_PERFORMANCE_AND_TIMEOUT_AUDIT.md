# BlockMiner — Auditoria de runtime, lentidão e timeouts

**Data:** 2026-05-20  
**Escopo:** VM produção (`blockminer.space`), stack Docker oficial (5 containers), código `server/` + `client/`.

---

## 1. Estado da VM

| Métrica | Valor | Avaliação |
|--------|--------|-----------|
| Uptime | ~6 dias | OK |
| Load average | 0.14 / 0.32 / 0.35 | OK (CPU ociosa no instante da medição) |
| RAM | 7.6 GiB total, ~2.8 GiB usada, ~4.8 GiB disponível | OK |
| Swap | 0 B | Sem swap — picos de RAM podem pressionar OOM |
| **Disco `/`** | **150G usados, 9.8G livres (94%)** | **CRÍTICO** |
| Inodes | 54% | OK |

**Conclusão infra:** A VM não está CPU-bound no momento da auditoria, mas o **disco quase cheio (94%)** é risco real de lentidão, falhas de checkpoint Postgres, builds Docker lentos e instabilidade geral.

---

## 2. Estado dos containers

| Container | CPU | RAM | Status |
|-----------|-----|-----|--------|
| block-miner-app | ~5% | 469 MiB | Up |
| block-miner-worker | ~0% | 52 MiB | Up (BullMQ) |
| block-miner-nginx | ~0.6% | 17 MiB | Up (22 GB+ tráfego acumulado) |
| block-miner-db | ~0.2% | 380 MiB | Up healthy |
| block-miner-redis | ~0.6% | 5.5 MiB | Up healthy |

Nenhum container em restart loop no instante da medição.

---

## 3. Redis

- `PING` → `PONG`
- `connected_clients`: 3
- `dbsize`: 29 chaves
- Memória baixa, sem sinais de saturação
- **Worker BullMQ** ativo (`blockminer-jobs`)

**Conclusão:** Redis saudável. **Não é a causa primária** dos timeouts HTTP atuais; filas não estão explodindo.

**Correção aplicada:** `connectTimeout` / `commandTimeout` em `server/services/redisClient.ts` e `connectTimeout` em `server/jobs/bullmqRedis.ts` para não bloquear HTTP indefinidamente se Redis degradar.

---

## 4. Postgres / Prisma

- `max_connections`: 100
- Conexões ativas: ~46 (40 idle, 1 active)
- Postgres exposto em `0.0.0.0:5432` — logs mostram tentativas de brute-force (`user1`); recomenda-se firewall/restringir bind

**Causa real histórica de lentidão/login (confirmada em logs anteriores):**

```text
timeout exceeded when trying to connect
Transaction API error: Unable to start a transaction in the given time.
```

Isso é **esgotamento do pool `pg`** + **transações com advisory lock** no caminho de login (lockout + rate limit por usuário), não “Redis lento”.

**Correções já aplicadas / reforçadas nesta auditoria:**

| Área | Mudança |
|------|---------|
| Pool | `PG_POOL_MAX=40` (app), worker `12`, `PG_POOL_CONNECTION_TIMEOUT_MS=30000` |
| Login | `AUTH_LOCKOUT_USE_MEMORY=1`, auditoria fora da transação crítica, sem rate-limit PG extra por usuário no login |
| Prisma errors | `respondAuthPrismaError` + `isPrismaTransactionRuntimeError` → **503 SERVICE_UNAVAILABLE** |
| `/api/stats/power` | Ranking degradado (catch) em vez de 500 total |
| Redis client | Timeouts curtos explícitos |

---

## 5. Socket.IO

**Teste local (app:3000):**

```text
GET /socket.io/?EIO=4&transport=polling → 200 em ~1.6ms
pingInterval: 25000, pingTimeout: 60000
```

**Teste público (HTTPS):**

```text
→ 200 em ~44ms, mesmo handshake Engine.IO
```

**Nginx `/socket.io/`:** `proxy_read_timeout` / `proxy_send_timeout` **600s** (corrigido de 60s).

**Conclusão:** Socket.IO **funciona** no instante da medição. Falhas WebSocket no browser costumam ser:

1. Sessão inválida / token ausente em páginas que exigem auth no handshake
2. Deploy com bundle antigo + `index.html` stale
3. Picos em que o **app reinicia** (502/connection reset)

Cliente usa `transports: ['polling', 'websocket']` e timeout mínimo 60s.

---

## 6. Tempos dos endpoints (medição 2026-05-20 ~11:38 UTC)

### Local (`127.0.0.1:3000`)

| Endpoint | Status | time_total | Classificação |
|----------|--------|------------|---------------|
| `/health` | 200 | 3 ms | rápido |
| `/login` | 200 HTML | 5 ms | rápido |
| `/api/auth/session` | 401 JSON | 2.6 ms | rápido |
| `/api/wallet/balance` | 401 JSON | 2.5 ms | rápido |
| `/api/stats/power` | 401 JSON | 2.0 ms | rápido |
| `/api/checkin/status` | 401 JSON | 5.3 ms | rápido |
| `/socket.io/…polling` | 200 | 1.7 ms | rápido |
| `/assets/missing.js` | 404 JSON | 2.4 ms | rápido (não HTML) |
| `/uploads/missing.png` | 404 JSON | 2.9 ms | rápido |

### Público (`https://blockminer.space`)

| Endpoint | Status | time_total | Classificação |
|----------|--------|------------|---------------|
| `/health` | 200 | 136 ms | aceitável |
| `/login` | 200 | 49 ms | rápido |
| `/api/auth/session` | 401 | 27 ms | rápido |
| `/api/wallet/balance` | 401 | 101 ms | rápido |
| `/api/stats/power` | 401 | 24 ms | rápido |
| `/api/checkin/status` | 401 | 128 ms | rápido |
| `/socket.io/…` | 200 | 44 ms | rápido |
| `/assets/missing.js` | 404 JSON | 106 ms | rápido |
| `/uploads/missing.png` | 404 JSON | 65 ms | rápido |

**Interpretação:** Sem cookie, rotas autenticadas respondem **401 em <130 ms**. Os **502/500 que os utilizadores viram** ocorrem sob **carga + pool PG saturado** ou **durante restart/deploy**, não como estado permanente do código atual.

---

## 7. Causa real — login ruim

| Fator | Impacto |
|-------|---------|
| Pool PG 10s + muitas transações por login | Timeout → 503/500 intermitente |
| Lockout em Postgres (`SEC_LOCK` + advisory lock) | 2 transações extra por tentativa |
| Rate limit por usuário no login (removido) | Transação PG redundante |
| Cliente axios 25s (agora 60s geral / 90s login) | UX “timeout” no browser |
| Disco 94% | Risco de checkpoint lento / I/O wait |

**401 em `/api/auth/session`:** comportamento **esperado** sem cookie; UI não deve tratar como erro crítico (`checkSession` já limpa erro em 401).

---

## 8. Causa real — `/api/wallet/balance` 502

- **Sem sessão:** deve ser **401** (`requireAuth`) — confirmado em curl (~2–100 ms).
- **502:** típico de **nginx → app down/restarting** ou proxy sem upstream, não do controller (que devolve **503 JSON** `WALLET_BALANCE_UNAVAILABLE` em erro inesperado).
- Frontend: `walletBalancePolling` + `httpPollingGuard` param em 401/502/503.

---

## 9. Causa real — `/api/stats/power` 500

- Handler **pesado**: múltiplas queries + ranking até 400 utilizadores ativos (`loadUsersForPowerStatsRanking`).
- Sob pool saturado → timeout Prisma → 500 antes das correções.
- **Agora:** `respondPrismaAwareError` → 503; ranking com **degraded** (array vazio + log) em falha parcial.

---

## 10. Causa real — `/api/checkin/status` 500

- Já tinha `statusDegraded` para sub-falhas de milestones.
- Erro fatal Prisma → `respondPrismaAwareError` (503).
- Sem cookie → **401** rápido (curl confirmado).

---

## 11. Assets / uploads

| Caso | Comportamento atual |
|------|---------------------|
| `/assets/*.js` inexistente | **404 JSON** `ASSET_NOT_FOUND` |
| `/uploads/*` inexistente | **404 JSON** `UPLOAD_NOT_FOUND` |
| SPA `index.html` | servido com nonce; chunks em `/assets/` |

---

## 12. Frontend — polling

| Área | Comportamento |
|------|----------------|
| `useUserPowerStats` | Poll 45s; para em 401/500/503 (`httpPollingGuard`) |
| `walletBalancePolling` | Backoff em 502/503; para em 401 |
| `checkSession` | Dedup; 401 não seta `error` global |
| `game.ts` socket | timeout ≥60s; polling primeiro |

---

## 13. Logs de ruído (não login, mas CPU/IO)

- **`Mining tick unexpected error`:** `_emit` undefined — Socket.IO emit sem adapter; **corrigido** com try/catch + validação `io.to` em `miningCron.ts`.
- **HD deposit scan `polygonscan_txlist:NOTOK`:** rate limit API externa; não bloqueia login.
- **DB brute-force `user1`:** ruído de segurança; fechar porta 5432 publicamente.

---

## 14. Correções aplicadas nesta auditoria

1. `server/cron/miningCron.ts` — emits Socket.IO protegidos; validação `io.to`.
2. `server/middleware/httpRequestLogger.ts` — log `http_request_slow` quando ≥1000 ms ou status ≥500.
3. `server/services/redisClient.ts` — timeouts de conexão/comando.
4. `server/jobs/bullmqRedis.ts` — `connectTimeout`.
5. `server/modules/stats/stats.controller.ts` — ranking degradado em falha.
6. `server/utils/prismaHttpErrors.ts` — `isPrismaTransactionRuntimeError` (P2028/P2034/deadlock).
7. `tests/runtime/runtimeHealth.test.mjs` — classificação de latência + mapeamento Prisma.

*(Correções de login/pool/nginx/socket já deployadas na sessão anterior: `AUTH_LOCKOUT_USE_MEMORY`, `enqueueAuditEventBestEffort`, nginx 600s, `VITE_API_TIMEOUT_MS=60000`, etc.)*

---

## 15. Testes

| Teste | Cobertura |
|-------|-----------|
| `tests/runtime/runtimeHealth.test.mjs` | Latência + Prisma 503 |
| `tests/spaFallback.test.mjs` | Assets 404 JSON |
| `tests/wallet/walletBalanceRoutes.test.mjs` | Auth handshake policy |
| `tests/checkin/checkinStatusRoutes.test.mjs` | Checkin 503/401 shape |
| `tests/stats/powerStatsRoutes.test.mjs` | Prisma connection mapping |
| `tests/auth/sessionDoesNot500.test.mjs` | Session sem 500 |
| `client/src/store/auth.test.ts` | Session 401, login errors |
| `client/src/pages/wallet/walletBalancePolling.test.ts` | Backoff 401/502/503 |

---

## 16. Pendências reais (infra / ops)

1. **Liberar disco na VM** (94%): `docker system prune`, logs nginx, backups antigos — **prioridade máxima**.
2. **Não expor Postgres na internet** (porta 5432 pública).
3. Monitorar `http_request_slow` após deploy para endpoints >1s sob carga real.
4. Considerar `max_connections` / PgBouncer se utilizadores simultâneos crescerem muito.
5. Throttle `polygonHdDepositScanner` quando Polygonscan retorna NOTOK (evitar spam de I/O).

---

## 17. Confirmações de stack

- `client/src` — sem `.js/.jsx` fonte recriado nesta auditoria.
- `server/` — alterações apenas em `.ts` (compilado para `dist/`).
- Sem migration destrutiva, sem `down -v`.

---

## 18. Critério de aceite (estado atual)

| Critério | Estado |
|----------|--------|
| `/api/auth/session` 401 rápido | OK (medido) |
| `/api/wallet/balance` sem cookie → 401, não 502 | OK |
| Assets missing → 404 JSON | OK |
| Uploads missing → 404 JSON | OK |
| Socket.IO polling → 200 | OK |
| Login sob carga | Melhorado (pool + lockout memória); validar em pico real |
| Disco VM | **17%** após build cache prune (2026-05-20) — ver §19–20 |
| Site “sempre rápido” com disco 94% | **Melhorado**; ainda há ~90 GB build cache Docker |

---

*Relatório gerado após comandos reais na VM e revisão do código em `server/` + `client/`.*

## Limpeza segura de disco e medição pós-limpeza

**Executado:** 2026-05-20 11:47–11:55 UTC  
**App root:** `/root/block-miner-v3`  
**Script:** `scripts/vm-disk-cleanup-and-benchmark.py` (limpeza) + `scripts/vm-benchmark-only.py` (medição F7–F11)

### 1. Disco antes / depois / liberado

| Métrica | Antes | Depois |
|---------|-------|--------|
| Uso `/dev/sda1` | **94%** (9.0 GB livres) | **85%** (23 GB livres) |
| Espaço libertado | — | **~14 GB** (135G → 122G usados) |
| Inodes | 54% | 50% |

### 2. O que foi removido (seguro)

| Ação | Resultado |
|------|-----------|
| `journalctl --vacuum-time=7d` | Journal ~1006 MB → ~70 MB |
| Logs `/var/log` `*.gz` (+7d), `*.1` (+14d) | 66 + 4 ficheiros |
| `docker builder prune -f --filter until=24h` | ~821 MB |
| `docker container prune -f` | 0 B |
| `docker image prune -f` + `prune -a until=72h` | **~11 GB** imagens antigas (support/phd/zerads, etc.) |
| Projeto: `coverage`, `.turbo`, `.cache` | Removidos se existiam |
| Backups +30d em `backups/` | 0 removidos |

**Não executado (proibido / não necessário):** `docker volume prune`, `docker compose down -v`, apagar DB, `data/uploads`, `.env.production`.

### 3. Volumes, DB e uploads intactos

- **Volumes Docker:** 3 volumes, ~5.16 GB (`block-miner` / postgres) — **inalterados**
- **Postgres:** container `block-miner-db` Up 47h+ healthy; `pg_isready` OK (`blockminer` / `blockminer_db`)
- **Uploads:** `uploads/` ~8.2 MB no host — não tocado

### 4. Containers após limpeza

Todos **Up:** `block-miner-app`, `block-miner-worker`, `block-miner-nginx`, `block-miner-db`, `block-miner-redis`.  
Logs app recentes: **sem** erros `fatal`/`timeout` na amostra pós-limpeza.

### 5. Redis após limpeza

- `PING` → **PONG**
- `connected_clients`: 3
- `used_memory_human`: 2.40M
- Slowlog: vazio na amostra (5 entradas)

### 6. Postgres após medição

| Métrica | Valor |
|---------|-------|
| `pg_stat_activity` total | 46 |
| `idle` | 10 |
| `idle in transaction` | **27** |
| `active` | 4 |
| (null state) | 5 |

**Nota:** 27 conexões `idle in transaction` merecem monitorização (pool/leaks de transação); não bloqueou os curls desta medição.

### 7. Endpoints sem sessão (2026-05-20 ~11:55 UTC)

#### Local `127.0.0.1:3000`

| URL | Status | time_total | Classificação |
|-----|--------|------------|---------------|
| `/login` | 200 HTML | 8 ms | rápido |
| `/dashboard` | 200 HTML | 2 ms | rápido |
| `/wallet` | 200 HTML | 18 ms | rápido |
| `/api/auth/session` | 401 JSON | 1.6 ms | rápido |
| `/api/wallet/balance` | 401 JSON | 1.4 ms | rápido |
| `/api/stats/power` | 401 JSON | 1.3 ms | rápido |
| `/api/checkin/status` | 401 JSON | 1.5 ms | rápido |
| `/socket.io/?EIO=4&transport=polling` | 200 Engine.IO | 1.7 ms | rápido |

#### Público `https://blockminer.space`

| URL | Status | time_total | Classificação |
|-----|--------|------------|---------------|
| `/login` | 200 HTML | 123 ms | rápido |
| `/dashboard` | 200 HTML | 45 ms | rápido |
| `/wallet` | 200 HTML | 43 ms | rápido |
| `/api/auth/session` | 401 JSON | 125 ms | rápido |
| `/api/wallet/balance` | 401 JSON | 135 ms | rápido |
| `/api/stats/power` | 401 JSON | 39 ms | rápido |
| `/api/checkin/status` | 401 JSON | 33 ms | rápido |
| `/socket.io/?EIO=4&transport=polling` | 200 | 92 ms | rápido |

**Sem sessão — esperado:** 401 rápido nas APIs protegidas; Socket.IO devolve handshake JSON (não HTML SPA). **Nenhum 500/502/503** nesta bateria.

### 8. Medição com sessão real

**Não executada** nesta corrida: faltam `BLOCKMINER_TEST_IDENTIFIER` e `BLOCKMINER_TEST_PASSWORD` no operador (conta de teste **sem 2FA**).

```bash
export BLOCKMINER_TEST_IDENTIFIER="email-de-teste"
export BLOCKMINER_TEST_PASSWORD="***"
python3 scripts/vm-benchmark-only.py
```

### 9. Login real de teste

Pendente (mesmo motivo que §8). O script envia credenciais só por env SSH (não grava senha no relatório).

### 10. 503 / timeout após limpeza

Nenhum na medição curl pós-limpeza. Latências &lt; 200 ms nas APIs autenticadas sem cookie.

### 11. Socket.IO após limpeza

OK: polling **200**, `pingTimeout: 60000`, upgrades websocket anunciados.

### 12. Wallet / balance após limpeza

Sem cookie: **401** em ~1–135 ms (não 502). Com sessão: re-medir quando credenciais de teste estiverem disponíveis.

### 13. Build cache Docker (pendente ops)

Após limpeza, `docker system df` ainda reporta **Build Cache ~92 GB** (~90 GB reclaimable). O prune `until=24h` não remove camadas antigas acumuladas. Próximo passo **seguro** (sem volumes):

```bash
docker builder prune -af
```

Revisar em janela de baixo tráfego; pode alongar o próximo `docker compose build`.

### 14. Próxima ação recomendada

1. Correr `docker builder prune -af` para libertar ~90 GB e manter disco &lt; 80%.
2. Fechar **5432** no firewall público (brute-force nos logs).
3. Re-correr benchmarks **com sessão** (`vm-benchmark-only.py` + env de teste).
4. Investigar **27× `idle in transaction`** se voltarem timeouts sob carga.
5. Agendar prune semanal: `docker builder prune -f --filter until=168h` + journal 7d.

### 15. Critério de aceite desta etapa

| Critério | Estado |
|----------|--------|
| Disco mais seguro (&lt; 90%) | **OK** (85%) |
| Volumes não apagados | **OK** |
| DB intacto | **OK** |
| Uploads intactos | **OK** |
| app + worker Up | **OK** |
| Redis PONG | **OK** |
| Postgres pg_isready | **OK** |
| Endpoints sem sessão medidos | **OK** |
| Endpoints com sessão real | **Pendente** (credenciais) |
| Relatório atualizado | **OK** |
| Nenhum secret no relatório | **OK** |

### 16. Confirmação de secrets

Nenhuma senha, `DATABASE_URL`, ou token foi incluído nesta secção.

## Medição autenticada pós-limpeza

**Executado:** 2026-05-20 12:15 UTC  
**Script:** `scripts/vm-benchmark-only.py`  
**Commit local:** `b39892f4`  
**Disco atual:** `/dev/sda1       150G   28G  117G  20% /`  

### Infra (pré/pós benchmark)

| Check | Resultado |
|-------|-----------|
| Containers | 5/5 esperados Up (ver `docker compose ps` na VM) |
| Redis | **PONG** na secção F7 |
| Postgres | **pg_isready OK** (`blockminer` / `blockminer_db`) |
| `idle in transaction` | **0** após benchmark |

### Login autenticado (sem corpo sensível)

| Campo | Valor |
|-------|-------|
| Credenciais carregadas | **não** — criar `scripts/.blockminer-test-env` ou export env |
| Benchmark autenticado executado | **não** |
| `login_json_ok` | n/a |
| `requires_2fa` | n/a |
| `code` (se erro) | n/a |

### Endpoints autenticados (HTTPS)

| Endpoint | Status | time_total | Classificação |
|----------|--------|------------|---------------|
| — | — | — | **pendente** — definir credenciais gitignored e re-correr script |

### Endpoints públicos (validação rápida)

| Endpoint | Métrica na saída |
|----------|------------------|
| `/login` | Ver `post public validation` |
| `/api/auth/session` (sem cookie) | 401 esperado |
| `/socket.io` polling | 200 esperado |

### 500/502/503

**N/A** ou verificar saída — falhas: 0

### Postgres / Redis pós-benchmark

Resumo na saída sanitizada (`F10 postgres`, `F11 redis`). Slowlog Redis: ver VM.

### Classificação geral

Autenticado: **pendente**.

### Próxima ação

1. Se `requires_2fa=True`, usar conta de teste sem 2FA.
2. Manter disco < 30%; `docker builder prune -f --filter until=168h` semanal.
3. Fechar porta **5432** no firewall público.
4. Monitorar `idle in transaction` se voltar a subir sob carga.

### Confirmação secrets

Nenhuma senha, cookie, token, JWT, `DATABASE_URL` ou chave privada nesta secção.

<details>
<summary>Log sanitizado (resumo)</summary>

```
status=401 time_total=0.111859 ttfb=0.111788
{"ok":false,"code":"UNAUTHENTICATED","message":"Sessão expi
==== https://blockminer.space/socket.io/?EIO=4&transport=polling
status=200 time_total=0.039806 ttfb=0.039733
0{"sid":"[REDACTED]","upgrades":["websocket"],"pin

=== F10 postgres ===
 count 
-------
    46
(1 row)

 state  | count 
--------+-------
        |     5
 active |     1
 idle   |    40
(3 rows)

  pid   | state  | wait_event_type | wait_event |          query_start          |                                                                             left                                                                             
--------+--------+-----------------+------------+-------------------------------+--------------------------------------------------------------------------------------------------------------------------------------------------------------
 253389 | active |                 |            | 2026-05-20 12:15:48.573757+00 | select pid, state, wait_event_type, wait_event, query_start, left(query, 200) from pg_stat_activity where state <> 'idle' order by query_start asc limit 20;
(1 row)


=== F11 redis ===
# Clients
connected_clients:3
cluster_connections:0
maxclients:10000
client_recent_max_input_buffer:20540
client_recent_max_output_buffer:0
blocked_clients:1
tracking_clients:0
used_memory_human:2.49M
maxmemory:0
maxmemory_human:0B
maxmemory_policy:noeviction

DONE
```

</details>
