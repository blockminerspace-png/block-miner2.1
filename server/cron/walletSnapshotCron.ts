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
import { backfillHistoricalLiquidityPoolPositions, fetchMultiChainSnapshot } from "../services/multiChainWalletService.js";
import type { ChainNftHolding } from "../services/multiChainWalletService.js";
import { fetchTrackedWalletsLive } from "../services/transparencyWalletService.js";

const SNAPSHOT_INTERVAL_MS = Number(process.env.WALLET_SNAPSHOT_INTERVAL_MS) || 30 * 60 * 1000;
const STARTUP_DELAY_MS = 20_000; // 20s after start — gives DB time to connect

let _running = false;

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

  const previous = await prisma.transparencyLiquidityPoolPosition.findMany({
    where: { walletId, status: "active" },
    select: { id: true, walletId: true, chainId: true, contractAddress: true, tokenId: true },
  });

  for (const pool of previous) {
    const key = `${pool.walletId}:${pool.chainId}:${pool.contractAddress.toLowerCase()}:${pool.tokenId}`;
    if (seenKeys.has(key)) continue;
    await prisma.transparencyLiquidityPoolPosition.update({
      where: { id: pool.id },
      data: {
        status: "legacy",
        closedAt: new Date(),
      },
    });
  }
}

const BACKFILL_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // re-backfill if older than 7 days

async function backfillLegacyLiquidityPoolPositions(wallet: { id: number; address: string; liquidityPoolsBackfilledAt: Date | null }): Promise<void> {
  const age = wallet.liquidityPoolsBackfilledAt ? Date.now() - wallet.liquidityPoolsBackfilledAt.getTime() : Infinity;
  if (age < BACKFILL_MAX_AGE_MS) return;
  const legacyPools = await backfillHistoricalLiquidityPoolPositions(wallet.address);
  for (const pool of legacyPools) {
    if (pool.chainId == null) continue;
    await prisma.transparencyLiquidityPoolPosition.upsert({
      where: {
        walletId_chainId_contractAddress_tokenId: {
          walletId: wallet.id,
          chainId: pool.chainId,
          contractAddress: pool.contractAddress.toLowerCase(),
          tokenId: pool.tokenId,
        },
      },
      create: {
        walletId: wallet.id,
        chainId: pool.chainId,
        chainName: pool.chainName ?? "unknown",
        contractAddress: pool.contractAddress.toLowerCase(),
        tokenId: pool.tokenId,
        poolLabel: pool.poolLabel ?? undefined,
        name: pool.name ?? undefined,
        description: pool.description ?? undefined,
        imageUrl: pool.imageUrl ?? undefined,
        tokenUri: pool.tokenUri ?? undefined,
        explorerUrl: pool.explorerUrl,
        openseaUrl: pool.openseaUrl,
        liquidityUsd: pool.liquidityUsd ?? undefined,
        status: "legacy",
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
        closedAt: new Date(),
      },
      update: {},
    });
  }
  await prisma.transparencyTrackedWallet.update({
    where: { id: wallet.id },
    data: { liquidityPoolsBackfilledAt: new Date() },
  });
}

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
      where: { isPublic: true },
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
          const nextTotalUsd = snap.totalUsd ?? existing?.totalUsd ?? undefined;

          await prisma.transparencyWalletSnapshot.upsert({
            where:  { walletId: wallet.id },
            create: {
              walletId:  wallet.id,
              totalUsd:  nextTotalUsd,
              valuePol:  snap.valuePol ?? undefined,
              chains:    snap.chains   as object[],
              tokens:    snap.tokens   as object[],
              nfts:      snap.nfts     as object[],
              fetchedAt: snap.fetchedAt,
            },
            update: {
              totalUsd:  nextTotalUsd,
              valuePol:  snap.valuePol ?? undefined,
              chains:    snap.chains   as object[],
              tokens:    snap.tokens   as object[],
              nfts:      snap.nfts     as object[],
              fetchedAt: snap.fetchedAt,
            },
          });

          await syncLiquidityPoolPositions(wallet.id, snap.nfts);
          await backfillLegacyLiquidityPoolPositions(wallet);

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
