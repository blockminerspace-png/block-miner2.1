/**
 * Wallet Snapshot Cron
 *
 * Runs every 30 minutes (default). For each public tracked wallet:
 *   - current_balance → full multi-chain snapshot (all EVM chains)
 *   - total_received / total_sent → Polygon-only (existing service)
 *
 * Results are stored in TransparencyWalletSnapshot (one row per wallet,
 * upserted). The transparency controller serves data directly from DB,
 * making the page load instant for end users.
 */
import prisma from "../src/db/prisma.js";
import { fetchMultiChainSnapshot } from "../services/multiChainWalletService.js";
import type { ChainNftHolding } from "../services/multiChainWalletService.js";
import { fetchTrackedWalletsLive } from "../services/transparencyWalletService.js";

const SNAPSHOT_INTERVAL_MS = Number(process.env.WALLET_SNAPSHOT_INTERVAL_MS) || 10 * 60 * 1000;
const STARTUP_DELAY_MS = 20_000; // 20s after start — gives DB time to connect

let _running = false;

/**
 * Sync active LP positions for a wallet.
 * - Upserts every position currently detected on-chain.
 * - Deletes any DB row that is no longer present on-chain (position removed/burned).
 * No "legacy" status — positions either exist or are gone.
 */
async function syncLiquidityPoolPositions(walletId: number, nfts: ChainNftHolding[]): Promise<void> {
  const activePools = nfts.filter((nft) =>
    nft.isLiquidityPosition &&
    nft.chainId != null &&
    nft.chainName &&
    nft.contractAddress &&
    nft.tokenId,
  );

  const seenKeys = new Set(
    activePools.map((nft) => `${walletId}:${nft.chainId}:${nft.contractAddress.toLowerCase()}:${nft.tokenId}`),
  );

  for (const nft of activePools) {
    await prisma.transparencyLiquidityPoolPosition.upsert({
      where: {
        walletId_chainId_contractAddress_tokenId: {
          walletId,
          chainId: nft.chainId!,
          contractAddress: nft.contractAddress.toLowerCase(),
          tokenId: nft.tokenId,
        },
      },
      create: {
        walletId,
        chainId: nft.chainId!,
        chainName: nft.chainName!,
        contractAddress: nft.contractAddress.toLowerCase(),
        tokenId: nft.tokenId,
        poolLabel: nft.poolLabel ?? undefined,
        name: nft.name ?? undefined,
        description: nft.description ?? undefined,
        imageUrl: nft.imageUrl ?? undefined,
        tokenUri: nft.tokenUri ?? undefined,
        explorerUrl: nft.explorerUrl,
        openseaUrl: nft.openseaUrl,
        liquidityUsd: nft.liquidityUsd ?? undefined,
        status: "active",
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
        closedAt: null,
      },
      update: {
        chainName: nft.chainName!,
        poolLabel: nft.poolLabel ?? undefined,
        name: nft.name ?? undefined,
        description: nft.description ?? undefined,
        imageUrl: nft.imageUrl ?? undefined,
        tokenUri: nft.tokenUri ?? undefined,
        explorerUrl: nft.explorerUrl,
        openseaUrl: nft.openseaUrl,
        liquidityUsd: nft.liquidityUsd ?? undefined,
        status: "active",
        lastSeenAt: new Date(),
        closedAt: null,
      },
    });
  }

  // Delete rows no longer detected on-chain (position was removed or burned)
  const stored = await prisma.transparencyLiquidityPoolPosition.findMany({
    where: { walletId },
    select: { id: true, walletId: true, chainId: true, contractAddress: true, tokenId: true },
  });

  const toDelete = stored
    .filter((p) => !seenKeys.has(`${p.walletId}:${p.chainId}:${p.contractAddress.toLowerCase()}:${p.tokenId}`))
    .map((p) => p.id);

  if (toDelete.length > 0) {
    await prisma.transparencyLiquidityPoolPosition.deleteMany({ where: { id: { in: toDelete } } });
    console.log(`[wallet-snapshot] removed ${toDelete.length} closed LP position(s) for wallet ${walletId}`);
  }
}

// Legacy backfill removed: only active pools are tracked.
// Positions appear when the cron detects them on-chain and disappear when removed.

async function runSnapshot(): Promise<void> {
  if (_running) {
    console.log("[wallet-snapshot] already running — skipped");
    return;
  }
  _running = true;
  console.log("[wallet-snapshot] starting multi-chain snapshot run");
  const started = Date.now();

  try {
    const wallets = await prisma.transparencyTrackedWallet.findMany({
      // Skip wallets with a manual USD override — no need to hit DeBank.
      where: { isPublic: true, manualUsdValue: null },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });

    if (!wallets.length) {
      console.log("[wallet-snapshot] no public wallets configured");
      return;
    }

    for (const wallet of wallets) {
      try {
        const existing = await prisma.transparencyWalletSnapshot.findUnique({
          where: { walletId: wallet.id },
        });

        if (wallet.displayMode === "current_balance") {
          // Full multi-chain snapshot
          console.log(`[wallet-snapshot] multi-chain fetch for ${wallet.address}`);
          const snap = await fetchMultiChainSnapshot(wallet.address);
          const hasFreshUsd =
            snap.totalUsd != null ||
            snap.chains.some((c) => c.totalChainUsd != null) ||
            snap.tokens.some((t) => t.usdValue != null) ||
            snap.nfts.some((n) => n.isLiquidityPosition && n.liquidityUsd != null);
          const nextTotalUsd = hasFreshUsd
            ? snap.totalUsd ?? existing?.totalUsd ?? undefined
            : existing?.totalUsd ?? undefined;
          const nextChains = snap.chains.length > 0 ? snap.chains : ((existing?.chains as object[]) ?? []);
          const nextTokens = snap.tokens.length > 0 ? snap.tokens : ((existing?.tokens as object[]) ?? []);
          const nextNfts = snap.nfts.length > 0 ? snap.nfts : ((existing?.nfts as object[]) ?? []);
          const nextFetchedAt = hasFreshUsd ? snap.fetchedAt : (existing?.fetchedAt ?? snap.fetchedAt);

          await prisma.transparencyWalletSnapshot.upsert({
            where:  { walletId: wallet.id },
            create: {
              walletId:  wallet.id,
              totalUsd:  nextTotalUsd,
              valuePol:  snap.valuePol ?? undefined,
              chains:    nextChains as object[],
              tokens:    nextTokens as object[],
              nfts:      nextNfts as object[],
              fetchedAt: nextFetchedAt,
            },
            update: {
              totalUsd:  nextTotalUsd,
              valuePol:  snap.valuePol ?? undefined,
              chains:    nextChains as object[],
              tokens:    nextTokens as object[],
              nfts:      nextNfts as object[],
              fetchedAt: nextFetchedAt,
            },
          });

          await syncLiquidityPoolPositions(wallet.id, snap.nfts);

          console.log(`[wallet-snapshot] ${wallet.address} done — totalUsd=${snap.totalUsd?.toFixed(2)}, chains=${snap.chains.map(c => c.name).join(",")}`);
        } else {
          // Polygon-only (total_received / total_sent)
          const data = await fetchTrackedWalletsLive([wallet]);
          const entry = data.wallets[0];
          if (!entry) continue;
          const nextTotalUsd =
            entry.isPartialUsd
              ? existing?.totalUsd ?? undefined
              : entry.valueUsd ?? existing?.totalUsd ?? undefined;

          await prisma.transparencyWalletSnapshot.upsert({
            where:  { walletId: wallet.id },
            create: {
              walletId:  wallet.id,
              totalUsd:  nextTotalUsd,
              valuePol:  entry.valuePol  ?? undefined,
              chains:    [],
              tokens:    (entry.tokens ?? []) as object[],
              nfts:      (entry.nfts   ?? []) as object[],
              fetchedAt: new Date(),
            },
            update: {
              totalUsd:  nextTotalUsd,
              valuePol:  entry.valuePol  ?? undefined,
              chains:    [],
              tokens:    (entry.tokens ?? []) as object[],
              nfts:      (entry.nfts   ?? []) as object[],
              fetchedAt: new Date(),
            },
          });

          console.log(
            `[wallet-snapshot] ${wallet.address} (${wallet.displayMode}) done — usd=${nextTotalUsd?.toFixed?.(2) ?? "preserved"}${entry.isPartialUsd ? " partial-usd" : ""}`,
          );
        }
      } catch (err) {
        console.error(`[wallet-snapshot] wallet ${wallet.address} failed:`, (err as Error)?.message);
      }
    }
  } finally {
    _running = false;
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`[wallet-snapshot] run complete in ${elapsed}s`);
  }
}

export function startWalletSnapshotCron(): Record<string, unknown> {
  const startupTimer = setTimeout(() => {
    void runSnapshot();
  }, STARTUP_DELAY_MS);

  const intervalTimer = setInterval(() => {
    void runSnapshot();
  }, SNAPSHOT_INTERVAL_MS);

  console.log(`[wallet-snapshot] cron scheduled — interval ${SNAPSHOT_INTERVAL_MS / 60000}min, startup delay ${STARTUP_DELAY_MS / 1000}s`);

  return { walletSnapshotStartup: startupTimer, walletSnapshotInterval: intervalTimer };
}

export { runSnapshot as runWalletSnapshotNow };
