# Alinhamento de testes com backend TypeScript compilado (`#server/*`)

## 1. Imports antigos `../server/**/*.js` nos testes (antes)

Auditoria inicial (amostra representativa; o padrão repetia-se em dezenas de ficheiros):

- `../server/controllers/*.js`
- `../server/services/**/*.js`
- `../server/models/*.js`
- `../server/utils/*.js`
- `../server/middleware/*.js`
- `../server/src/**/*.js`
- `../server/cron/*.js`
- `../server/jobs/*.js`
- `../server/validation/*.js`

Após substituição em massa e correções pontuais, **`grep -R '\.\./server/' tests`** devolve **0** ocorrências.

**Contagem aproximada de linhas de import afetadas:** na ordem das **~100+** ocorrências de `../server/...` substituídas por `#server/...` ou por caminhos `../dist/server/...` onde o teste usa `readFileSync` / `path.join` (ver secção 3).

## 2. Ficheiros de teste alterados (lista)

Todos os `tests/*.test.js` e `tests/*.test.mjs` que importavam módulos do backend foram atualizados para `#server/...` quando o consumo é **runtime** (`import` / `import()`).

Além disso, estes ficheiros tiveram ajustes **específicos** (caminho em disco ou asserções):

| Ficheiro | Alteração |
|----------|-----------|
| `tests/shopControllerLogging.test.mjs` | `readFileSync` → `../dist/server/controllers/shopController.js` |
| `tests/adminMinersUiSecurity.test.mjs` | Idem + `../dist/server/routes/admin.js` |
| `tests/faucetInventoryNoExpiry.test.mjs` | `join` → `../dist/server/controllers/faucetController.js` |
| `tests/checkinWalletRequired.test.mjs` | Apenas `../dist/server/controllers/checkinController.js` (removido fallback `.ts` / `.js` em `server/`) |
| `tests/buildUserAuditSnapshotMinersSelect.test.mjs` | `server/services/...` → `dist/server/services/...` |
| `tests/dailyTaskProgressInternalOfferwallDestructuring.test.mjs` | `dist/server/...` + asserção alinhada ao JS emitido (`= opts`) |
| `tests/adminTelegramUiSecurity.test.mjs` | Leitura de rotas → `dist/server/routes/admin.js` |
| `tests/userActivityAuditMiddleware.test.mjs` | `../dist/...` → `#server/middleware/...` |
| `tests/turnstile.resolveSecret.test.mjs` | `../dist/...` → `#server/middleware/turnstile.js` |
| `tests/adminFraudAuthValidation.test.mjs` | `../dist/...` → `#server/middleware/adminAuth.js` |
| `tests/registerBodySchema.test.mjs` | Asserções alinhadas ao preprocess Zod atual (truncagem / sanitização de `refCode`) |

## 3. Imports convertidos para `#server/*` (padrão)

Substituição global em `tests/`:

```text
../server/  →  #server/
```

Exemplos típicos:

- `from "../server/controllers/walletController.js"` → `from "#server/controllers/walletController.js"`
- `await import("../server/services/checkinChain.js")` → `await import("#server/services/checkinChain.js")`
- `from "../server/src/db/prisma.js"` → `from "#server/src/db/prisma.js"`

**Leitura de ficheiros no disco** (Node não resolve `import` maps em `fs.readFileSync` / `path.join`): usar **`../dist/server/...`** relativamente à raiz do repo ou a `tests/`, conforme o teste.

## 4. Alterações fora de `tests/` (mínimas, necessárias)

| Ficheiro | Motivo |
|----------|--------|
| `server/src/db/prisma.js` | Import `../../utils/projectRoot.js` apontava para `.js` inexistente em `server/utils` (só `.ts` fonte). Passou a `#server/utils/projectRoot.js` para resolver sempre o artefacto compilado. |
| `services/telegram-proof-worker/telegramProofWorker.js` | Carregava `../../server/src/db/prisma.js` (fonte) e quebrava em cadeia. Passou a `#server/src/db/prisma.js` e `#server/services/withdrawalTelegramService.js`. |
| `services/telegram-proof-worker/healthcheck.js` | Idem para `prisma`. |

## 5. `package.json`

- **`pretest`** já era: `npm run build:server && npm run build:backend` — **mantido** (garante `dist/server` antes de `npm test`).
- **Sem alteração obrigatória** nesta etapa.

## 6. `npm run build:server`

**Passa** (executado várias vezes durante validação).

## 7. `node --test tests/httpErrors.test.mjs`

**Passa.**

## 8. Testes que falhavam por import antigo

- **`tests/telegramProofWorker.test.mjs`**: corrigido com `prisma.js` + worker a usarem `#server/*` (deixou de importar `server/utils/projectRoot.js` em fonte).
- **`tests/walletValidation.test.js`** e restantes wallets/rooms/etc.: passam a resolver módulos via `#server/*` após `pretest`.

## 9. `npm test` (suite completa)

**Ainda termina com código de saída ≠ 0.**

Falhas restantes **não são de import** `../server/**/*.js`:

| Suite / teste | Tipo de falha |
|---------------|----------------|
| `tests/i18nLanguage.test.mjs` (`client i18n language resolution`) | **Lógica / expectativa** vs implementação actual em `client/src/i18n/language.js` (ordem de fallbacks `resolveFallbackLanguages`, defaults `pt-BR`, etc.). |
| `tests/ipIntelligenceService.test.mjs` | **Ambiente / rede ou dados mockados**: esperado `residential`, actual `unknown` (Proxycheck / cache). |

**Import antigo:** nenhum identificado na saída da suite após as alterações.

## 10. Greps finais (tests)

```bash
grep -R '\.\./server/.*\.js' tests --include='*.mjs' --include='*.js' --include='*.ts' || true
# (vazio)

grep -R '\.\./server/' tests --include='*.mjs' --include='*.js' --include='*.ts' || true
# (vazio)
```

## 11. `.js` fonte em `server/controllers|services|models|utils`

```bash
find server/controllers server/services server/models server/utils -name '*.js' -type f | sort
# (vazio no ambiente validado — apenas `.ts` + alguns `.js` pontuais fora desses quatro, p.ex. `server/src`, `server/validation`, `server/cron`)
```

## 12. Artefactos em `dist/server/`

Existe saída compilada (exemplo):

- `dist/server/controllers/*.js`
- `dist/server/services/**/*.js`
- `dist/server/models/*.js`
- `dist/server/utils/*.js`
- `dist/server/middleware/*.js`
- `dist/server/src/db/prisma.js`

## 13. Docker

**Não executado** nesta etapa (opcional; já validado noutro ciclo recente do projeto).

## 14. Confirmações de aceite

| Critério | Estado |
|----------|--------|
| Testes sem `../server/controllers|services|models|utils/*.js` | **Sim** (`grep` em `tests/` vazio) |
| Runtime dos testes via `#server/*` onde aplicável | **Sim** |
| `npm run build:server` | **Passa** |
| `node --test tests/httpErrors.test.mjs` | **Passa** |
| Falhas só por import antigo | **Resolvidas** (telegram worker + prisma) |
| Recriar `.js` fonte em controllers/services/models/utils | **Não** |
| Relatório | **Este ficheiro** |

## 15. Referências fora do âmbito `tests/` (informativo)

Ainda existem referências `../server/...js` noutros sítios (ex.: `client/vite.config.js`, `scripts/fraud-enrich-ips.mjs`, pacote espelho em `.deploy/`). **Não fazem parte do critério de aceite desta etapa** (foco em `tests/`). Convém alinhar noutra PR se o Vite ou os scripts tiverem de consumir apenas `dist/server`.

## 16. Próxima etapa (não executada)

Migração TypeScript: `server/cron/**/*.js`, `server/jobs/**/*.js`.
