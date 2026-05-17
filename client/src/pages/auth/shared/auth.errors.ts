/**
 * Maps Axios / API auth errors to a safe user-visible string.
 * Does not log or echo passwords, OTPs, challenge tokens, or cookies.
 */
export function readAuthErrorMessage(error: unknown, fallback = "Não foi possível entrar. Verifique os dados e tente novamente."): string {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: unknown; status?: number } }).response;
    const status = response?.status;
    const data = response?.data;

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

    if (status === 401) {
      return "Credenciais inválidas ou sessão expirada.";
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
