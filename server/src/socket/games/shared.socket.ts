import type { GameSessionState } from "./games-socket.types.js";
export function clearMemoryMismatchTimer(state: GameSessionState | undefined) {
  if (!state) return;
  const memT = state.memoryMismatchTimeout;
  if (memT) {
    clearTimeout(memT as ReturnType<typeof setTimeout>);
    state.memoryMismatchTimeout = null;
  }
  const cartT = state.cartTickTimer;
  if (cartT) {
    clearInterval(cartT as ReturnType<typeof setInterval>);
    state.cartTickTimer = null;
  }
}
