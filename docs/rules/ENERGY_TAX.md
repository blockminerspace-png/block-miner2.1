# Taxa de Energia — Regras de Negócio

> Fonte de verdade: `server/modules/energy-tax/energyTax.service.ts`
> UI: `client/src/pages/taxes/EnergyTaxSection.tsx`, lembrete no `client/src/pages/dashboard/DashboardPage.tsx`

## 1. Modelo

A Taxa de Energia é uma taxa sobre o POL minerado. O jogador escolhe **como** pagar:

| Regime | Mecânica | Custo total na semana |
|---|---|---|
| **Diário** | Botão "Pagar hoje", 1× por dia. Debita `0,7143%` sobre o minerado **de ontem**. | **5%** (`DAILY_WEEK_RATE` = 0.05, `DAILY_PER_DAY_RATE` = 0.05/7) |
| **Semanal** | Não paga nada durante a semana. Cron de fechamento (segunda 21h BRT) cobra os dias em aberto a `2,1429%/dia`. | **15%** (`FULL_WEEK_RATE` = 0.15, `AUTO_PER_DAY_RATE` = 0.15/7) |
| **Isenção por atividade** | 10+ atividades no dia (offerwall ext./int., faucet, shortlink, YouTube, jogos). | **0%** daquele dia |

Trade-off: pagar todo dia economiza **67%** mas exige ação diária. Deixar pra segunda é
**3× mais caro** porém automático.

> ⚠️ **Importante:** as taxas são sempre **por dia, sobre o minerado daquele dia**.
> Nunca há cobrança retroativa de 7 dias de uma vez. O cron semanal cobra **cada dia em
> aberto separadamente**, multiplicando o minerado daquele dia por `AUTO_PER_DAY_RATE`.

**Não há corte de mineração.** A única consequência de não pagar durante a semana é o
fechamento automático de segunda (regime semanal, 15%).

## 2. Feature gating

A taxa só vale a partir de `ENERGY_TAX_STARTS_AT` (`isEnergyTaxActive()`), default
`2026-06-30T00:00:00Z` (29/06/2026 21:00 BRT). Ajustável via env `ENERGY_TAX_STARTS_AT_ISO`.
Antes desse instante: nenhuma cobrança (manual ou cron) é permitida.

## 3. Quitação de um dia (fonte única de verdade)

Um período de mineração segue o **mesmo corte do site** (`CHECKIN_RESET_HOUR`, default **21h BRT**):
janela de 21:00 até 20:59:59 do dia civil seguinte. `periodDayStartsAt` grava o instante
de início desse período (21h BRT = 00:00 UTC no dia civil do fim do período − 1).

"Pagar hoje" quita o **último período já fechado** (após as 21h), não o período aberto.

Um dia é considerado **quitado** quando existe um `EnergyTaxCharge` com
`periodDayStartsAt = início do período` (qualquer `status`) **OU** quando o jogador atingiu
10+ atividades no período corrente ao pagar (isenção por atividade).

## 4. Dias em aberto (lembrete no dashboard)

Função: **`computeConsecutiveUnpaidMiningDays(userId, now)`**.

Conta, de hoje para trás, os dias consecutivos que **devem** (tiveram mineração E não
foram quitados por pagamento ou isenção). A contagem **para** no primeiro dia que:

- **não teve mineração** (rewards = 0), ou
- **foi quitado** (charge existente), ou
- **foi isento por atividade** (10+ atividades).

O resultado alimenta `unpaidDays` em `computeWeekSummary`. Se `unpaidDays > 0`, a sessão
expõe `energyHasPendingTax` e o dashboard mostra um lembrete suave (sem pausar mineração).

## 5. Cron semanal (`runWeeklySweep`, segunda 21h BRT)

Para cada usuário que minerou na janela de 7 dias, para cada dia em aberto:

1. Se o dia foi **isento por atividade** → cria `EnergyTaxCharge` `mode:"exempt"`,
   `amount:0`, sem débito. (A isenção é **automática**, não exige clique no botão.)
2. Senão, calcula `minerado_do_dia × AUTO_PER_DAY_RATE` e tenta debitar:
   - saldo ≥ valor → `status:"paid"` (debita tudo)
   - 0 < saldo < valor → `status:"partial"` (debita o que tem)
   - saldo = 0 → `status:"skipped"` (sem débito)

## 6. Bugs corrigidos (referência histórica)

| ID | Problema | Correção |
|---|---|---|
| B1 | Offerwall interno não contava pra isenção: query filtrava `status:"completed"` mas o enum grava `"COMPLETED"` | Filtro corrigido para `"COMPLETED"` |
| B2 | `unpaidDays` do banner era `7 - paidDays` (inflava o aviso) | `unpaidDays` agora vem de `computeConsecutiveUnpaidMiningDays` |
| B3 | Isenção por atividade não era considerada na contagem | Dia isento conta como quitado (via função única) |
| B4 | Comentário dizia `AUTO_PER_DAY_RATE (1.43%/dia)` | Corrigido para `2.1429%/dia` |
| B5 | Card "Sua fatura desta semana" parecia cobrança retroativa de 7 dias | Reformulado como "Simulação de economia" com disclaimer explícito |
| B6 | `runWeeklySweep` cobrava dias isentos por atividade se o jogador não clicasse "Pagar hoje" | Sweep agora cria charge `mode:"exempt"` em dias com 10+ atividades |
| B7 | `payDailyTax` gravava `periodDayStartsAt` no dia do pagamento; sweep buscava no dia minerado → dupla cobrança auto+manual | Manual e sweep usam o mesmo `periodDayStartsAt` (dia minerado); migration corrige histórico |
| B8 | 3+ dias sem pagar pausava mineração (`energyBlocked`) | Corte de energia removido; taxa continua via pagamento diário ou sweep semanal |

## 7. Constantes

```ts
FULL_WEEK_RATE      = 0.15    // regime semanal (deixar pra segunda)
DAILY_WEEK_RATE     = 0.05    // regime diário
DAILY_PER_DAY_RATE  = 0.05/7  // 0.7143%/dia  (botão "Pagar hoje")
AUTO_PER_DAY_RATE   = 0.15/7  // 2.1429%/dia  (cron semanal)
ACTIVITY_DISCOUNT_THRESHOLD = 10  // atividades/dia para isenção
```
