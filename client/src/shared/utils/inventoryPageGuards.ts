import { DEFAULT_MINER_IMAGE_URL } from "./machine";

/** Strip control chars for safe text / aria (React still escapes HTML; this limits weirdness). */
export function safeDisplayLabel(raw: unknown, maxLen = 240): string {
  if (raw == null) return "";
  const s = String(raw).replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen)}…`;
}

/** Parse drag payload: only positive integers accepted. */
export function parsePositiveIntFromDrag(data: string | undefined): number | null {
  if (data == null || data === "") return null;
  const n = Number.parseInt(data, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Safe `img` src: allow relative paths and http(s) URLs; block script/data URLs and protocol-relative tricks.
 */
export function sanitizeMachineImageSrc(url: unknown, fallback = DEFAULT_MINER_IMAGE_URL): string {
  if (typeof url !== "string") return fallback;
  const trimmed = url.trim();
  if (trimmed === "") return fallback;
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("vbscript:")
  ) {
    return fallback;
  }
  if (trimmed.startsWith("//")) return fallback;
  if (trimmed.startsWith("/")) return trimmed;
  try {
    const u = new URL(trimmed);
    if (u.protocol === "http:" || u.protocol === "https:") return trimmed;
  } catch {
    /* ignore */
  }
  return fallback;
}
