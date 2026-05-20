# Client TS migration — Step 19: Admin pages bulk TypeScript

## Scope

- All files under `client/src/pages/admin/` use `.tsx` / supporting `.ts` only.
- Verification: `find client/src/pages/admin \( -name "*.jsx" -o -name "*.js" \)` returns **no paths** (admin UI tree is TS-only).

## Notable typing additions (this slice)

- **`adminFinance.types.ts`**: finance dashboard shapes (pending withdrawals, BLK form, activity rows, Telegram, user detail modal).
- **`AdminFinance.tsx`**: typed `useState`, `useRef<ActivityFiltersSnapshot>`, `readAxiosResponseMessage` in catches, BLK form as string-backed inputs, numeric `colSpan`, safe dates for withdrawals/activity.
- **`AdminUsers.tsx`**: end-to-end types for list rows, dossier payload, tab slices, transactions/logs/tickets/machines/related rows, generic `SimpleList`, `SendMinerTab` props, `readAxiosResponseMessage` for ban/send flows.

## Validation (2026-05-13)

```text
cd client && npm run typecheck   # exit 0
cd client && npm run build       # exit 0
```

## Leftovers

- None under `client/src/pages/admin` for `.js`/`.jsx`.
- Further slices outside `admin/` remain governed by the broader client migration plan.

---

## Correção durante fecho do pipeline (2026-05-14)

**Erro:** `npm test` na raiz falhou com `ENOENT` ao abrir ficheiros `.jsx` já removidos (`AdminMiners.jsx`, `AdminFraudSignals.jsx`, `AdminFinance.jsx`, `AdminUsers.jsx`).

**Correção (mínima):** Atualizar os testes de segurança estática para ler as fontes `.tsx` equivalentes:

- `tests/adminMinersUiSecurity.test.mjs` → `AdminMiners.tsx`
- `tests/adminFraudUiSecurity.test.mjs` → `AdminFraudSignals.tsx`
- `tests/adminTelegramUiSecurity.test.mjs` → `AdminFinance.tsx`
- `tests/adminUsersUiSecurity.test.mjs` → `AdminUsers.tsx`

Espelho em `.deploy/blockminer-test-package/tests/` mantido alinhado.

---

## Validação final completa

Data da corrida: **2026-05-14** (ambiente local do repositório).

### 1. `cd client && npm run typecheck`

- **Resultado:** **passou** — `tsc --noEmit -p tsconfig.json`, exit code **0**.

### 2. `cd client && npm run build`

- **Resultado:** **passou** — `vite build`, exit code **0** (avisos Rollup/chunk size apenas informativos).

### 3. `cd client && npm test`

- **Resultado:** **passou** — Vitest `v4.1.2`, **40** ficheiros de teste, **254** testes, exit code **0**.

### 4. `npm test` (raiz)

- **Resultado:** **passou** — `pretest` (`build:server` + `build:backend`) + `node scripts/run-node-tests.mjs`, exit code **0**.
- Sumário do runner: **465** testes, **465** pass, **0** fail.

### 5. `npm run typecheck:server`

- **Resultado:** **passou** — `tsc -p tsconfig.server.json --noEmit`, exit code **0**.

### 6. `npm run build:server`

- **Resultado:** **passou** — `tsc -p tsconfig.server.json`, exit code **0**.

### 7. `npm run build:backend`

- **Resultado:** **passou** — `tsc -p backend/tsconfig.json`, exit code **0**.

### 8. `docker compose build --no-cache`

- **Resultado:** **passou** — imagens `block-miner-app:latest` e `block-miner-worker:latest` construídas com sucesso, exit code **0** (aviso Compose sobre Bake/buildx apenas informativo).

### 9. `find client/src/pages/admin \( -name "*.jsx" -o -name "*.js" \) | sort`

- **Resultado:** **saída vazia** — nenhum `.js`/`.jsx` em `client/src/pages/admin`.

### 10. Grep por `.jsx` em `client/src/pages/admin` e `client/src/app`

Comando:

```bash
grep -R "\.jsx" client/src/pages/admin client/src/app \
  --include="*.ts" \
  --include="*.tsx" \
  --include="*.js" \
  --include="*.jsx" || true
```

- **Resultado:** duas ocorrências de **texto** (não são ficheiros Admin em JSX):
  - `client/src/pages/admin/AdminTransparency.tsx` — comentário de histórico que menciona `AdminTransparency.jsx`.
  - `client/src/app/App.tsx` — `lazy(() => import('../shared/components/Web3Providers.jsx'))` (componente partilhado fora do âmbito Step 19).

### 11. Grep por `@ts-ignore`, `@ts-nocheck`, ` as any`, `: any` em Admin

Comando:

```bash
grep -R "@ts-ignore\|@ts-nocheck\| as any\|: any" client/src/pages/admin \
  --include="*.ts" \
  --include="*.tsx" || true
```

- **Resultado:** **saída vazia** — nenhum match.

### 12. `find server -name "*.js" -type f` (excl. `node_modules`, `dist`)

- **Resultado:** **saída vazia** — sem `.js` fonte sob `server/` fora de artefactos excluídos.

### 13. Confirmação: Admin zerado em `.js`/`.jsx`

- **Confirmado:** `client/src/pages/admin` contém apenas `.ts`/`.tsx` (e subpastas no mesmo padrão).

### 14. Confirmação: nenhum `.js` fonte recriado em `server/`

- **Confirmado:** conforme ponto 12; TypeScript em `server/` compila para `dist/`, não há regressão de fontes `.js` em `server/`.

### 15. Lista final de ficheiros TypeScript em Admin

```text
client/src/pages/admin/AdminAnalytics.tsx
client/src/pages/admin/admin.api.ts
client/src/pages/admin/AdminBackups.tsx
client/src/pages/admin/AdminBanners.tsx
client/src/pages/admin/AdminBroadcast.tsx
client/src/pages/admin/AdminCheckinMilestones.tsx
client/src/pages/admin/AdminCreators.tsx
client/src/pages/admin/adminDailyTasks/adminDailyTasksModel.ts
client/src/pages/admin/AdminDailyTasks.tsx
client/src/pages/admin/AdminDashboard.tsx
client/src/pages/admin/AdminDepositTickets.tsx
client/src/pages/admin/AdminFinance.tsx
client/src/pages/admin/adminFinance.types.ts
client/src/pages/admin/AdminFraudSignals.tsx
client/src/pages/admin/AdminInternalOfferwall.tsx
client/src/pages/admin/adminInternalOfferwallValidate.test.ts
client/src/pages/admin/adminInternalOfferwallValidate.ts
client/src/pages/admin/AdminLogin.tsx
client/src/pages/admin/AdminLogs.tsx
client/src/pages/admin/AdminMetrics.tsx
client/src/pages/admin/AdminMiners.tsx
client/src/pages/admin/adminMiniPassForm.test.ts
client/src/pages/admin/adminMiniPassForm.ts
client/src/pages/admin/AdminMiniPassSeason.tsx
client/src/pages/admin/AdminMiniPass.tsx
client/src/pages/admin/AdminOfferEventManage.tsx
client/src/pages/admin/AdminOfferEvents.tsx
client/src/pages/admin/AdminReadEarn.tsx
client/src/pages/admin/AdminStreaming.tsx
client/src/pages/admin/AdminSupport.tsx
client/src/pages/admin/AdminTransparency.tsx
client/src/pages/admin/admin.types.ts
client/src/pages/admin/AdminUserSidebar.tsx
client/src/pages/admin/AdminUsers.tsx
client/src/pages/admin/components/AdminLayout.tsx
client/src/pages/admin/components/AdminSidebar.test.tsx
client/src/pages/admin/components/AdminSidebar.tsx
client/src/pages/admin/components/AdminSupportPlayerDossier.test.tsx
client/src/pages/admin/components/AdminSupportPlayerDossier.tsx
```

### 16. Próxima etapa recomendada (não executar até fechar governança da Step 20)

Migrar páginas de utilizador **em bloco por domínio**, na ordem sugerida:

- `client/src/pages/dashboard`
- `client/src/pages/wallet`
- `client/src/pages/shop`
- `client/src/pages/machines`
- `client/src/pages/support`
- `client/src/pages/checkin`
- `client/src/pages/tasks`
- `client/src/pages/rewards`

Repetir o mesmo rigor de pipeline + relatório por fatia antes de avançar.

---

## Critério de aceite Step 19

| Critério | Estado |
|----------|--------|
| `client/src/pages/admin` sem `.js`/`.jsx` | OK |
| `cd client && npm run typecheck` | OK |
| `cd client && npm run build` | OK |
| `cd client && npm test` | OK |
| `npm test` | OK |
| `npm run typecheck:server` | OK |
| `npm run build:server` | OK |
| `npm run build:backend` | OK |
| `docker compose build --no-cache` | OK |
| Grep Admin livre de `@ts-ignore` / `@ts-nocheck` / ` as any` / `: any` | OK |
| `server/` sem `.js` fonte (excl. `dist`, `node_modules`) | OK |
| Relatório Step 19 atualizado | OK |

**Step 19: fechada.**
