import crypto from "node:crypto";
import type { GameSessionState, MemoryCard } from "./games-socket.types.js";
import { GAME_NAMES, GAME_SLUG_MAX_LEN, MATCH3_SYMBOLS } from "./games-socket.constants.js";

export function getMemoryBoard(s: GameSessionState): MemoryCard[] {
  const b = s.board;
  return Array.isArray(b) ? (b as MemoryCard[]) : [];
}

export function getMemoryFlipped(s: GameSessionState): MemoryCard[] {
  const f = s.flipped;
  return Array.isArray(f) ? (f as MemoryCard[]) : [];
}
export function parseGameSlug(raw) {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s || s.length > GAME_SLUG_MAX_LEN) return null;
  return Object.prototype.hasOwnProperty.call(GAME_NAMES, s) ? s : null;
}

/** @param {unknown} p */
export function readMatch3GridCoord(p) {
  if (!p || typeof p !== "object" || Array.isArray(p)) return null;
  const x = Number(/** @type {{ x?: unknown }} */ p.x);
  const y = Number(/** @type {{ y?: unknown }} */ p.y);
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x > 7 || y < 0 || y > 7) return null;
  return { x, y };
}
const CART_ENEMY_VARIANTS = [
  { body: "#f97316", accent: "#fdba74", glow: "rgba(249,115,22,0.45)" },
  { body: "#ef4444", accent: "#fca5a5", glow: "rgba(239,68,68,0.45)" },
  { body: "#fb7185", accent: "#fecdd3", glow: "rgba(251,113,133,0.42)" }
];

/**
 * Fisher–Yates shuffle using cryptographically strong indices.
 * @template T
 * @param {T[]} items
 * @returns {T[]}
 */
export function secureShuffle(items) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

export function randomMatch3Symbol() {
  return MATCH3_SYMBOLS[crypto.randomInt(0, MATCH3_SYMBOLS.length)];
}
