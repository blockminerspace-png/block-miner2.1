# Telemetria de Erros do Cliente (Client Error Reporting)

> Fontes: `server/modules/traffic/traffic.routes.ts` (ingestão), `server/routes/admin.ts` (admin API),
> `client/src/pages/admin/AdminClientErrors.tsx` (painel), `client/src/shared/utils/reportApiFailure.ts` (helper client).

## Visão geral

O painel **Admin → Erros de cliente** mostra dois tipos de evento, todos gravados na
tabela `AuditLog`:

| Categoria | `action` no AuditLog | Origem | Severidade |
|---|---|---|---|
| **crash** | `client_error_report` | `ErrorBoundary` + handlers globais (`main.tsx`) | `error` |
| **api_failure** | `client_api_failure` | helper `reportApiFailure()` chamado em blocos catch de operações importantes | `warning` |

## Endpoint de ingestão

`POST /api/track/client-error` (rate limit: 10/min, isento de CSRF).

Body:
```jsonc
{
  "category": "crash" | "api_failure",   // default "crash"
  "message": "string (até 800)",
  "stack": "string (até 4000, opcional)",
  "url": "string (opcional)",
  // extras p/ api_failure:
  "statusCode": 500,
  "code": "INTERNAL_ERROR",
  "operation": "youtube_claim"
}
```

O servidor:
1. Descarta ruído conhecido (extensões, analytics, ChunkLoadError — ver `CLIENT_ERROR_NOISE`).
2. Loga estruturado no stdout (`[client_error_report]` / `[client_api_failure]`) → aparece em `docker logs`.
3. Persiste no `AuditLog` com `metadata` contendo tudo (url, stack, statusCode, code, operation, buildId).

## Quando reportar `api_failure` (regra de ouro)

**Reporte** falhas inesperadas que o admin precisa ver para corrigir:
- 5xx do servidor (bug real)
- 401 sessão expirada durante uma ação longa (YouTube watch)
- Erro de rede esporádico
- Response malformado

**NÃO reporte** erros esperados/benignos (senão o painel vira lixo):
- "Tempo de visualização insuficiente" (client faz retry silencioso)
- "Limite diário atingido" (UX normal)
- Validação de input do próprio usuário

**Filtrado automaticamente no servidor** (`CLIENT_ERROR_NOISE` + regra de 429):
- HTTP 429 (rate limit / cooldown) — UX esperada
- Scripts de terceiros: Google Translate (`translate.google.com`), YouTube IFrame API (`youtube.com/iframe_api`), CDNs de ads (`infird.com`, etc.)
- Erros de DOM causados por extensões: `insertBefore`/`removeChild`/`NotFoundError` (tradutores/adblocks mutando o DOM sob o React)
- ChunkLoadError / stale chunks (auto-recarregam)

## Onde está plugado hoje

- **YouTube claim** (`client/src/pages/youtube-watch/YouTubeWatchPage.tsx`): reporta
  quando o `/youtube/claim` falha com status ≠ 400 (ex.: 401, 5xx). Não reporta o
  retry silencioso de "tempo insuficiente" nem o "limite diário".
- **Faucet** (`client/src/pages/faucet/FaucetPage.tsx`): reporta falhas em
  `/faucet/claim` e `/faucet/partner/start`.
- **Shortlink** (`client/src/pages/shortlinks/`): reporta falhas em
  `/shortlink/start` (ShortlinksPage) e `/shortlink/complete-step` (ShortlinkStepPage).

## Como estender (próximos alvos)

Adicionar telemetria a outras operações é 1 import + 1 chamada no catch:

```tsx
import { reportApiFailure } from '../../shared/utils/reportApiFailure';

catch (err) {
  // ... toast pro usuário ...
  reportApiFailure({
    operation: 'offerwall_submit',
    message: serverMsg || 'submit_failed',
    statusCode: status,
    code,
    context: { offerId },
  });
}
```

Candidatos naturais restantes: offerwall (int/ext), shop, withdrawals.

## Painel admin

`/admin/client-errors` — lista ambas categorias com badges visuais:
- 🔴 vermelho = crash
- 🟡 âmbar = api failure (mostra `operation`, `HTTP {status}`, `{code}`)

Botões: Atualizar, Copiar (markdown com todos os campos), Limpar tudo.
