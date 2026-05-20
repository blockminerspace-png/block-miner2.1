import { DEFAULT_MINER_IMAGE_URL } from "./machine";
import { isStockPlaceholderMinerImageUrl } from "./machineImage";

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
 * Safe display src for a known-good machine image URL, or null when absent/invalid.
 * Does not substitute stock placeholders (use MachineImage for UI fallback).
 */
export function resolveDisplayMachineImageSrc(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const trimmed = url.trim();
  if (trimmed === "" || isStockPlaceholderMinerImageUrl(trimmed)) return null;
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("vbscript:")
  ) {
    return null;
  }
  if (trimmed.startsWith("//")) return null;
  if (trimmed.startsWith("/")) return trimmed;
  try {
    const u = new URL(trimmed);
    if (u.protocol === "http:" || u.protocol === "https:") return trimmed;
  } catch {
    /* ignore */
  }
  return null;
}

export function sanitizeMachineImageSrc(url: unknown, fallback = DEFAULT_MINER_IMAGE_URL): string {
  const resolved = resolveDisplayMachineImageSrc(url);
  if (resolved) return resolved;
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