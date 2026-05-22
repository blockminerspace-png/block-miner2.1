import { isAxiosError } from 'axios';
import { isAxiosTimeoutError } from '../../../shared/utils/apiTimeout';

const GATEWAY_BUSY_MESSAGE =
  "O servidor está temporariamente indisponível. Não é problema com sua senha — tente entrar novamente em alguns segundos.";

const NETWORK_ERROR_MESSAGE =
  "Falha de conexão com o servidor. Verifique sua internet e tente novamente.";

/**
 * Maps Axios / API auth errors to a safe user-visible string.
 * Does not log or echo passwords, OTPs, challenge tokens, or cookies.
 *
 * Important: a 5xx / network error MUST NOT be reported as "credenciais
 * inválidas" — the user gets stuck thinking the password is wrong when the
 * upstream proxy or backend is the actual problem.
 */
export function readAuthErrorMessage(error: unknown, fallback = "Não foi possível entrar. Verifique os dados e tente novamente."): string {
  if (isAxiosTimeoutError(error)) {
    return "O servidor demorou para responder. Aguarde alguns segundos e tente entrar novamente.";
  }

  // Pure network failures (DNS, offline, CORS-without-response, ERR_NETWORK):
  // axios produces an error with no `response` field.
  if (isAxiosError(error) && !error.response) {
    const code = String(error.code || '');
    if (code === 'ERR_NETWORK' || code === 'ECONNRESET' || code === 'ECONNREFUSED') {
      return NETWORK_ERROR_MESSAGE;
    }
    return NETWORK_ERROR_MESSAGE;
  }

  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: unknown; status?: number } }).response;
    const status = response?.status;
    const data = response?.data;

    // For gateway / upstream errors, never echo a server-side technical
    // message: many proxies (nginx, Cloudflare) return HTML like "502 Bad
    // Gateway" that would otherwise reach the user verbatim.
    if (typeof status === 'number' && (status === 502 || status === 503 || status === 504)) {
      return GATEWAY_BUSY_MESSAGE;
    }

    if (typeof data === "object" && data !== null) {
      const d = data as Record<string, unknown>;

      const errors = d.errors;
      if (Array.isArray(errors) && errors.length > 0) {
        const first = errors[0];
        if (typeof first === "object" && first !== null && "message" in first) {
          const m = (first as { message?: unknown }).message;
          if (typeof m === "string" && m.trim()) return m.trim();
        }
      }

      if ("message" in d && typeof d.message === "string" && d.message.trim()) {
        return d.message.trim();
      }

      if ("error" in d && typeof d.error === "string" && d.error.trim()) {
        return d.error.trim();
      }
    }

    if (status === 429) {
      return "Muitas tentativas. Aguarde um pouco e tente novamente.";
    }

    if (typeof status === 'number' && status >= 500) {
      return GATEWAY_BUSY_MESSAGE;
    }

    if (status === 401) {
      return "Credenciais inválidas ou sessão expirada.";
    }
  }

  return fallback;
}
