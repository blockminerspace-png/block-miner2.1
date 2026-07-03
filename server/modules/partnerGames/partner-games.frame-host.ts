import type { PrismaClient } from "@prisma/client";
import loggerLib from "../../utils/logger.js";
import {
  refreshIframeHostAllowlistCache,
  upsertActiveFrameHost,
} from "../internal-offerwall/internal-offerwall.iframe-allowlist.js";

const logger = loggerLib.child("PartnerGamesFrameHost");

export function hostnameFromUrl(raw: string | null | undefined): string | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;
  try {
    const host = new URL(trimmed).hostname.toLowerCase();
    return host && host !== "localhost" ? host : null;
  } catch {
    return null;
  }
}

/** Persist iframe hostnames for CSP frame-src (survives in-memory cache resets). */
export async function registerPartnerGameFrameHosts(
  prisma: PrismaClient,
  urls: Array<string | null | undefined>,
): Promise<void> {
  const hosts = new Set<string>();
  for (const raw of urls) {
    const host = hostnameFromUrl(raw);
    if (host) hosts.add(host);
  }
  for (const host of hosts) {
    const result = await upsertActiveFrameHost(prisma, host);
    if (!result.ok) {
      logger.warn("partnerGames.frame_host_skip", { host, message: result.message });
    }
  }
}

export function refreshFrameAllowlistBestEffort(prisma: PrismaClient): void {
  refreshIframeHostAllowlistCache(prisma).catch((err) =>
    logger.warn("partnerGames.refresh_iframe_allowlist_failed", { err: String(err) }),
  );
}

export async function syncAllPartnerGameFrameHosts(prisma: PrismaClient): Promise<void> {
  const games = await prisma.partnerGame.findMany({
    select: { iframeUrl: true, fallbackUrl: true, partnerUrl: true },
  });
  const urls: Array<string | null | undefined> = [];
  for (const g of games) {
    urls.push(g.iframeUrl, g.fallbackUrl, g.partnerUrl);
  }
  await registerPartnerGameFrameHosts(prisma, urls);
  await refreshIframeHostAllowlistCache(prisma);
}
