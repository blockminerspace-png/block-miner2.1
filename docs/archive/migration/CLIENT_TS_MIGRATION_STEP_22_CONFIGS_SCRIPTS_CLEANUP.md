# Client TS migration — Step 22: Configs & scripts cleanup (fora de `client/src`)

## Contexto

- **Step 21:** `client/src` sem `.js`/`.jsx`; pipeline verde.
- **Step 22:** Auditar e alinhar JavaScript **fora** de `client/src` (configs cliente, scripts raiz, serviços, contratos, snapshot `.deploy`), migrar onde for **seguro**, e documentar o restante.

## 1. Lista inicial (monorepo, excl. `node_modules`, `dist`, `.git`, `coverage`, **e `.deploy`**)

Comando:

```bash
find . \
  \( -path "./node_modules" -o -path "./client/node_modules" -o -path "./server/node_modules" \
     -o -path "./backend/node_modules" -o -path "./contracts/node_modules" \
     -o -path "./dist" -o -path "./client/dist" -o -path "./server/dist" -o -path "./backend/dist" \
     -o -path "./.git" -o -path "./coverage" -o -path "./client/coverage" -o -path "./.deploy" \) -prune -o \
  \( -name "*.js" -o -name "*.jsx" -o -name "*.cjs" -o -name "*.mjs" \) -type f -print | sort
```

**Contagem:** **91** ficheiros (`.js`/`.jsx`/`.cjs`/`.mjs`) — áreas: `client/` (configs + scripts + `public/`), `scripts/`, `tests/`, `services/`, `contracts/`, `app/`, raiz (`eslint.config.cjs`, `prisma.config.js`).

**`.deploy/blockminer-test-package/**`:** ao **incluir** `.deploy` no `find`, existem **centenas** de ficheiros `.js`/`.jsx` — **snapshot legado** do frontend/admin antigo em JSX. **Não** foi convertido em bloco nesta etapa (risco, duplicação com o monorepo, e não faz parte do runtime principal). Ver secção 7.

## 2. Ficheiros migrados para `.ts` (esta etapa)

| Ficheiro | Notas |
|----------|--------|
| `client/vite.config.ts` | Substitui `client/vite.config.js`; mesma config (alias `@game2048/engine`, Vitest/coverage gate, proxy, `define`, nomes de assets). Tipagem explícita em imports Node (`node:fs`, `node:path`, `node:url`). |
| `client/tsconfig.json` | `include`: `["src", "vite.config.ts"]` para o `tsc` validar a config Vite. |

**Removido:** `client/vite.config.js`.

## 3. Ficheiros mantidos em `.js`/`.mjs`/`.cjs` (justificativa)

| Área | Exemplos | Justificativa |
|------|-----------|----------------|
| **Cliente tooling** | `client/eslint.config.js`, `client/postcss.config.js`, `client/tailwind.config.js` | Ecossistema ESLint/PostCSS/Tailwind 3.x usa habitualmente config JS; migrar só por estética aumenta risco sem ganho. |
| **Cliente scripts** | `client/scripts/*.mjs` | Scripts ESM de i18n/landing; Node direto, sem pipeline TS. |
| **Cliente estático** | `client/public/crypto-broadcast/app.js` | Bundle legado servido em `public/`; não passa pelo Vite TS. |
| **Raiz** | `eslint.config.cjs`, `prisma.config.js` | Prisma CLI e ESLint flat config CJS — padrão estável. |
| **Scripts raiz** | `scripts/*.mjs`, `scripts/*.js` | Dezenas de utilitários Node (`backup`, `fraud-enrich-ips`, `run-node-tests`, etc.); importam `#server/*` **compilado** ou `fs`/`pg`; migração massiva a `.ts` seria outra fatia (runner `tsx`/build prévio). |
| **Testes Node** | `tests/*.mjs`, `tests/*.js` | Runner `node --test` + `run-node-tests.mjs` com `--experimental-strip-types` onde importam `client/src/*.ts`. |
| **Serviços** | `services/telegram-proof-worker/*.js` | Worker em produção importa `#server/.../*.js` (saída `dist/server`); manter JS evita segundo pipeline de build do worker. |
| **Contratos** | `contracts/hardhat.config.cjs`, `contracts/scripts/deploy.js`, etc. | Hardhat / ecossistema contratos em JS/CJS. |
| **App legado** | `app/routes/registerAppRoutes.js` | Módulo CommonJS grande (`require`); fora do caminho principal do servidor TypeScript atual. |
| **`.deploy/**`** | Snapshot espelho | Ver secção 7. |

## 4. Alterações em `client/vite.config`

- Ficheiro renomeado para **`vite.config.ts`**.
- Comportamento preservado: plugin React, alias motor 2048, Vitest + coverage gate, `define` de `APP_URL`, `build.rollupOptions.output`, proxy `/api` e `/socket.io`.

## 5. Alterações em scripts da raiz

- **`scripts/generate-obsidian-vault.mjs`:** mapa de descrições — chave `client/src/App.jsx` atualizada para **`client/src/app/App.tsx`** (estrutura real do repo).

## 6. Alterações em `services/**`

- Nenhuma alteração funcional nesta etapa; worker continua em `.js` (secção 3).

## 7. Alterações em `.deploy/**`

- **Nenhuma conversão em massa.** O pacote `.deploy/blockminer-test-package` permanece um **espelho antigo** (inclui `client/src/**/*.jsx`, `vite.config.js`, etc.).
- **Recomendação:** regenerar o snapshot a partir do monorepo atual numa entrega dedicada, ou tratar como arquivo morto se o deploy real já não o usar.

## 8. `package.json` / CI / docs

| Ficheiro | Alteração |
|----------|-----------|
| `.github/workflows/ci.yml` | Texto do passo de coverage: referência `client/vite.config.ts`. |
| `docs/SECURITY-AUDIT.md` | Referência ao ficheiro de coverage: `client/vite.config.ts`. |

`client/package.json` **sem** alteração obrigatória nesta etapa (scripts `vite` resolvem `vite.config.ts` automaticamente).

## 9. Scripts que exigem build antes

- **Inalterado:** `pretest` na raiz continua a compilar servidor/backend antes de `npm test`.
- **Dockerfile (frontend):** continua a copiar `dist/server/services/game2048Engine.js` para `client/engine/` antes de `npm run build` — compatível com `vite.config.ts`.

## 10. Imports legados corrigidos

- `generate-obsidian-vault.mjs`: caminho da app principal atualizado para `App.tsx` na árvore real.

## 11–12. Problemas de tipagem / resolução

- Inclusão de `vite.config.ts` no `tsconfig.json` do cliente para falhas de resolução de tipos não surgirem silenciosamente em CI futuro.
- Nenhum erro de `tsc` após a migração da config Vite.

## 13. Uso de `any`

Não introduzido como tipo ou `as any` nesta fatia.

## 14. `@ts-ignore` / `@ts-nocheck`

Não utilizados.

## 15–22. Validação obrigatória (2026-05-14)

| # | Comando | Resultado |
|---|---------|-------------|
| 15 | `cd client && npm run typecheck` | **OK** |
| 16 | `cd client && npm run build` | **OK** |
| 17 | `cd client && npm test` | **OK** (254 testes) |
| 18 | `npm test` | **OK** (465 testes) |
| 19 | `npm run typecheck:server` | **OK** |
| 20 | `npm run build:server` | **OK** |
| 21 | `npm run build:backend` | **OK** |
| 22 | `docker compose build --no-cache` | **OK** |

## 23. `find client/src (*.js/*.jsx)`

**Saída vazia** — confirmado.

## 24. `find server (*.js)` (excl. `node_modules`, `dist`)

**Saída vazia** — confirmado.

## 25. `client/src` sem `.js`/`.jsx` recriados

Confirmado (find vazio).

## 26. `server/` sem `.js` fonte

Confirmado (find vazio).

## 27. Próxima etapa recomendada (não executada aqui)

Criar **`FINAL_TYPESCRIPT_MIGRATION_REPORT.md`** com visão global (Steps 19–22, decisões, dívida técnica: `.deploy`, scripts Node, worker Telegram, Hardhat).

Opcionalmente:

- Regenerar ou remover `.deploy/blockminer-test-package` obsoleto.
- Migrar `scripts/run-node-tests.mjs` / scripts críticos para `.ts` com `tsx` se quiser unificar tooling.
- Avaliar `client/eslint.config.ts` quando a stack ESLint+TypeScript estiver estável no projeto.

---

## Critério de aceite Step 22

- `client/src` e `server/` (fonte) permanecem limpos de `.js`/`.jsx` conforme critérios anteriores.
- `client/vite.config.ts` em uso; build/test/Docker verdes.
- Scripts e configs que permanecem em JS documentados com justificativa técnica.
- Relatório presente (este ficheiro).

**Step 22: fechada** no âmbito definido (migração segura da config Vite + alinhamentos; sem reescrita total de scripts/deploy snapshot).
