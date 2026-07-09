export type PartnerLaunchMode = "iframe" | "external";

/** Auth/affiliate pages and API paths cannot run inside our iframe. */
export function inferPartnerLaunchMode(iframeUrl: string): PartnerLaunchMode {
  const raw = String(iframeUrl ?? "").trim();
  if (!raw) return "external";
  try {
    const u = new URL(raw);
    const path = u.pathname.toLowerCase();
    if (
      path.includes("/register") ||
      path.includes("/login") ||
      path.includes("/signup") ||
      path.startsWith("/api/")
    ) {
      return "external";
    }
  } catch {
    return "external";
  }
  return "iframe";
}

export function parsePartnerLaunchMode(value: unknown): PartnerLaunchMode | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "iframe" || raw === "external") return raw;
  return null;
}

export function partnerExternalUrl(game: {
  partnerUrl?: string | null;
  fallbackUrl?: string | null;
  iframeUrl?: string | null;
}): string | null {
  for (const candidate of [game.partnerUrl, game.fallbackUrl, game.iframeUrl]) {
    const s = String(candidate ?? "").trim();
    if (!s) continue;
    try {
      const u = new URL(s);
      if (u.protocol === "http:" || u.protocol === "https:") return s;
    } catch {
      /* skip */
    }
  }
  return null;
}
