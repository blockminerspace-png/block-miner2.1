import express from "express";
import prisma from "../src/db/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { buildRankingRows, rankingUserSelect } from "../services/networkHashrateService.js";
import { isAutoMiningV2SchemaAvailable } from "../services/autoMiningV2/autoMiningV2DbAvailability.js";

export const rankingRouter = express.Router();

rankingRouter.get("/", requireAuth, async (req, res) => {
  try {
    const now = new Date();
    const v2Ok = await isAutoMiningV2SchemaAvailable();

    const users = await prisma.user.findMany({
      where: { isBanned: false },
      select: rankingUserSelect(now, { includeAutoMiningV2: v2Ok })
    });

    const sortedRanking = buildRankingRows(users)
      .slice(0, 50)
      .map((entry, index) => ({
        ...entry,
        rank: index + 1
      }));

    res.json({ ok: true, ranking: sortedRanking });
  } catch (error) {
    console.error("Ranking aggregation error:", error);
    res.status(500).json({ ok: false, message: "Unable to load ranking." });
  }
});

rankingRouter.get("/room/:username", requireAuth, async (req, res) => {
  try {
    const { username } = req.params;
    const now = new Date();
    const ROOM_MAX = parseInt(process.env.ROOM_MAX || "4", 10);
    
    const targetUser = await prisma.user.findFirst({
      where: { username },
      select: {
        id: true,
        username: true,
        miners: {
          where: { isActive: true },
          select: {
            id: true,
            hashRate: true,
            slotIndex: true,
            imageUrl: true,
            level: true,
            slotSize: true,
            miner: {
              select: {
                name: true
              }
            }
          }
        },
        gamePowers: {
          where: { expiresAt: { gt: now } },
          select: { hashRate: true }
        },
        ytPowers: {
          where: { expiresAt: { gt: now } },
          select: { hashRate: true }
        },
        gpuAccess: {
          where: { isClaimed: true, expiresAt: { gt: now } },
          select: { gpuHashRate: true }
        },
        rackConfigs: {
          select: {
            rackIndex: true,
            customName: true
          }
        },
        userRooms: {
          select: { roomNumber: true }
        }
      }
    });

    if (!targetUser) {
      return res.status(404).json({ ok: false, message: "User not found" });
    }

    // Map miners to include the name from the relationship and keep camelCase for frontend utils
    const mappedMiners = targetUser.miners.map(m => ({
      id: m.id,
      hashRate: m.hashRate,
      slotIndex: m.slotIndex,
      imageUrl: m.imageUrl,
      level: m.level,
      slotSize: m.slotSize,
      minerName: m.miner?.name || "Miner"
    }));

    const gamePower =
      targetUser.gamePowers.reduce((sum, p) => sum + (p.hashRate || 0), 0) +
      targetUser.ytPowers.reduce((sum, p) => sum + (p.hashRate || 0), 0) +
      (targetUser.gpuAccess || []).reduce((sum, p) => sum + (p.gpuHashRate || 0), 0);

    const racks = {};
    targetUser.rackConfigs.forEach(config => {
      racks[config.rackIndex] = config.customName;
    });

    const unlockedRooms = new Set(targetUser.userRooms.map(r => r.roomNumber));
    const roomList = Array.from({ length: ROOM_MAX }, (_, i) => ({
      roomNumber: i + 1,
      unlocked: unlockedRooms.has(i + 1),
    }));

    res.json({ 
      ok: true, 
      user: { 
        ...targetUser, 
        miners: mappedMiners, 
        racks,
        gamePower,
        rooms: roomList,
        roomMax: ROOM_MAX,
      } 
    });
  } catch (error) {
    console.error("Error fetching room data:", error);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});
