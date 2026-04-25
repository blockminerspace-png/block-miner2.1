import prisma from "../src/db/prisma.js";

function parseUserIdParam(req) {
  const userId = parseInt(req.params.id, 10);
  if (!userId || Number.isNaN(userId)) return null;
  return userId;
}

function parseLedgerPagination(req) {
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 50));
  const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
  const skip = (page - 1) * limit;
  return { limit, page, skip };
}

/**
 * Balances + paginated on-chain style movements (transactions + CCPayment deposit events).
 */
export async function getUserWalletLedger(req, res) {
  try {
    const userId = parseUserIdParam(req);
    if (!userId) return res.status(400).json({ ok: false, message: "Invalid user id" });

    const { limit, page, skip } = parseLedgerPagination(req);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        polBalance: true,
        btcBalance: true,
        ethBalance: true,
        usdtBalance: true,
        usdcBalance: true,
        zerBalance: true,
        blkBalance: true,
        blkLocked: true,
        totalWithdrawn: true,
        walletAddress: true
      }
    });

    if (!user) return res.status(404).json({ ok: false, message: "User not found" });

    const [transactions, txTotal, deposits, depTotal] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          type: true,
          amount: true,
          fee: true,
          status: true,
          txHash: true,
          address: true,
          createdAt: true,
          completedAt: true
        }
      }),
      prisma.transaction.count({ where: { userId } }),
      prisma.ccpaymentDepositEvent.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          recordId: true,
          amountPol: true,
          payStatus: true,
          credited: true,
          txHash: true,
          createdAt: true
        }
      }),
      prisma.ccpaymentDepositEvent.count({ where: { userId } })
    ]);

    const toNum = (d) => (d == null ? null : Number(d));

    res.json({
      ok: true,
      userId,
      balances: {
        pol: toNum(user.polBalance),
        btc: toNum(user.btcBalance),
        eth: toNum(user.ethBalance),
        usdt: toNum(user.usdtBalance),
        usdc: toNum(user.usdcBalance),
        zer: toNum(user.zerBalance),
        blk: toNum(user.blkBalance),
        blkLocked: toNum(user.blkLocked),
        totalWithdrawn: toNum(user.totalWithdrawn)
      },
      walletAddress: user.walletAddress,
      transactions: {
        rows: transactions.map((t) => ({
          ...t,
          amount: toNum(t.amount),
          fee: t.fee != null ? toNum(t.fee) : null
        })),
        page,
        limit,
        total: txTotal
      },
      ccpaymentDeposits: {
        rows: deposits.map((d) => ({
          ...d,
          amountPol: d.amountPol != null ? toNum(d.amountPol) : null
        })),
        page,
        limit,
        total: depTotal
      }
    });
  } catch (err) {
    console.error("[adminUserInsights] wallet ledger", err?.message || err);
    res.status(500).json({ ok: false, message: "Error loading wallet ledger" });
  }
}

/**
 * Recent activity slices derived from existing domain tables (read-only aggregates).
 */
export async function getUserActivitySummary(req, res) {
  try {
    const userId = parseUserIdParam(req);
    if (!userId) return res.status(400).json({ ok: false, message: "Invalid user id" });

    const take = 25;

    const [
      user,
      faucetClaim,
      shortlinkCompletion,
      ytHistory,
      ytPowers,
      faucetVisits,
      userMiners,
      inventory,
      racks,
      autoMiningGrants,
      bannerClicks
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          ytSecondsBalance: true,
          autoMiningSecondsBalance: true,
          lastHeartbeatAt: true
        }
      }),
      prisma.faucetClaim.findUnique({ where: { userId } }),
      prisma.shortlinkCompletion.findUnique({
        where: { userId },
        select: {
          dailyRuns: true,
          currentStep: true,
          completedAt: true,
          resetAt: true,
          shortlinkType: true
        }
      }),
      prisma.youtubeWatchHistory.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take,
        select: {
          id: true,
          hashRate: true,
          claimedAt: true,
          sourceVideoId: true,
          status: true,
          createdAt: true
        }
      }),
      prisma.youtubeWatchPower.findMany({
        where: { userId },
        orderBy: { claimedAt: "desc" },
        take,
        select: { id: true, hashRate: true, claimedAt: true, expiresAt: true, sourceVideoId: true }
      }),
      prisma.faucetPartnerVisit.findMany({
        where: { userId },
        orderBy: { openedAt: "desc" },
        take,
        select: { id: true, dayKey: true, openedAt: true, eligibleAt: true }
      }),
      prisma.userMiner.findMany({
        where: { userId },
        orderBy: { purchasedAt: "desc" },
        select: {
          id: true,
          slotIndex: true,
          level: true,
          hashRate: true,
          imageUrl: true,
          isActive: true,
          purchasedAt: true,
          miner: { select: { name: true, slug: true, imageUrl: true } }
        }
      }),
      prisma.userInventory.findMany({
        where: { userId },
        orderBy: { acquiredAt: "desc" },
        take: 50,
        select: {
          id: true,
          minerName: true,
          level: true,
          hashRate: true,
          imageUrl: true,
          acquiredAt: true,
          expiresAt: true
        }
      }),
      prisma.userRack.findMany({
        where: { userId },
        orderBy: { id: "asc" },
        select: {
          id: true,
          position: true,
          installedAt: true,
          room: { select: { roomNumber: true } },
          userMiner: {
            select: {
              id: true,
              slotIndex: true,
              imageUrl: true,
              miner: { select: { name: true, imageUrl: true } }
            }
          }
        }
      }),
      prisma.autoMiningV2PowerGrant.findMany({
        where: { userId },
        orderBy: { earnedAt: "desc" },
        take,
        select: { id: true, hashRate: true, mode: true, earnedAt: true, expiresAt: true }
      }),
      prisma.autoMiningV2BannerImpression.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take,
        select: { id: true, bannerKey: true, clickedAt: true, createdAt: true }
      })
    ]);

    if (!user) return res.status(404).json({ ok: false, message: "User not found" });

    res.json({
      ok: true,
      userId,
      session: {
        ytSecondsBalance: user.ytSecondsBalance,
        autoMiningSecondsBalance: user.autoMiningSecondsBalance,
        lastHeartbeatAt: user.lastHeartbeatAt
      },
      faucet: faucetClaim
        ? {
            totalClaims: faucetClaim.totalClaims,
            claimedAt: faucetClaim.claimedAt,
            dayKey: faucetClaim.dayKey
          }
        : null,
      shortlink: shortlinkCompletion,
      youtube: {
        history: ytHistory,
        activePowers: ytPowers
      },
      faucetPartnerVisits: faucetVisits,
      machines: userMiners,
      inventory,
      racks,
      autoMiningV2: {
        grants: autoMiningGrants,
        bannerImpressions: bannerClicks
      }
    });
  } catch (err) {
    console.error("[adminUserInsights] activity summary", err?.message || err);
    res.status(500).json({ ok: false, message: "Error loading activity summary" });
  }
}
