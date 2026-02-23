const {
  createReward,
  getActiveRewards,
  getAllRewards,
  getRewardById,
  updateReward,
  deleteReward,
  activateReward,
  deactivateReward,
  getRewardsStats
} = require("../models/autoMiningRewardsModel");

/**
 * [ADMIN] Cria uma nova reward
 */
async function createRewardHandler(req, res) {
  try {
    const { name, slug, gpu_hash_rate, image_url, description } = req.body;

    if (!name || !slug || gpu_hash_rate === undefined) {
      return res.status(400).json({
        success: false,
        error: "name, slug e gpu_hash_rate são obrigatórios"
      });
    }

    const reward = await createReward(
      name,
      slug,
      gpu_hash_rate,
      image_url || null,
      description || null
    );

    return res.status(201).json({
      success: true,
      message: "Reward criada com sucesso",
      data: reward
    });
  } catch (err) {
    console.error("Erro ao criar reward:", err);
    return res.status(400).json({
      success: false,
      error: err.message || "Erro ao criar reward"
    });
  }
}

/**
 * [ADMIN] Obtém todas as rewards (ativas e inativas)
 */
async function getAllRewardsHandler(req, res) {
  try {
    const rewards = await getAllRewards();

    return res.json({
      success: true,
      data: rewards,
      count: rewards.length
    });
  } catch (err) {
    console.error("Erro ao obter rewards:", err);
    return res.status(500).json({
      success: false,
      error: "Erro ao obter rewards"
    });
  }
}

/**
 * [ADMIN] Obtém as rewards ativas
 */
async function getActiveRewardsHandler(req, res) {
  try {
    const rewards = await getActiveRewards();

    return res.json({
      success: true,
      data: rewards,
      count: rewards.length
    });
  } catch (err) {
    console.error("Erro ao obter rewards:", err);
    return res.status(500).json({
      success: false,
      error: "Erro ao obter rewards"
    });
  }
}

/**
 * [ADMIN] Obtém uma reward por ID
 */
async function getRewardHandler(req, res) {
  try {
    const { reward_id } = req.params;

    if (!reward_id) {
      return res.status(400).json({
        success: false,
        error: "reward_id é obrigatório"
      });
    }

    const reward = await getRewardById(reward_id);

    if (!reward) {
      return res.status(404).json({
        success: false,
        error: "Reward não encontrada"
      });
    }

    return res.json({
      success: true,
      data: reward
    });
  } catch (err) {
    console.error("Erro ao obter reward:", err);
    return res.status(500).json({
      success: false,
      error: "Erro ao obter reward"
    });
  }
}

/**
 * [ADMIN] Atualiza uma reward
 */
async function updateRewardHandler(req, res) {
  try {
    const { reward_id } = req.params;
    const updates = req.body;

    if (!reward_id) {
      return res.status(400).json({
        success: false,
        error: "reward_id é obrigatório"
      });
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: "Nenhum campo para atualizar"
      });
    }

    const reward = await updateReward(reward_id, updates);

    return res.json({
      success: true,
      message: "Reward atualizada com sucesso",
      data: reward
    });
  } catch (err) {
    console.error("Erro ao atualizar reward:", err);
    return res.status(400).json({
      success: false,
      error: err.message || "Erro ao atualizar reward"
    });
  }
}

/**
 * [ADMIN] Ativa uma reward
 */
async function activateRewardHandler(req, res) {
  try {
    const { reward_id } = req.params;

    if (!reward_id) {
      return res.status(400).json({
        success: false,
        error: "reward_id é obrigatório"
      });
    }

    const reward = await activateReward(reward_id);

    return res.json({
      success: true,
      message: "Reward ativada com sucesso",
      data: reward
    });
  } catch (err) {
    console.error("Erro ao ativar reward:", err);
    return res.status(400).json({
      success: false,
      error: err.message || "Erro ao ativar reward"
    });
  }
}

/**
 * [ADMIN] Desativa uma reward
 */
async function deactivateRewardHandler(req, res) {
  try {
    const { reward_id } = req.params;

    if (!reward_id) {
      return res.status(400).json({
        success: false,
        error: "reward_id é obrigatório"
      });
    }

    const reward = await deactivateReward(reward_id);

    return res.json({
      success: true,
      message: "Reward desativada com sucesso",
      data: reward
    });
  } catch (err) {
    console.error("Erro ao desativar reward:", err);
    return res.status(400).json({
      success: false,
      error: err.message || "Erro ao desativar reward"
    });
  }
}

/**
 * [ADMIN] Deleta uma reward
 */
async function deleteRewardHandler(req, res) {
  try {
    const { reward_id } = req.params;

    if (!reward_id) {
      return res.status(400).json({
        success: false,
        error: "reward_id é obrigatório"
      });
    }

    await deleteReward(reward_id);

    return res.json({
      success: true,
      message: "Reward deletada com sucesso"
    });
  } catch (err) {
    console.error("Erro ao deletar reward:", err);
    return res.status(400).json({
      success: false,
      error: err.message || "Erro ao deletar reward"
    });
  }
}

/**
 * [ADMIN] Obtém estatísticas de rewards
 */
async function getRewardsStatsHandler(req, res) {
  try {
    const stats = await getRewardsStats();

    return res.json({
      success: true,
      data: stats
    });
  } catch (err) {
    console.error("Erro ao obter estatísticas:", err);
    return res.status(500).json({
      success: false,
      error: "Erro ao obter estatísticas"
    });
  }
}

module.exports = {
  createRewardHandler,
  getAllRewardsHandler,
  getActiveRewardsHandler,
  getRewardHandler,
  updateRewardHandler,
  activateRewardHandler,
  deactivateRewardHandler,
  deleteRewardHandler,
  getRewardsStatsHandler
};
