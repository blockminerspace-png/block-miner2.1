# BlockMiner — Candidatos a limpeza (auditoria)

Branch: `chore/dead-code-cleanup`  
Data: 2026-05-20

## Legenda

| Ação | Significado |
|------|-------------|
| **remover** | Apagado nesta limpeza (`git rm` ou lixo local) |
| **arquivar** | Movido para `docs/archive/migration/` |
| **manter** | Ainda referenciado ou risco alto |
| **pendente** | Não alterado nesta PR |

| Risco | Critério |
|-------|----------|
| baixo | Sem import ativo; artefacto/cache/log |
| médio | Script legado não referenciado em `package.json` |
| alto | Produção, migrations, `.env`, uploads, regra económica |

---

## Removidos (risco baixo/médio)

| Caminho | Motivo | Referências | Ação | Risco |
|---------|--------|-------------|------|-------|
| `.deploy/blockminer-test-package/**` (~750 ficheiros) | Snapshot legado JSX/JS duplicado do monorepo TS; sem uso em `deploy.py`, compose ou CI ativo | Apenas docs de migração | remover | baixo |
| `app/routes/registerAppRoutes.js` | Router monolítico antigo; `server/server.ts` não importa | Só espelho `.deploy` | remover | baixo |
| `server/storage/logs/**/**.log` | Logs de runtime não devem ser versionados | Nenhuma | remover | baixo |
| `scripts/migration_*.txt`, `scripts/schema_dump*.txt` | Saída temporária de debug de migração | Nenhuma | remover | baixo |
| `scripts/capture_prisma_error.js` | Debug one-off Prisma | Nenhuma em package.json | remover | baixo |
| `scripts/check_active_powers.js` | Diagnóstico antigo | Nenhuma | remover | baixo |
| `scripts/check_sqlite.js`, `read_sqlite_schema.js` | Stack SQLite abandonada (PostgreSQL) | Nenhuma | remover | baixo |
| `scripts/db_inspect.js`, `ping_db.js`, `rpc-bench.js` | Utilitários ad-hoc sem script npm | Nenhuma | remover | baixo |
| `scripts/migrateData.js`, `migrate_test.js` | Migração de dados legada | Nenhuma | remover | médio |
| `coverage/`, `.deploy-venv/` (local) | Artefactos locais | N/A | remover (local) | baixo |

---

## Arquivados

| Caminho | Motivo | Ação | Risco |
|---------|--------|------|-------|
| `CLIENT_TS_MIGRATION_STEP_*.md` (12) | Etapas concluídas da migração frontend | arquivar | baixo |
| `SERVER_TS_MIGRATION_STEP_*.md` (10) | Etapas concluídas da migração backend | arquivar | baixo |
| `FINAL_TYPESCRIPT_MIGRATION_REPORT.md` | Relatório final da migração TS | arquivar | baixo |
| `POST_TYPESCRIPT_MIGRATION_CHECKPOINT.md` | Checkpoint histórico | arquivar | baixo |
| Outros `*_REPORT.md` / `*_AUDIT.md` de migração (10) | Auditorias de reestruturação já integradas | arquivar | baixo |

Destino: `docs/archive/migration/`

---

## Mantidos (parecem mortos mas não remover)

| Caminho | Motivo | Risco |
|---------|--------|-------|
| `.deploy/blockminer-test-ed25519` (+ `.pub`) | Chaves de teste VM; podem ser usadas manualmente | médio |
| `scripts/backup.js` | `npm run backup` | alto se removido |
| `scripts/inspect-faucet*.js` | Overrides ESLint; diagnóstico operacional | médio |
| `scripts/check-db-tables.js`, `fix-inventory-gpu-image.js`, `seed-rewards-data.js` | Manutenção / seed pontual | médio |
| `scripts/fixDuplicateMinerImageUrls.js` | `npm run fix:miner-images` | médio |
| `server/models/db.ts` (`$queryRawUnsafe`) | Camada SQL legada ainda usada | alto — fora do escopo |
| `server/scripts/global_rescue.ts` (`new PrismaClient`) | Script de resgate manual | médio |
| `server/prisma/seed.ts` (`new PrismaClient`) | Seed oficial | alto |
| `dist/`, `client/dist/` (local) | Build; Docker gera `client` no stage frontend | manter local |
| Duplicados por domínio (`auth.ts`, `admin.ts`, `checkin.contract.ts` client/server) | Domínios distintos | manter |
| `backend/` | Shim TypeScript para testes/worker | manter |
| `contracts/` | Hardhat | manter |
| Relatórios `MONOLITH_*`, `RUNTIME_*` na raiz | Auditoria operacional recente | manter |

---

## Duplicados analisados

| Tipo | Exemplo | Decisão |
|------|---------|---------|
| Nome igual client/server | `adminMiners.types.ts`, `auth.errors.ts` | Legítimo (camadas) |
| `migration.sql` em várias pastas Prisma | Migrations distintas | **manter** |
| `.deploy` vs monorepo | Pacote inteiro | **removido** |
| Páginas soltas `client/src/pages/*.tsx` | Já reorganizadas em pastas | **já resolvido** (não neste commit) |

---

## Pendências reais (não tratadas nesta limpeza)

1. Consolidar controllers legados em `server/controllers/` que ainda contêm regra ativa vs `server/modules/`.
2. Converter scripts Node restantes (`.js`) para `.mjs`/`.ts` quando tocados.
3. Eliminar `$queryRawUnsafe` em `server/models/db.ts` com refactor SQL parametrizado (tarefa de segurança separada).
4. Upload de imagens placeholder em miners (`/machines/reward*.png`) — dados de produção, não estrutura.
5. Órfãos de inventário (`Máquina custom`, etc.) — dados, não dead code.

---

## Validação necessária (pós-remoção)

- [x] `npm run typecheck:server`
- [x] `npm run build:server` + `build:backend`
- [x] `cd client && npm run typecheck && npm run build`
- [x] `docker compose build app` (worker se aplicável)
