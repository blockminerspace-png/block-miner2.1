/**
 * Reporta uma falha de chamada de API (tratada, não-crash) pro painel de admin
 * "Erros de cliente". Reaproveita o endpoint /api/track/client-error com
 * category="api_failure" para diferenciar de crashes do ErrorBoundary.
 *
 * Use em blocos catch de operações importantes (claim de recompensa, faucet,
 * shortlink, etc.) quando o erro for inesperado/útil de aparecer no admin.
 * NÃO use para erros esperados e benignos (ex.: "tempo insuficiente" que o
 * client já trata com retry silencioso) — senão o painel enche de ruído.
 *
 * Best-effort: nunca lança. Respeita o rate limiter do servidor (10/min).
 */

type ApiFailurePayload = {
  /** Operação que falhou, ex.: "youtube_claim", "faucet_claim". */
  operation: string;
  /** Mensagem curta p/ o admin entender rápido. */
  message: string;
  /** HTTP status code se disponível. */
  statusCode?: number;
  /** Código de erro interno se disponível (ex.: "DAILY_LIMIT_REACHED"). */
  code?: string;
  /** Contexto extra estruturado (videoId, amount, etc.). Serializado p/ metadata. */
  context?: Record<string, unknown>;
  /** URL da página onde ocorreu (default: window.location.pathname). */
  url?: string;
};

export function reportApiFailure(payload: ApiFailurePayload): void {
  try {
    if (typeof window === "undefined") return;
    const body = {
      category: "api_failure" as const,
      operation: payload.operation,
      message: payload.message,
      statusCode: payload.statusCode,
      code: payload.code,
      url: payload.url ?? window.location.pathname,
      // Campos de contexto vão no campo genérico p/ aparecerem no metadata do admin.
      stack: payload.context ? JSON.stringify(payload.context).slice(0, 4000) : undefined,
    };
    // fetch (não axios) p/ não disparar interceptors/loops nem depender do store de auth.
    void fetch("/api/track/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      keepalive: true,
      body: JSON.stringify(body),
    }).catch(() => {
      /* nunca falhar um report */
    });
  } catch {
    /* best-effort */
  }
}
