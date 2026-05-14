# BlockMiner — Step 09: pós-migração TS — imports legados, scripts, Docker auxiliar, stubs backend

**Data:** 2026-05-14  
**Escopo:** Limpeza ao redor do backend compilado (`dist/server`), garantia de `build:server` onde há `#server/*`, `tsconfig.server.json` estritamente TS, decisão sobre stubs do `backend`, e alinhamento parcial de `.deploy/**` + worker Telegram.

---

## 1. `find server -name "*.js"` (excl. `node_modules`, `dist`)

**Resultado:** vazio (nenhum `.js` fonte sob `server/`).

---

## 2. Imports legados `../server/*.js` fora de `tests/`

### Monorepo principal (`scripts/`, `services/`, `client/`, raiz)

**Nenhuma** ocorrência de `../server/**/*.js` fora de `tests/` — os scripts e o worker já usam `#server/*` onde importam o servidor compilado (etapas anteriores + Step 08).

### `.deploy/blockminer-test-package/**`

Permanecem muitas referências a `../server/*.js` e `../../server/*.js` em **testes**, **scripts** e **worker** dentro do pacote de deploy — esse diretório é um **snapshot legado** que ainda contém **cópia completa do backend em JavaScript** (`server/**/*.js`). Nesses arquivos o import `../server/...js` continua **coerente com o conteúdo interno do bundle**, não com o monorepo TS atual.

**Decisão:** não regenerar o pacote inteiro nesta etapa (fora de escopo e alto risco). Ajustes feitos no deploy nesta etapa foram **pontuais e seguros** (vide secção 11).

---

## 3–4. Arquivos alterados e conversões `#server/*`

| Arquivo | Tipo | Problema encontrado | Import antigo | Novo import | Precisa `build:server` antes | Risco | Status |
|---------|------|---------------------|---------------|-------------|------------------------------|-------|--------|
| `tsconfig.server.json` | config | `checkJs: false` redundante com `allowJs: false` | — | Removida chave `checkJs` | não | baixo | Feito |
| `package.json` | package | Script manual `clear-faucet` sem build | — | Novo script `clear-faucet-inventory` com `build:server` | sim | baixo | Feito |
| `services/telegram-proof-worker/Dockerfile` | docker | Copiava só `server/` fonte TS mas worker usa `#server/*` → runtime quebrado | — | `npm ci` + `prisma generate` + `tsc -p tsconfig.server.json` + `npm prune` | sim (na imagem) | médio | Feito |
| `.deploy/.../services/telegram-proof-worker/Dockerfile` | deploy | Idem | — | Alinhado ao Dockerfile da raiz | sim | médio | Feito |
| `services/telegram-proof-worker/healthcheck.js` | script | Acesso direto a `error.message` | — | `instanceof Error` + fallback `String(error)` | não | baixo | Feito |
| `.deploy/.../client/vite.config.js` | config | Fallback fixo para `../server/...game2048Engine.js` (inexistente no fluxo TS) | `../server/services/game2048Engine.js` | Mesma resolução em cascata da raiz: `engine/` → `dist/server/...js` → `server/...ts` | depende do uso | baixo | Feito |

*(Não houve conversão em massa de imports em `.deploy/tests` para `#server` porque o pacote não expõe `dist/server` nem `imports` do `package.json` alinhados ao monorepo atual — ver secção 11.)*

---

## 5. Scripts que garantem `build:server` antes

| Script | Comportamento |
|--------|----------------|
| `fraud:enrich-ips` | `npm run build:server && node scripts/fraud-enrich-ips.mjs` (já Step 08) |
| `backup` | `npm run build:server && node scripts/backup.js` |
| `pretest` | `npm run build:server && npm run build:backend` |
| `clear-faucet-inventory` | **Novo:** `npm run build:server && node scripts/clear-faucet-inventory-expiry.mjs` |

`worker:bullmq` continua `node dist/server/jobs/runBlockminerWorker.js` — o artefato é produzido pelo `Dockerfile` principal / CI com `tsc`; não importa `#server` via `package.json` no processo do script.

---

## 6–8. `tsconfig.server.json` e `allowJs`

- **`allowJs`:** já estava **`false`** desde a migração do núcleo (Step 08).  
- **`checkJs`:** removido por redundância (sem `allowJs`, `checkJs` não aplica).  
- **`npm run typecheck:server`** e **`npm run build:server`:** passam após a remoção.

**Justificativa se `allowJs` tivesse que permanecer:** não aplicável — não há mais entrada JS no grafo de compilação do servidor.

---

## 9. `backend/src/types/stubs` — decisão técnica

**Opção B — manter os stubs (47 ficheiros `.d.ts`).**

Tentativa de mapear `#server/*.js` → `../server/*.ts` real no `backend/tsconfig.json` falhou com **TS6059** (`rootDir` `backend/src` não pode conter ficheiros resolvidos fora de `backend/src`).

**Próximo plano (não executado agora):** `composite` / **TypeScript project references** entre `backend` e `server`, ou gerar `.d.ts` de `server` para consumo tipado — evita duplicar declarações à mão.

**Stubs removidos:** 0.

---

## 10. Quantidade de stubs

**47** ficheiros em `backend/src/types/stubs/*.d.ts` — todos **mantidos**.

---

## 11. Alterações em `.deploy/**`

- **`services/telegram-proof-worker/Dockerfile`:** alinhado à raiz (compila `server` → `dist/server` na imagem).  
- **`client/vite.config.js`:** resolução do motor 2048 alinhada ao monorepo (cascata `engine` / `dist/server` / `server/*.ts`).  
- **Demais ficheiros** (testes/scripts com `../server/*.js`): **não alterados** — o bundle ainda inclui `server/**/*.js` legado; migrar tudo exigiria resync completo do pacote a partir do repositório TS.

---

## 12. `client/vite.config.js` (raiz)

Sem alteração adicional nesta etapa — já estava com a cascata `engine` → `dist/server` → `server/*.ts` (Step 08).

---

## 13. `services/**` (raiz)

- **`telegram-proof-worker/Dockerfile`:** compilação do servidor na imagem (ver tabela).  
- **`healthcheck.js`:** tratamento de erro mais seguro (sem expor stack; sem alterar lógica de health).

---

## 14. `package.json`

- Novo script: **`clear-faucet-inventory`** (com `build:server` antes).  
- **`main`:** `dist/server/server.js` (inalterado).  
- **`imports`:** `"#server/*": "./dist/server/*"` (inalterado).

---

## 15. Dockerfile / `docker-compose.yml` (raiz)

- **Sem alteração** no `Dockerfile` principal nem no `docker-compose.yml` da raiz nesta etapa — já usam `dist/server/server.js` e build em estágio de imagem.  
- **`docker compose up`:** não executado (sem `.env` seguro garantido).

---

## 16–19. Validações

| Comando | Resultado |
|---------|-----------|
| `npm run typecheck:server` | **OK** |
| `npm run build:server` | **OK** |
| `npm run typecheck` | **OK** |
| `npm run build:backend` | **OK** |

---

## 20. Testes executados

| Comando | Resultado |
|---------|-----------|
| `node --test tests/httpErrors.test.mjs` | **OK** |
| `node --test tests/depositsCron.test.js tests/miningCronHashrateSync.test.js` | **OK** |
| `npm test` | **Falha** (falhas já conhecidas; ver secção 22) |

---

## 21. Docker build

| Comando | Resultado |
|---------|-----------|
| `docker compose build --no-cache` | **OK** (`app`, `worker`) |
| `docker build -f services/telegram-proof-worker/Dockerfile -t block-miner-telegram-proof:test .` | **OK** |

---

## 22. Falhas conhecidas em `npm test`

- **`tests/i18nLanguage.test.mjs`** — expectativas de locale (`en` vs `pt-BR`, ordem de fallback).  
- **`tests/ipIntelligenceService.test.mjs`** — expectativa `residential` vs `unknown` no fluxo proxycheck.

---

## 23–24. Confirmações de segurança / deploy

- **Nenhum `.js` fonte** foi recriado dentro de `server/`.  
- **Docker (app principal):** continua **`CMD ["node", "dist/server/server.js"]`** (via `docker-entrypoint.sh`).  
- **Nenhum secret** novo foi logado nas alterações desta etapa.

---

## Auditoria (comandos de referência)

```bash
find server -name "*.js" -type f \
  -not -path "server/node_modules/*" \
  -not -path "server/dist/*" \
  | sort

grep -R "\.\./server/.*\.js" . \
  --include="*.mjs" \
  --include="*.js" \
  --include="*.ts" \
  --include="*.cjs" \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  --exclude-dir=.git || true

grep -R "allowJs\|checkJs" tsconfig.server.json package.json backend/tsconfig.json 2>/dev/null || true
```

---

## Critério de aceite (checklist)

- [x] `find server -name "*.js"` (excl.) continua vazio.  
- [x] Imports `../server/*.js` **no monorepo ativo fora de `tests`** — nenhum restante; **`.deploy`** documentado como snapshot legado + ajustes pontuais.  
- [x] Scripts que usam `#server/*` na raiz garantem `build:server` onde necessário (`backup`, `fraud:enrich-ips`, `pretest`, `clear-faucet-inventory`).  
- [x] `typecheck:server`, `build:server`, `typecheck`, `build:backend` — OK.  
- [x] `docker compose build --no-cache` — OK.  
- [x] Imagem do worker Telegram compila `server` e usa `#server` em runtime.  
- [x] Sem `@ts-ignore` / `@ts-nocheck` / gambiarras `any` introduzidas nesta etapa.  
- [x] Relatório Step 09 criado (este ficheiro).

---

## Próxima etapa (não executada)

- Regenerar **todo** o `.deploy/blockminer-test-package` a partir do monorepo TS, **ou** apontar testes/scripts do pacote para `#server` + `dist/server` com `package.json` espelhado.  
- Remover **stubs** do `backend` via project references ou declarações geradas.  
- Atacar `client/**/*.js` / configs conforme roadmap geral (fora desta etapa).
