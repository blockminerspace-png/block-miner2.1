const {
  getAvailableGPUs,
  claimGPU,
  getUserGPUHistory,
  getUserGPUStats,
  getAllReleasedGPUs,
  getGPUReport,
  revokeGPU,
  releaseNewGPU
} = require("../models/autoMiningGpuModel");
const { getRandomActiveReward, getActiveRewards } = require("../models/autoMiningRewardsModel");

/**
 * Obtém GPUs disponíveis do usuário autenticado
 */
async function getAvailableGPUsHandler(req, res) {
  try {
    const userId = req.user.id;

    const gpus = await getAvailableGPUs(userId);

    return res.json({
      success: true,
      data: gpus,
      count: gpus.length
    });
  } catch (err) {
    console.error("Failed to get available GPUs:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to get available GPUs"
    });
  }
}

/**
 * Reivindica uma GPU disponível
 */
async function claimGPUHandler(req, res) {
  try {
    const userId = req.user.id;
    const { gpu_id } = req.body;

    if (!gpu_id) {
      return res.status(400).json({
        success: false,
        error: "GPU ID is required"
      });
    }

    const claimed = await claimGPU(gpu_id, userId);

    return res.json({
      success: true,
      message: "GPU claimed successfully",
      data: claimed
    });
  } catch (err) {
    console.error("Failed to claim GPU:", err);
    return res.status(400).json({
      success: false,
      error: err.message || "Failed to claim GPU"
    });
  }
}

/**
 * Obtém histórico de GPUs do usuário
 */
async function getGPUHistoryHandler(req, res) {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const history = await getUserGPUHistory(userId, limit, offset);

    return res.json({
      success: true,
      data: history,
      pagination: {
        limit,
        offset,
        count: history.length
      }
    });
  } catch (err) {
    console.error("Failed to get GPU history:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to get GPU history"
    });
  }
}

/**
 * Obtém estatísticas de GPUs do usuário
 */
async function getGPUStatsHandler(req, res) {
  try {
    const userId = req.user.id;

    const stats = await getUserGPUStats(userId);

    return res.json({
      success: true,
      data: stats
    });
  } catch (err) {
    console.error("Failed to get GPU stats:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to get GPU stats"
    });
  }
}

/**
 * [ADMIN] Obtém todas as GPUs liberadas no sistema
 */
async function getAllReleasedGPUsHandler(req, res) {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;

    const gpus = await getAllReleasedGPUs(limit, offset);

    return res.json({
      success: true,
      data: gpus,
      pagination: {
        limit,
        offset,
        count: gpus.length
      }
    });
  } catch (err) {
    console.error("Failed to get all GPUs:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to get all GPUs"
    });
  }
}

/**
 * [ADMIN] Obtém relatório de GPUs do sistema
 */
async function getGPUReportHandler(req, res) {
  try {
    const report = await getGPUReport();

    return res.json({
      success: true,
      data: report
    });
  } catch (err) {
    console.error("Failed to generate GPU report:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to generate GPU report"
    });
  }
}

/**
 * [ADMIN] Revoga uma GPU
 */
async function revokeGPUHandler(req, res) {
  try {
    const { gpu_id } = req.body;
    const { reason } = req.body;

    if (!gpu_id) {
      return res.status(400).json({
        success: false,
        error: "GPU ID is required"
      });
    }

    await revokeGPU(gpu_id, reason);

    return res.json({
      success: true,
      message: "GPU revoked successfully"
    });
  } catch (err) {
    console.error("Failed to revoke GPU:", err);
    return res.status(400).json({
      success: false,
      error: err.message || "Failed to revoke GPU"
    });
  }
}

/**
 * POST /api/auto-mining-gpu/auto-claim
 * Tenta reivindicar uma GPU disponível ou libera uma nova reward e reivindica imediatamente
 */
async function autoClaimHandler(req, res) {
  try {
    const userId = req.user.id;

    // Tentar reivindicar GPU disponível primeiro
    const available = await getAvailableGPUs(userId);
    if (available && available.length > 0) {
      const claimed = await claimGPU(available[0].id, userId);
      return res.json({ success: true, data: claimed, message: "GPU claimed" });
    }

    // Se não há disponível, libera uma nova reward aleatória e reivindica
    const reward = await getRandomActiveReward();
    if (!reward) {
      return res.status(400).json({ success: false, error: "No active reward available" });
    }

    const released = await releaseNewGPU(userId, reward.id, reward.gpu_hash_rate || 1, 0);
    const claimed = await claimGPU(released.id, userId);

    return res.json({ success: true, data: claimed, message: "GPU released and claimed" });
  } catch (err) {
    console.error("Auto-claim failed:", err);
    return res.status(500).json({ success: false, error: "Auto-claim failed" });
  }
}

/**
 * Obtém a recompensa ativa
 */
async function getActiveRewardHandler(req, res) {
  try {
    const reward = await getRandomActiveReward();

    if (!reward) {
      return res.json({
        success: false,
        data: null,
        error: "No active reward available"
      });
    }

    return res.json({
      success: true,
      data: reward
    });
  } catch (err) {
    console.error("Failed to get active reward:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to get active reward"
    });
  }
}

/**
 * Obtém todas as rewards ativas (lista)
 */
async function getActiveRewardsListHandler(req, res) {
  try {
    const rewards = await getActiveRewards();

    return res.json({
      success: true,
      data: rewards
    });
  } catch (err) {
    console.error("Failed to get rewards list:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to get rewards"
    });
  }
}

module.exports = {
  getAvailableGPUsHandler,
  claimGPUHandler,
  getGPUHistoryHandler,
  getGPUStatsHandler,
  getAllReleasedGPUsHandler,
  getGPUReportHandler,
  revokeGPUHandler,
  getActiveRewardHandler,
  getActiveRewardsListHandler,
  autoClaimHandler
};

