const express = require("express");
const router = express.Router();

const { requireAuth } = require("../middleware/auth");
const { requireAdmin } = require("../middleware/admin");

const {
  getAvailableGPUsHandler,
  claimGPUHandler,
  getGPUHistoryHandler,
  getGPUStatsHandler,
  getAllReleasedGPUsHandler,
  getGPUReportHandler,
  revokeGPUHandler,
  getActiveRewardHandler,
  getActiveRewardsListHandler
} = require("../controllers/autoMiningGpuController");

/**
 * GET /api/auto-mining-gpu/available
 * Obtém GPUs disponíveis para reivindicação
 */
router.get("/available", requireAuth, getAvailableGPUsHandler);

/**
 * POST /api/auto-mining-gpu/claim
 * Reivindica uma GPU disponível
 * Body: { gpu_id: number }
 */
router.post("/claim", requireAuth, claimGPUHandler);

/**
 * GET /api/auto-mining-gpu/history
 * Obtém histórico de GPUs reivindicadas
 */
router.get("/history", requireAuth, getGPUHistoryHandler);

/**
 * GET /api/auto-mining-gpu/stats
 * Obtém estatísticas de GPUs do usuário
 */
router.get("/stats", requireAuth, getGPUStatsHandler);

/**
 * GET /api/auto-mining-gpu/active-reward
 * Obtém a recompensa ativa
 */
router.get("/active-reward", requireAuth, getActiveRewardHandler);

/**
 * POST /api/auto-mining-gpu/auto-claim
 * Reivindica automaticamente uma reward (libera e reivindica se necessário)
 */
router.post("/auto-claim", requireAuth, requireAuth, (req, res, next) => {
  // lazy require to avoid circular imports
  const { autoClaimHandler } = require("../controllers/autoMiningGpuController");
  return autoClaimHandler(req, res, next);
});

/**
 * GET /api/auto-mining-gpu/rewards
 * Lista rewards ativas disponíveis
 */
router.get("/rewards", requireAuth, getActiveRewardsListHandler);

/**
 * Rotas de administrador
 */

/**
 * GET /api/auto-mining-gpu/admin/all
 * [ADMIN] Obtém todas as GPUs liberadas
 */
router.get("/admin/all", [requireAuth, requireAdmin], getAllReleasedGPUsHandler);

/**
 * GET /api/auto-mining-gpu/admin/report
 * [ADMIN] Obtém relatório de GPUs do sistema
 */
router.get("/admin/report", [requireAuth, requireAdmin], getGPUReportHandler);

/**
 * POST /api/auto-mining-gpu/admin/revoke
 * [ADMIN] Revoga uma GPU
 * Body: { gpu_id: number, reason?: string }
 */
router.post("/admin/revoke", [requireAuth, requireAdmin], revokeGPUHandler);

module.exports = router;
