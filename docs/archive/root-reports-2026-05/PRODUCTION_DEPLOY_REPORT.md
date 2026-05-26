# PRODUCTION_DEPLOY_REPORT

Deploy seguro da branch `chore/dead-code-cleanup` (commit `430784fc`) para produção **blockminer.space**.

---

## 1. Branch deployada

`chore/dead-code-cleanup`

## 2. Commit deployado

`430784fc29727fb9d703f0f758907a1b382bc8c2` — `test: validate rooms module compatibility`

Inclui na sequência: dead-code cleanup, repo hygiene phase 2, módulos inventory/vault/faucet/rooms, fix `rooms.test.js` (preflight antes de idempotência).

## 3. Commit / estado anterior (rollback)

A VM em `/root/block-miner-v3` **não é clone git** (deploy histórico por zip/archive). Rollback registado em `/tmp/blockminer-before-deploy-commit.txt`:

```txt
PRE_DEPLOY_COMMIT=zip-tree-no-git
sha256:fb3486fb42935666e8871c4d5a2b4e7d86a554e533101b6348362086d3e7f30c  (imagem app anterior)
sha256:0baa5a872a3d57e2772fcf454624cb265957bf7b5cedfd0d502c0cc46073b8df  (imagem worker anterior)
```

Marcador pós-deploy: `/tmp/blockminer-deployed-commit.txt` com `DEPLOYED_COMMIT=430784fc...` e `DEPLOYED_BRANCH=chore/dead-code-cleanup`.

**Rollback manual (sem `down -v`):** restaurar imagens anteriores ou reexecutar deploy do artefacto anterior; não apagar volumes/db/uploads.

## 4. Horário do deploy

**2026-05-20 ~15:58–16:00 UTC** (`backup-374507709-ubuntu-8gb-hel1-1`)

## 5. Disco / RAM antes

| Recurso | Valor |
|---------|--------|
| Disco `/` | 150G total, 37G usado, 108G livre (26%) |
| RAM | 7.6 Gi total, ~2.7 Gi usado, ~4.8 Gi available |

## 6. Containers antes

| Container | Estado |
|-----------|--------|
| block-miner-app | Up ~2h |
| block-miner-worker | Up ~3h |
| block-miner-nginx | Up ~3h |
| block-miner-db | Up 2d (healthy) |
| block-miner-redis | Up 2d (healthy) |

## 7. Método de deploy

1. `git push origin chore/dead-code-cleanup` (branch criada no remoto `Block-Miner/blockminer`)
2. `git archive HEAD` + upload SFTP (`scripts/vm-deploy-local-over-ssh.py`)
3. Extração em `/root/block-miner-v3` com **preservação** de `.env` / `.env.production`
4. `BLOCKMINER_DOCKER_BUILD_NO_CACHE=1` + `scripts/docker-ensure-block-miner-stack.sh`

**Nota:** `git pull` na VM não aplicável (sem `.git` no APP_ROOT). Equivalente funcional ao deploy git da branch local HEAD.

## 8. Build app / worker

`docker compose build --no-cache app worker` — **OK**

Imagens novas:

- `block-miner-app` → `sha256:6a8279aeddcfa6d132c078a5d90fbfbc6f95dd80df55bdce41629191e4b4ccd6`
- `block-miner-worker` → `sha256:0d3f1e12edc8433f36bb19b372f82624f8614f5cdb60fb46358ab9759c7501b2`

## 9. Recreate app / worker

`docker compose up -d` (db, redis, app, worker, nginx) — app e worker **recreated**; db/redis/nginx mantidos.

Prisma: `migrate deploy` — **38 migrations, no pending migrations**.

## 10. Logs pós-deploy (resumo)

- **app:** HTTP 200 em tráfego normal; health local **200**; avisos `polygonscan_txlist:NOTOK` (pré-existentes, scanner HD)
- **worker:** `BlockMiner BullMQ worker started`; `DB_BOOTSTRAP_ON_STARTUP is false` (seguro)
- Sem restart loop; sem erro Prisma crítico; sem erro de import de módulos rooms/faucet/inventory/vault

## 11. Smoke público (sem sessão)

| URL | status | time_total (s) | Notas |
|-----|--------|----------------|--------|
| `/login` | 200 | ~0.76 | HTML SPA |
| `/api/auth/session` | 401 | ~0.75 | JSON |
| `/api/rooms` | 401 | ~0.75 | JSON |
| `/api/faucet/status` | 401 | ~0.75 | JSON |
| `/api/inventory` | 401 | ~0.83 | JSON |
| `/api/vault` | 401 | ~1.50 | JSON |
| `/socket.io/?EIO=4&transport=polling` | 200 | ~0.74 | handshake OK |
| `/assets/arquivo-inexistente.js` | 404 | ~0.75 | JSON `ASSET_NOT_FOUND` |
| `/uploads/arquivo-inexistente.png` | 404 | ~0.75 | JSON `UPLOAD_NOT_FOUND` |

**Nenhum 500 / 502 / 503** no smoke.

## 12. Smoke autenticado

**Não executado** — sem cookie de teste seguro disponível nesta sessão.

## 13. Redis / Postgres

**Up (healthy)** — não reiniciados; dados preservados.

## 14. Uploads preservados

`/root/block-miner-v3/data/uploads` presente após deploy.

## 15. `.env.production`

**OK** — ficheiro intacto; valores não impressos nos logs.

## 16. Server sem `.js` fonte

Dentro do container `block-miner-app`: **0** ficheiros `.js` em `/app/server` (excl. node_modules/dist).

## 17. client/src sem `.js/.jsx`

**0** ficheiros `.js/.jsx` em `/app/client/src`.

## 18. `$queryRawUnsafe`

**0 uso ativo** — única ocorrência é comentário em `server/models/db.ts` (documentação de remoção).

## 19. PrismaClient centralizado

**0** `new PrismaClient` em `server/modules/*` no container.

Módulo `server/modules/rooms/` presente no container (9 ficheiros TS).

## 20. Rollback

**Não necessário** — deploy estável após smoke.

## 21. Validação local pré-deploy

| Passo | Resultado |
|-------|-----------|
| `git push origin chore/dead-code-cleanup` | OK |
| `npm run typecheck:server` (Docker + prisma generate) | OK |
| `npm run build:server` / `build:backend` | OK |
| `node --test tests/rooms.test.js` | 20/20 |
| `inventoryMachineImages.test.mjs` | 4/4 |
| `faucetInventoryNoExpiry.test.mjs` | pass |

## 22. Pendências reais

1. VM sem git no APP_ROOT — próximos deploys continuam via `vm-deploy-local-over-ssh.py` ou inicializar clone git na VM se quiser `git pull` direto.
2. Smoke autenticado (rooms/inventory com sessão) — opcional com cookie de teste.
3. Rotação de credenciais se password root foi usada em sessões anteriores (boa prática; não documentada aqui).

---

## Critério de aceite

| Item | OK |
|------|-----|
| Commit `430784fc` em produção | ✓ |
| app/worker rebuild no-cache | ✓ |
| 5 containers Up | ✓ |
| Smoke público sem 5xx | ✓ |
| DB/uploads/volumes/.env preservados | ✓ |
| Sem `down -v` | ✓ |
| Rollback documentado | ✓ |
| Relatório criado | ✓ |
