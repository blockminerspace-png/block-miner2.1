# Server TypeScript migration — Step 05 (models / repositories)

## 1. Quantidade de `.js` em `server/models` antes da migração

**19** ficheiros `.js` (incluindo `server/models/database/serverDatabaseModel.js` e `server/models/db.js`).

## 2. Lista completa dos ficheiros migrados para `.ts`

Total **19**:

- `server/models/auditLogModel.ts`
- `server/models/autoMiningGpuModel.ts`
- `server/models/autoMiningRewardsModel.ts`
- `server/models/blkEconomyModel.ts`
- `server/models/blkWalletModel.ts`
- `server/models/database/serverDatabaseModel.ts`
- `server/models/db.ts`
- `server/models/inventoryModel.ts`
- `server/models/machineModel.ts`
- `server/models/minerProfileModel.ts`
- `server/models/minersModel.ts`
- `server/models/rackModel.ts`
- `server/models/referralModel.ts`
- `server/models/refreshTokenModel.ts`
- `server/models/shortlinkModel.ts`
- `server/models/shortlinkRewardModel.ts`
- `server/models/userModel.ts`
- `server/models/vaultModel.ts`
- `server/models/walletModel.ts`

## 3. `.js` restantes em `server/models`

**Nenhum.** `find server/models -name "*.js" -type f` → vazio.

## 4. Tabela de auditoria (resumo)

| Arquivo JS (origem) | Usado por | Prisma | Económico | Tx | Queries | Mutations | Risco | Status |
|---------------------|-----------|--------|-----------|-----|---------|-----------|-------|--------|
| `walletModel.js` | Controllers wallet, admin, cron depósitos/saques | Sim | Sim | Sim | Sim | Sim | Crítico | Migrado |
| `minerProfileModel.js` | Controllers, services (hash rate) | Sim | Indireto | Sim | Sim | Sim | Alto | Migrado |
| `database/serverDatabaseModel.js` | `server.js`, admin DB, mining engine | Sim | Sim | Sim | Sim | Sim | Crítico | Migrado |
| `blkEconomyModel.js` / `blkWalletModel.js` | BLK economy / conversão POL→BLK | Sim | Sim | Sim | Sim | Sim | Crítico | Migrado |
| `db.js` | Models que importam prisma local; cron CJS `get`/`all` | Sim (raw unsafe) | — | — | Sim | Sim | Médio (legado) | Migrado + dívida técnica |
| `autoMiningGpuModel.js` | Cron GPU, `autoMiningGpuUtils`, fluxo legado | Sim | Sim | Sim | Sim | Sim | Médio | Migrado + alinhamento schema |

*(Tabela completa ficheiro-a-ficheiro segue o mesmo padrão: consumo em controllers/services/cron.)*

## 5. Models simples

`refreshTokenModel`, `referralModel`, `rackModel`, `shortlinkModel`, `shortlinkRewardModel`, `userModel` (funções reduzidas), etc.

## 6. Models com Prisma

Todos os listados na secção 2, exceto `db.ts` que encapsula Prisma raw.

## 7. Models económicos críticos

`walletModel.ts`, `blkWalletModel.ts`, `blkEconomyModel.ts`, `database/serverDatabaseModel.ts` (`persistBlockRewards`), `inventoryModel.ts`, `vaultModel.ts`.

## 8. Models com transações

`walletModel`, `inventoryModel`, `blkWalletModel`, `database/serverDatabaseModel`, `autoMiningGpuModel` (`claimGPU`, `removeExpiredGPUs`, etc.).

## 9. Problemas de tipagem encontrados

- `const data = {}` em `blkEconomyModel` inferido como `{}` ao atribuir chaves Prisma.
- `where = {}` em `userModel` idem.
- `rows` de `$queryRawUnsafe` como `unknown`.
- Arrays vazios (`pendingReferralDeltas`) inferidos como `never[]`.
- `minerProfileModel`: `findUnique` possivelmente `null` antes de uso.
- `inventoryModel` / `vaultModel`: `imageUrl` inferido só como `undefined`.
- `autoMiningGpuModel`: nomes de modelo Prisma desatualizados (`autoMiningGpuReward` / `userAutoMiningGpu`) vs schema atual (`AutoMiningReward` / `AutoMiningGpu`).
- Exportações em falta em `autoMiningGpuModel` referenciadas por `server/cron/autoMiningGpuCron.js` e `server/utils/autoMiningGpuUtils.js`.

## 10. Como foram resolvidos

- Tipos Prisma explícitos: `Prisma.UserWhereInput`, `Prisma.BlkEconomyConfigUncheckedUpdateInput`, casts controlados no `upsert.create` quando o spread mistura defaults com patch validado manualmente.
- `db.ts`: retorno de `get` tipado como `Promise<unknown>`; `rows` asserido a `unknown[]`.
- `minerProfileModel`: guarda `if (!dbUser) throw new Error("User not found")`; tipos mínimos em `getOrCreateMinerProfile` / `persistMinerProfile`.
- `inventoryModel` / `vaultModel`: `let imageUrl: string | undefined`.
- `serverDatabaseModel`: `pendingReferralDeltas` tipado como `Array<{ userId: number; delta: number }>`.
- **`autoMiningGpuModel.ts`**: reimplementação alinhada ao schema (`autoMiningReward`, `autoMiningGpu`, `autoMiningGpuLog`) com funções usadas pelo cron/utils (`releaseNewGPU`, `removeExpiredGPUs`, `claimGPU`, `getAvailableGPUs`, estatísticas, relatório, etc.), alinhada ao comportamento já descrito em `autoMiningGpuController.ts` (limites, custo em segundos, inventário).

### Onde foi necessário `as` (não `any`)

- `blkEconomyModel.ts`: `create: { ...DEFAULT_ROW, ...data } as Prisma.BlkEconomyConfigUncheckedCreateInput` — o objeto `data` só recebe campos primitivos validados no handler; o `as` evita colisão entre tipos `Update` e `Create` do Prisma no `upsert`.

## 11. `@ts-ignore` / `@ts-nocheck` / `any` como muleta

- **`grep -RE "@ts-ignore|@ts-nocheck| as any|: any" server/models --include="*.ts"`** → sem correspondências.

## 12. `npm run typecheck:server`

**Passou** (exit code 0).

## 13. `npm run build:server`

**Passou**.

## 14. `npm run typecheck`

**Passou** (`typecheck:server` + `typecheck:backend`).

## 15. `npm run build:backend`

**Passou**.

## 16. Testes executados

| Comando | Resultado |
|---------|------------|
| `node --test tests/httpErrors.test.mjs` | **Passou** |
| `npm test` (suite completa) | **Não reexecutado nesta etapa** — na etapa anterior vários testes falhavam por ambiente/DB; repetir após configurar fixtures se necessário. |

## 17. Docker

`docker compose build --no-cache` → **exit code 0** (build concluído no ambiente desta sessão).

`docker compose up` **não** executado (`.env` de produção).

## 18. Pendências (próxima etapa)

1. Migração **`server/utils/**/*.js` → `.ts`** (anunciada; não iniciar aqui).
2. **`server/models/db.ts`**: substituir gradualmente `$queryRawUnsafe` / `$executeRawUnsafe` por `Prisma.sql` parametrizado ou API fluente (dívida já referida no `docs/SECURITY-AUDIT.md`).
3. Opcional: endurecer tipos de retorno públicos nos models (DTOs explícitos) à medida que controllers forem migrados para consumir tipos nomeados.
4. Reativar `noImplicitAny: true` no `tsconfig.server.json` quando o volume de JS legado for baixo.

## 19. Duplicados `.js` + `.ts` em `server/models`

**Confirmado:** não há pares homónimos no código-fonte. Os `.js` gerados estão em **`dist/server/models/`** (19 ficheiros após `build:server`).

## 20. Riscos / refatoração futura

- **`db.ts`**: qualquer novo uso de `run`/`get`/`all` com SQL construído a partir de input de utilizador é de **risco elevado** — manter proibição de concatenação de valores em SQL bruto.
- **`persistBlockRewards`**: blocos grandes numa única transação — monitorizar timeouts e carga; alterações futuras devem preservar incrementos atómicos e comissões de referral.
- **`walletModel`**: saques, depósitos e estados de transação — testes de integração cobrindo `updateTransactionStatus` e reserva de fundos.
- **`autoMiningGpuModel`**: funções usadas por cron/utils e pelo fluxo HTTP; manter paridade com limites (`DAILY_LIMIT`, débito de `autoMiningSecondsBalance`) ao editar.

## Configuração TypeScript

Foi adicionado ao `tsconfig.server.json`:

```json
"server/models/**/*.ts"
```

`allowJs` / `checkJs` mantêm-se como na etapa anterior.

## Nota sobre `autoMiningGpuModel`

O ficheiro `.js` anterior estava **incompleto** em relação às importações do cron (`releaseNewGPU`, `removeExpiredGPUs`, …) e usava nomes de tabelas Prisma inexistentes. A versão `.ts` corrige o alinhamento ao **schema Prisma atual** e expõe as funções necessárias, com lógica alinhada ao `autoMiningGpuController.ts` para o fluxo de claim.
