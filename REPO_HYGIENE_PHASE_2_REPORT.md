# BlockMiner — Repositório: higiene Fase 2

**Branch:** `chore/dead-code-cleanup`  
**Data:** 2026-05-20  
**Pré-requisito Fase 1:** `DEAD_CODE_AND_DUPLICATES_CLEANUP_REPORT.md`

---

## 1. O que ainda estava bagunçado após a Fase 1

- Chaves SSH **versionadas** em `.deploy/blockminer-test-ed25519*`
- Zips de deploy em `.deploy/out/` no Git
- `server/models/db.ts` com `$queryRawUnsafe` / `$executeRawUnsafe` (sem callers de `run`/`get`/`all`)
- `server/scripts/global_rescue.ts` com `new PrismaClient()` isolado + `$queryRawUnsafe`
- `scripts/fix-image-paths.mjs` com `$executeRawUnsafe` e `PrismaClient` ad-hoc
- ~12 relatórios `MONOLITH_*` / `RUNTIME_*` soltos na raiz
- Scripts de diagnóstico em `scripts/` sem `npm run` (inspect-faucet, check-db-tables, etc.)
- Validação typecheck **não executada** na Fase 1 (ambiente sem `npm`)

---

## 2. Arquivos/pastas removidos nesta fase

| Item | Ação |
|------|------|
| `.deploy/blockminer-test-ed25519` | `git rm` (chave privada) |
| `.deploy/blockminer-test-ed25519.pub` | `git rm` |
| `.deploy/out/*.zip` (3) | `git rm` |

---

## 3. Arquivos movidos

| Origem | Destino |
|--------|---------|
| `MONOLITH_*.md`, `RUNTIME_*.md`, `CLIENT_STRUCTURE_*.md`, `UPLOADS_STATIC_*.md` | `docs/audits/` |
| `scripts/check-db-tables.js` | `docs/archive/scripts/` |
| `scripts/inspect-faucet.js`, `inspect-faucet-inventory.js` | `docs/archive/scripts/` |
| `scripts/fix-inventory-gpu-image.js`, `seed-rewards-data.js` | `docs/archive/scripts/` |
| `scripts/fix_env.py` | `docs/archive/scripts/` |

Índices: `docs/audits/README.md`, `docs/archive/scripts/README.md`

**Raiz mantida (critério do plano):** `README.md`, `DEAD_CODE_CANDIDATES.md`, `DEAD_CODE_AND_DUPLICATES_CLEANUP_REPORT.md`, este relatório.

---

## 4–5. Scripts: removidos / mantidos / arquivados

### Arquivados (6)

Sem referência em `package.json` / Docker / deploy ativo — diagnóstico legado.

### Mantidos com justificativa

| Script | Motivo |
|--------|--------|
| `scripts/backup.js` | `npm run backup` |
| `scripts/fixDuplicateMinerImageUrls.js` | `npm run fix:miner-images` |
| `scripts/clear-faucet-inventory-expiry.mjs` | `npm run clear-faucet-inventory` |
| `scripts/run-node-tests.mjs` | `npm test` / coverage |
| `scripts/fraud-enrich-ips.mjs` | `npm run fraud:enrich-ips` |
| `scripts/security-audit.mjs` | `npm run audit:security` |
| `scripts/deploy*.py`, `vm-*.py`, `vm-deploy-local-over-ssh.py` | Deploy VM |
| `scripts/audit-upload-image-files.mjs`, `backfill-owned-machine-image-snapshots.mjs` | Ops imagens (auditoria recente) |
| `scripts/vm-patch-runtime-timeouts.py`, etc. | Ops VM documentados |

### Atualizado

| Script | Alteração |
|--------|-----------|
| `scripts/fix-image-paths.mjs` | `$executeRaw` + `Prisma.sql` estático; import de `dist/server/src/db/prisma.js` |

---

## 6–7. Chaves `.deploy/blockminer-test-ed25519*`

| Fato | Detalhe |
|------|---------|
| Estavam versionados | Sim (`git ls-files`) |
| Privada removida do Git | Sim (`git rm`) |
| Conteúdo impresso | **Não** |
| Recomendação | Tratar chave como **comprometida**; gerar novo par (`ssh-keygen -t ed25519`) e instalar só no servidor/provedor; guardar em `~/.blockminer/secrets/` ou agente SSH local |
| `.gitignore` | `.deploy/*ed25519*`, `*id_ed25519*`, `*.pem`, `*.key` |

---

## 8–10. Controllers / routes / models / módulos

### Estado `server/controllers/`

| Tipo | Ficheiros | Papel |
|------|-----------|-------|
| **Shim (reexport)** | `checkinController`, `shopController`, `walletController`, `machinesController`, `supportController`, `powerStatsController`, `dailyTasksController` | `export * from ../modules/...` — **sem regra duplicada** |
| **Ativos** | `inventoryController`, `vaultController`, `faucetController`, `adminController`, … | Regra HTTP ainda aqui; rotas montadas em `backend/src/app/mount/*` |

### Rotas oficiais modularizadas (reexport)

`auth`, `wallet`, `shop`, `checkin`, `machines`, `stats`, `support`, `tasks` (+ `admin-miners` em `admin.ts`).

### `server/models/`

- `db.ts` → **apenas** reexport de `server/src/db/prisma.ts` (sem raw unsafe).
- Models `*Model.ts` importam `prisma` via `./db.js` (caminho legado, cliente centralizado).

### Módulos backend oficiais (`server/modules/`)

```
admin-miners, auth, checkin, machines, shop, stats, support, tasks, wallet
```

Regra ativa nova deve entrar no módulo do domínio; controllers legados restantes são decomposição futura **sem** duplicar módulos já extraídos.

---

## 11–13. `server/models/db.ts` e Prisma

| Item | Estado |
|------|--------|
| `$queryRawUnsafe` em runtime | **0** chamadas (`grep '$queryRawUnsafe('`) |
| `db.ts` | Reexport seguro; comentário documenta remoção dos helpers |
| `global_rescue.ts` | `prisma` central + `Prisma.sql` parametrizado |
| `PrismaClient` app | `server/src/db/prisma.ts` (singleton) |
| `seed.ts` | `new PrismaClient({ adapter })` — **exceção documentada** (seed CLI com `DATABASE_URL`) |

---

## 14–16. TypeScript / frontend

| Verificação | Resultado |
|-------------|-----------|
| `server/` sem `.js` fonte | OK |
| `client/src/` sem `.js`/`.jsx` | OK |
| Páginas soltas em `client/src/pages/` | OK |
| `@ts-ignore` / `@ts-nocheck` | Nenhum em `server/` + `client/src/` |
| ` as any` (grep) | 0 em `server/` + `client/src/` |

---

## 17. Markdown

Organizado conforme plano: auditorias em `docs/audits/`, migração em `docs/archive/migration/`, scripts legados em `docs/archive/scripts/`.

---

## 18–23. Validação real (Docker `node:20-bookworm-slim`, volume `/app`)

Pré-passos: `npm ci`, `npx prisma generate --schema=server/prisma/schema.prisma`

| Comando | Resultado |
|---------|-----------|
| `npm run typecheck:server` | **OK** |
| `npm run typecheck:backend` | **OK** (após `prisma generate`) |
| `npm run build:server` | **OK** |
| `npm run build:backend` | **OK** |
| `cd client && npm run typecheck` | **OK** |
| `cd client && npm run build` | **OK** |
| `docker compose build --no-cache app worker` | **OK** |

---

## 24. Pendências reais (motivo técnico)

| Pendência | Motivo |
|-----------|--------|
| Migrar controllers restantes (`inventory`, `vault`, `faucet`, bloco `admin/*`) para `server/modules/` | Refactor grande; toca rotas HTTP e testes; **fora** de “só higiene” sem alterar comportamento |
| Rotacionar chave SSH de teste VM | Ação humana no provedor após remoção do Git |
| `server/prisma/seed.ts` com `PrismaClient` próprio | Padrão Prisma 7 + adapter PG no seed |
| Controllers shim `server/controllers/*` | Mantidos para imports legados (`#server/controllers/...` em testes); podem ser redirecionados para `#server/modules/...` numa PR só de imports |

Nenhuma pendência deixada por “npm indisponível” — validação executada via container Node 20.

---

## Commit sugerido

```
chore: enforce repository hygiene and modular structure
```
