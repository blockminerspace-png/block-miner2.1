import type { Server } from "socket.io";
import loggerLib from "../../utils/logger.js";
import {
  socketConnectionsActive,
  socketConnectsTotal,
  socketDisconnectsTotal,
  socketMessagesTotal,
} from "./metricsRegistry.js";
import { setObservabilitySocketIo } from "./runtimeRegistry.js";

const log = loggerLib.child("SocketMetrics");

const connectionStartedAt = new WeakMap<object, number>();

export function attachSocketObservability(io: Server): void {
  setObservabilitySocketIo(io);

  io.on("connection", (socket) => {
    connectionStartedAt.set(socket, Date.now());
    socketConnectsTotal.inc({ namespace: socket.nsp.name });
    socketConnectionsActive.inc({ namespace: socket.nsp.name });

    const originalEmit = socket.emit.bind(socket);
    socket.emit = ((event: string, ...args: unknown[]) => {
      socketMessagesTotal.inc({ event: String(event).slice(0, 64), direction: "out" });
      return originalEmit(event, ...args);
    }) as typeof socket.emit;

    socket.onAny(() => {
      socketMessagesTotal.inc({ event: "inbound", direction: "in" });
    });

    socket.on("disconnect", (reason) => {
      socketDisconnectsTotal.inc({ namespace: socket.nsp.name, reason: String(reason).slice(0, 40) });
      socketConnectionsActive.dec({ namespace: socket.nsp.name });
      const started = connectionStartedAt.get(socket);
      if (started) {
        const connectedMs = Date.now() - started;
        if (connectedMs < 5000 && String(reason) === "io server disconnect") {
          log.debug("socket_short_lived", { socketId: socket.id, connectedMs, reason });
        }
      }
    });
  });

  io.engine?.on("connection_error", (err: Error) => {
    log.warn("socket_connection_error", { message: err.message });
  });
}
