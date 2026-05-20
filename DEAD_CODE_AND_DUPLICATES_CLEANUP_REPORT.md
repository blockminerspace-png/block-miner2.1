# BlockMiner — Relatório de limpeza estrutural (dead code)

**Branch:** `chore/dead-code-cleanup`  
**Data:** 2026-05-20  
**Auditoria detalhada:** `DEAD_CODE_CANDIDATES.md`

---

## 1. Resumo

Limpeza auditada do repositório com foco em lixo versionado real: snapshot legado `.deploy/blockminer-test-package` (~750 ficheiros JSX/JS duplicados), router morto `app/routes/registerAppRoutes.js`, logs e dumps de migração em `scripts/`, scripts Node órfãos da era SQLite, e arquivamento de 32 relatórios Markdown de migração TS concluída.

**Não foram alteradas:** regras económicas, migrations Prisma, `.env` / `.env.production`, uploads, seeds ativos, dependências do `package.json`, nem controllers/modules com regra de negócio ativa.

---

## 2. Quantidade de arquivos removidos

| Categoria | Quantidade (aprox.) |
|-----------|---------------------|
| Ficheiros apagados (`git rm`) | **~767** |
| Linhas eliminadas no diff acumulado | **~145 213** |
| Scripts `.js` removidos | 10 |
| Ficheiros `.txt` de debug removidos | 8 |
| Logs versionados removidos | 4 |

---

## 3. Pastas removidas

| Pasta | Motivo |
|-------|--------|
| `.deploy/blockminer-test-package/` | Snapshot legado completo (frontend JSX + server `.js` espelhado) |
| `app/routes/` (ficheiro único) | Router antigo sem import no `server/server.ts` |

---

## 4. Arquivos movidos para `docs/archive/migration/`

**32** relatórios, incluindo:

- `CLIENT_TS_MIGRATION_STEP_11` … `STEP_22`
- `SERVER_TS_MIGRATION_STEP_01` … `STEP_10`
- `FINAL_TYPESCRIPT_MIGRATION_REPORT.md`
- `POST_TYPESCRIPT_MIGRATION_CHECKPOINT.md`
- `MODULAR_MONOLITH_REPORT.md`, `RESTRUCTURE_MIGRATION_REPORT.md`, etc.

Índice: `docs/archive/migration/README.md`

**Mantidos na raiz:** `README.md`, relatórios `MONOLITH_*` e `RUNTIME_*` operacionais recentes, `UPLOADS_STATIC_AND_MACHINE_IMAGES_FIX.md`, etc.

---

## 5. Mantidos apesar de parecerem mortos

Ver tabela completa em `DEAD_CODE_CANDIDATES.md`. Destaques:

- `.deploy/blockminer-test-ed25519` (+ `.pub`) — chaves de teste VM
- `scripts/backup.js`, `inspect-faucet*.js`, `fixDuplicateMinerImageUrls.js` — referenciados em `package.json` / ESLint
- `server/models/db.ts` — `$queryRawUnsafe` (dívida técnica; fora do escopo)
- `server/prisma/seed.ts`, `server/scripts/global_rescue.ts` — `PrismaClient` local em scripts
- `backend/`, `contracts/`, controllers legados ainda montados em `server/server.ts`

---

## 6–7. Duplicados

**Encontrados:** nomes iguais em client/server (`auth.errors.ts`, `adminMiners.types.ts`, …) — **legítimos** por camada.

**Removidos:** duplicata inteira `.deploy/blockminer-test-package` (espelho obsoleto do monorepo).

**Já resolvido antes desta branch:** páginas soltas em `client/src/pages/` reorganizadas em subpastas (`faucet/`, `vault/`, `landing/`, etc.).

---

## 8. Scripts removidos

`capture_prisma_error.js`, `check_active_powers.js`, `check_sqlite.js`, `db_inspect.js`, `migrateData.js`, `migrate_test.js`, `ping_db.js`, `read_sqlite_schema.js`, `rpc-bench.js`

**Mantidos:** `backup.js`, `check-db-tables.js`, `inspect-faucet.js`, `inspect-faucet-inventory.js`, `fix-inventory-gpu-image.js`, `fixDuplicateMinerImageUrls.js`, `seed-rewards-data.js`, scripts deploy VM (`.py`, `.sh`, `.mjs` recentes).

---

## 9. Relatórios Markdown arquivados

32 ficheiros → `docs/archive/migration/` (ver secção 4).

---

## 10. Atualizações no `.gitignore`

Adicionado:

- `coverage/`, `client/coverage/`, `.cache/`, `.turbo/`, `.deploy-venv/`
- `scripts/__pycache__/`, `scripts/migration_*.txt`, `scripts/schema_dump*.txt`
- `server/storage/logs/**/*.log` (com exceção `.gitkeep`)
- `.deploy/blockminer-test-package/`
- Padrões `*.tmp`, `*.bak`, `*.old`, `*.orig`, `*~`

---

## 11–13. Confirmações de preservação

| Item | Estado |
|------|--------|
| Migrations Prisma | **Intactas** — nenhuma pasta em `server/prisma/migrations/` removida |
| Uploads | **Intactos** — não tocados |
| `.env` / `.env.production` | **Não tocados** — excluídos do commit |

---

## 14–16. TypeScript / páginas

| Verificação | Resultado |
|-------------|-----------|
| `server/` sem `.js` fonte | **OK** (0 ficheiros) |
| `client/src/` sem `.js`/`.jsx` | **OK** (0 ficheiros) |
| `client/src/pages/` sem página solta no nível raiz | **OK** (0 ficheiros `.ts`/`.tsx` em maxdepth 1) |

---

## 17–18. Prisma

| Verificação | Resultado |
|-------------|-----------|
| `PrismaClient` centralizado em runtime | **OK** — `server/src/db/prisma.ts` para app |
| `$queryRawUnsafe` | **Ainda presente** em `server/models/db.ts` e `server/scripts/global_rescue.ts` (não removido de propósito) |
| `@ts-ignore` / `@ts-nocheck` | **Nenhum** encontrado em `server/` e `client/src/` |

---

## 19–22. Builds e typecheck

| Comando | Resultado |
|---------|-----------|
| `npm run typecheck:server` | **Não executado** — `npm` indisponível no ambiente do agente |
| `npm run build:server` / `build:backend` | **Não executado** — idem |
| `cd client && npm run typecheck` / `build` | **Não executado** — idem |
| `docker compose build app` | **OK** — imagem `block-miner-app` construída com sucesso (inclui `npm run build` do client no stage frontend e compilação do server no contexto Docker) |

**Recomendação:** correr localmente `npm run typecheck` e `npm test` antes do merge.

---

## 23. Docker build

```
docker compose build app  →  Image block-miner-app Built  (sucesso)
```

---

## 24. Pendências reais restantes

1. Refactor de `server/models/db.ts` para eliminar `$queryRawUnsafe`.
2. Migrar scripts `.js` restantes em `scripts/` para `.mjs`/`.ts` quando forem editados.
3. Consolidar regra duplicada `server/controllers/*` → `server/modules/*` (rotas legadas que ainda contêm lógica).
4. Dados de produção: órfãos de inventário e placeholders `/machines/reward*.png` (não é dead code de repo).
5. Decidir se `.deploy/blockminer-test-ed25519` deve sair do Git (chaves de teste).

---

## Commit

Mensagem sugerida:

```
chore: remove dead code and consolidate modular structure
```

Ficheiros excluídos do stage: `.env`, `.env.production`, `scripts/.blockminer-test-env`, `scripts/vm_config_secret.py`
