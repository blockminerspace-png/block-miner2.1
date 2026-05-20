/** Production tuning via env (.env.production on VM). */

export function envPositiveInt(name: string, fallback: number): number {
  const n = Number.parseInt(String(process.env[name] ?? "").trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function applyHttpServerTimeouts(server: import("node:http").Server): void {
  const requestTimeoutMs = envPositiveInt("SERVER_REQUEST_TIMEOUT_MS", 0);
  const headersTimeoutMs = envPositiveInt("SERVER_HEADERS_TIMEOUT_MS", 0);
  const keepAliveTimeoutMs = envPositiveInt("SERVER_KEEPALIVE_TIMEOUT_MS", 0);

  if (requestTimeoutMs > 0) server.requestTimeout = requestTimeoutMs;
  if (headersTimeoutMs > 0) server.headersTimeout = headersTimeoutMs;
  if (keepAliveTimeoutMs > 0) server.keepAliveTimeout = keepAliveTimeoutMs;
}

export function buildSocketIoEngineOptions(): {
  pingInterval: number;
  pingTimeout: number;
  connectTimeout: number;
  maxHttpBufferSize: number;
} {
  return {
    pingInterval: envPositiveInt("SOCKET_PING_INTERVAL_MS", 30_000),
    pingTimeout: envPositiveInt("SOCKET_PING_TIMEOUT_MS", 180_000),
    connectTimeout: envPositiveInt("SOCKET_CONNECT_TIMEOUT_MS", 120_000),
    maxHttpBufferSize: envPositiveInt("SOCKET_MAX_HTTP_BUFFER_SIZE", 1_048_576),
  };
}
