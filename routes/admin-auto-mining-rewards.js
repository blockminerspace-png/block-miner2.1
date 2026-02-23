const express = require("express");
const router = express.Router();

const { requireAuth } = require("../middleware/auth");
const { requireAdmin } = require("../middleware/admin");

const {
  createRewardHandler,
  getAllRewardsHandler,
  getActiveRewardsHandler,
  getRewardHandler,
  updateRewardHandler,
  activateRewardHandler,
  deactivateRewardHandler,
  deleteRewardHandler,
  getRewardsStatsHandler
} = require("../controllers/autoMiningRewardsController");

/**
 * [ADMIN] Rotas de configuração de Rewards (GPUs)
 */

/**
 * POST /api/admin/auto-mining-rewards
 * [ADMIN] Cria uma nova reward
 * Body: { name, slug, gpu_hash_rate, image_url?, description? }
 */
router.post("/", [requireAuth, requireAdmin], createRewardHandler);

/**
 * GET /api/admin/auto-mining-rewards
 * [ADMIN] Lista todas as rewards (ativas e inativas)
 */
router.get("/", [requireAuth, requireAdmin], getAllRewardsHandler);

/**
 * GET /api/admin/auto-mining-rewards/active
 * [ADMIN] Lista apenas rewards ativas
 */
router.get("/active", [requireAuth, requireAdmin], getActiveRewardsHandler);

/**
 * GET /api/admin/auto-mining-rewards/stats
 * [ADMIN] Obtém estatísticas
 */
router.get("/stats", [requireAuth, requireAdmin], getRewardsStatsHandler);

/**
 * GET /api/admin/auto-mining-rewards/:reward_id
 * [ADMIN] Obtém uma reward específica
 */
router.get("/:reward_id", [requireAuth, requireAdmin], getRewardHandler);

/**
 * PATCH /api/admin/auto-mining-rewards/:reward_id
 * [ADMIN] Atualiza uma reward
 * Body: { name?, slug?, gpu_hash_rate?, image_url?, description?, is_active? }
 */
router.patch("/:reward_id", [requireAuth, requireAdmin], updateRewardHandler);

/**
 * POST /api/admin/auto-mining-rewards/:reward_id/activate
 * [ADMIN] Ativa uma reward
 */
router.post("/:reward_id/activate", [requireAuth, requireAdmin], activateRewardHandler);

/**
 * POST /api/admin/auto-mining-rewards/:reward_id/deactivate
 * [ADMIN] Desativa uma reward
 */
router.post("/:reward_id/deactivate", [requireAuth, requireAdmin], deactivateRewardHandler);

/**
 * DELETE /api/admin/auto-mining-rewards/:reward_id
 * [ADMIN] Deleta uma reward
 */
router.delete("/:reward_id", [requireAuth, requireAdmin], deleteRewardHandler);

module.exports = router;
