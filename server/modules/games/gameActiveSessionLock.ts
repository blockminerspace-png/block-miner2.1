/**
 * One in-flight minigame per user + gameSlug (blocks multi-tab parallel farming).
 * In-memory per Node process — matches socket game sessions.
 */

const byUserGame = new Map<string, string>();
const keysBySocket = new Map<string, Set<string>>();

function key(userId: number, gameSlug: string): string {
  return `${userId}:${gameSlug}`;
}

export function tryAcquireUserGameSession(userId: number, gameSlug: string, socketId: string): boolean {
  const k = key(userId, gameSlug);
  const holder = byUserGame.get(k);
  if (holder && holder !== socketId) return false;
  byUserGame.set(k, socketId);
  let set = keysBySocket.get(socketId);
  if (!set) {
    set = new Set();
    keysBySocket.set(socketId, set);
  }
  set.add(k);
  return true;
}

export function releaseUserGameSession(userId: number, gameSlug: string, socketId: string): void {
  const k = key(userId, gameSlug);
  if (byUserGame.get(k) === socketId) byUserGame.delete(k);
  keysBySocket.get(socketId)?.delete(k);
}

export function releaseAllUserGameSessionsForSocket(socketId: string): void {
  const keys = keysBySocket.get(socketId);
  if (!keys) return;
  for (const k of keys) byUserGame.delete(k);
  keysBySocket.delete(socketId);
}

/** Drop stale holder if socket disconnected or session ended. */
export function clearStaleUserGameSession(
  userId: number,
  gameSlug: string,
  isLive: (socketId: string) => boolean,
): void {
  const k = key(userId, gameSlug);
  const socketId = byUserGame.get(k);
  if (!socketId) return;
  if (!isLive(socketId)) {
    byUserGame.delete(k);
    keysBySocket.get(socketId)?.delete(k);
  }
}
