# BlockMiner — Auditoria e estado: Express real em `server/` (TypeScript)

**Data:** 2026-05-12  
**Conclusão imediata:** a migração **não está concluída** face aos critérios de aceite que definiste (zero `.js` de fonte em `server/` para o backend Express, sem stubs de substituição do código real). O repositório tem **302 ficheiros `server/**/*.js`** e **47 stubs** em `backend/src/types/stubs/` que tipam imports `#server/*` para esse JavaScript.

---

## 1. Comandos de auditoria (executados)

```bash
find server -name "*.js" -type f | sort
find server -name "*.mjs" -type f | sort
find backend/src -name "*.d.ts" -type f | sort
find backend/src/types/stubs -type f 2>/dev/null | sort || true
```

**Resultados numéricos**

| Métrica | Valor |
|--------|------:|
| `server/**/*.js` | **302** |
| `server/**/*.mjs` | **0** |
| `backend/src/**/*.d.ts` (incl. stubs) | **48** |
| `backend/src/types/stubs/*` | **47** |
| `server/**/*.ts` (fonte já TS) | **5** (controllers: checkin, shortlink, youtube, autoMiningGpu, autoMiningV2) |

**Distribuição de `.js` em `server/` (primeiro segmento de caminho)**

| Pasta | Ficheiros `.js` |
|-------|----------------:|
| `services/` | 85 |
| `controllers/` | 55 |
| `routes/` | 40 |
| `utils/` | 38 |
| `src/` | 25 |
| `models/` | 19 |
| `middleware/` | 15 |
| `cron/` | 14 |
| `jobs/` | 4 |
| `validation/` | 2 |
| Raiz (`server.js`, `phdServer.js`, …) | 3 |
| `scripts/`, `prisma/`, `test_db.js` | 3 |

---

## 2. Tabela modelo (amostra representativa + padrão)

Para **cada um dos 302** ficheiros a linha segue o mesmo padrão até migração. Abaixo: entradas críticas; o restante é **sim / `server/server.js` ou grafo de imports` / `.ts` in-place / stub temporário só se dependência externa / risco médio-alto / pendente**.

| Arquivo JS | Express? | Quem importa | Migrar para | Stub temporário? | Risco | Status |
|------------|------------|--------------|-------------|------------------|-------|--------|
| `server/server.js` | sim | `package.json` main, Docker CMD, workers que reutilizam stack | `server/server.ts` (Opção A) | não | **muito alto** (bootstrap, cluster, sockets) | **pendente** |
| `server/routes/*.js` (40) | sim | `server/server.js`, mounts em `backend`, testes | `server/routes/*.ts` | não | alto (contratos HTTP) | **pendente** |
| `server/middleware/*.js` (15) | sim | rotas, `server/server.js` | `server/middleware/*.ts` | não | alto (auth, CSRF, rate limit) | **pendente** |
| `server/controllers/*.js` (≈50) | sim | rotas | `server/controllers/*.ts` (5 já `.ts`) | não | alto | **parcial** (5 TS) |
| `server/services/*.js` (85) | muitos sim (via controllers) | controllers, cron, jobs | `server/services/*.ts` | não | muito alto (negócio + Prisma) | **pendente** |
| `server/utils/*.js` (38) | indireto | quase tudo | `server/utils/*.ts` | não | médio | **pendente** |
| `server/models/*.js` (19) | indireto | controllers, serviços | `server/models/*.ts` | não | alto | **pendente** |
| `server/cron/*.js` (14) | não (agendado) | `cron/index`, `server/server` | `server/cron/*.ts` | não | médio | **pendente** |
| `server/jobs/*.js` (4) | não (worker) | compose worker | `server/jobs/*.ts` | não | médio | **pendente** |
| `server/prisma/*.js` (ex.: seed) | não | scripts | `.ts` ou manter JS só tooling | opcional | baixo se só seed | **avaliar** |

---

## 3. Escolha de estrutura (Opção A vs B)

**Recomendação: Opção A — migrar `server/` in-place** (`server/server.ts`, `server/routes/*.ts`, …).

**Motivos (projeto real):**

1. **`package.json`** `"main": "server/server.js"` e **Docker CMD** `node server/server.js`; workers, cron e centenas de imports relativos assumem a árvore `server/`.
2. **Opção B** (mover tudo para `backend/src`) implica **alterar centenas de caminhos**, sincronizar com `backend/dist`, duplicar risco com o código já existente em `backend/src` (composição HTTP) e reescrever entrypoints — **maior probabilidade de regressão** do que A.
3. O `backend/src` atual continua útil como **camada de composição** tipada; após A, os mounts podem importar **`../server/routes/auth.js`** (emitido a partir de `auth.ts`) **sem** `#server/*`, ou importar paths relativos ao pacote compilado.

**Não misturar:** ou A até ao fim, ou B até ao fim. O estado hoje é **híbrido** (composição TS + monólito JS) — isso foi explicitamente marcado como incompleto no relatório anterior.

---

## 4. `#server/*` e stubs (estado atual)

- **`package.json` (raiz):** `"imports": { "#server/*": "./server/*" }`** — resolve em runtime para ficheiros **JavaScript** em `server/`.
- **`backend/src`:** imports `#server/...` + **`tsconfig` `paths`** → **47 ficheiros `stub-*.d.ts`** — tipos **sintéticos**, não o código migrado.
- **Critério de aceite:** isto deve **desaparecer** para o Express principal quando `server/` for TypeScript real e o `tsc` compilar a partir de tipos reais dos módulos.

**Remoção segura de `#server/` e stubs** só depois de:

1. `server/**/*.ts` a substituir os `.js` correspondentes (ou build único que emite `dist/server` a partir de TS).
2. `backend/src` a importar **caminhos relativos** ou um **único** alias apontando para **`.ts` / saída compilada**, não para `.d.ts` fictícios.

---

## 5. TypeScript, build, Docker (alvo — não implementado na totalidade)

| Item | Estado atual | Alvo (aceite) |
|------|----------------|---------------|
| Entrypoint | `node server/server.js` | `node dist/server/server.js` (ou equivalente após `tsc`) |
| `tsc` | Compila sobretudo `backend/src` → `backend/dist` | Compilar **`server/**/*.ts`** (e eventualmente fundir com `backend/`) |
| Stubs | 47 em `backend/src/types/stubs` | **0** para Express real |
| Docker | `tsc -p backend` + `node server/server.js` | Build **server** + CMD alinhado ao **artefacto** |

---

## 6. Verificações finais pedidas (resultados)

```bash
find server -name "*.js" -type f | sort
```

→ **302 linhas** (lista completa demasiado longa para este ficheiro; usar o comando localmente para lista integral).

```bash
find backend/src/types/stubs -type f 2>/dev/null | sort || true
```

→ **47** ficheiros `stub-*.d.ts`.

```bash
grep -R "from ['\"]#server/" backend/src server --include="*.ts" || true
```

→ **48** ocorrências (imports `#server/` em `backend/src`).

```bash
grep -R "@ts-ignore\|@ts-nocheck\| as any\|: any" server backend/src --include="*.ts" || true
```

→ **sem correspondências** nos `.ts` existentes sob `server/` e `backend/src` (grep não devolveu linhas).

---

## 7. Porque a tarefa **não** pode ser dada como concluída nesta sessão

1. **Volume:** 302 ficheiros JavaScript, com dependências cruzadas (serviços, modelos, Prisma, cron, jobs).
2. **Qualidade:** critérios teus excluem “compilar à força” com `any` em massa, `@ts-nocheck` generalizado ou stubs permanentes.
3. **Risco operacional:** uma conversão mecânica em bloco sem testes de regressão por domínio (auth, carteira, mineração, admin) **quebra produção** com alta probabilidade.

**Trabalho realista:** epic em **fases** (ex.: middleware + auth → rotas públicas → rotas utilizador → admin → services por domínio), com `npm run typecheck` e testes a verde **em cada fase**.

---

## 8. Relatório final (itens 1–20 pedidos) — respostas honestas

1. **Lista inicial `.js` em `server/`:** **302** ficheiros (detalhe: comando `find` acima).
2. **Migrados para `.ts`:** **5** controllers já em TS; **297** ficheiros Express/cadeia ainda **JS**.
3. **`.js` que sobrou:** todos os não listados como já `.ts`; justificativa: **ainda não migrados**.
4. **Entry antigo:** `server/server.js`.
5. **Entry novo:** **ainda** `server/server.js` (não alterado nesta entrega).
6. **Build TS:** hoje **`tsc -p backend/tsconfig.json`**; **não** há ainda `tsc` único que compile todo o `server/`.
7. **Docker:** ainda **CMD `node server/server.js`**; build Docker compila `backend`, não o monólito `server/` completo em TS.
8. **`#server/*`:** mantido como ponte; **remoção** condicionada à migração real de `server/`.
9. **Stubs removidos:** **nenhum** nesta fase (não havia condições para os retirar sem quebrar o typecheck do `backend`).
10. **Stubs que sobram:** **47**; porquê: tipar imports `#server/*` enquanto o código continua em **`.js`**.
11. **Problemas de tipagem:** resolvidos no `backend` com `#server` + stubs; **no `server/`** ainda não há passagem obrigatória pelo compilador TS nos 302 ficheiros.
12. **Resolução:** N/A para o grosso do `server/` — **pendente migração real**.
13. **`any`:** não foi introduzido padrão `any` nos `.ts` existentes do `server/` (grep vazio).
14. **`npm run typecheck`:** **passa** no estado atual (compila `backend` + stubs).
15. **`npm run build:backend`:** **passa** (`backend/dist`).
16. **Prisma validate/generate:** **passam** (schema inalterada nesta auditoria).
17. **Testes:** `tests/httpErrors.test.mjs` **passa** com `backend/dist`; suite completa do repo pode ter falhas **pré-existentes** não ligadas a esta auditoria.
18. **Docker:** **não revalidado** nesta mensagem com `compose build/up` completo.
19. **Express:** continua a ser Express.
20. **Backend real sem JS em `server/`:** **falso** — **302** ficheiros `.js` de fonte ainda presentes.

---

## 9. Próximo passo recomendado (uma única direção, Opção A)

1. Introduzir **`tsconfig.server.json`** na raiz com `rootDir: "server"`, `outDir: "dist/server"`, `module`/`moduleResolution: "NodeNext"`, `include: ["server/**/*.ts"]`.
2. Renomear e tipar **por camadas:** `middleware` → `routes` → `controllers` → `services` → `utils` → `models`, atualizando imports para sufixo `.js` em ESM onde exigido.
3. Migrar **`server/server.js` → `server/server.ts` por último** (ou primeiro com `allowJs` temporário **só** na transição — documentar e remover).
4. Atualizar **Docker / `package.json` / `main`** para `node dist/server/server.js` quando **todo** o grafo necessário compilar.
5. Remover **`#server/*`** e **`backend/src/types/stubs`** quando `backend` importar apenas módulos **TS recompilados** ou paths relativos a `server` já em TS.

---

*Fim do relatório de auditoria. Esta entrega documenta estado e critérios; **não** declara a migração Express em `server/` concluída.*
