import type { PrismaClient } from "@prisma/client";
import loggerLib from "../../utils/logger.js";
import { probePartnerEmbedUrl, launchModeFromProbe } from "./partner-games.embed-probe.js";
import type { PartnerEmbedProbeResult } from "./partner-games.embed.types.js";
import { registerPartnerGameFrameHosts } from "./partner-games.frame-host.js";

const log = loggerLib.child("PartnerEmbedSync");

export async function applyEmbedProbeToGame(
  prisma: PrismaClient,
  gameId: number,
  iframeUrl: string,
): Promise<PartnerEmbedProbeResult> {
  const probe = await probePartnerEmbedUrl(iframeUrl);
  const launchMode = launchModeFromProbe(probe);

  await prisma.partnerGame.update({
    where: { id: gameId },
    data: {
      embedStatus: probe.status,
      embedBlockReason: probe.reason,
      embedProbe: probe as object,
      embedProbedAt: new Date(probe.probedAt),
      launchMode,
    },
  });

  void registerPartnerGameFrameHosts(prisma, [iframeUrl]).catch((err) =>
    log.warn("frame_host_register_failed", { gameId, err: String(err) }),
  );

  return probe;
}

export async function syncAllPartnerGameEmbedProbes(prisma: PrismaClient): Promise<void> {
  const games = await prisma.partnerGame.findMany({
    select: { id: true, iframeUrl: true, title: true },
  });
  for (const game of games) {
    try {
      const probe = await applyEmbedProbeToGame(prisma, game.id, game.iframeUrl);
      log.info("embed_probe_synced", { id: game.id, title: game.title, status: probe.status });
    } catch (err) {
      log.warn("embed_probe_sync_failed", { id: game.id, err: String(err) });
    }
  }
}
