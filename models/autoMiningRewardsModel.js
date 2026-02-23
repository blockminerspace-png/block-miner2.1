const { get, run, all } = require("./db");

/**
 * Cria uma nova reward (GPU configurada)
 */
async function createReward(name, slug, gpuHashRate, imageUrl, description) {
  const now = Date.now();

  try {
    const existing = await get(
      `SELECT id FROM auto_mining_rewards WHERE slug = ?`,
      [slug]
    );

    if (existing) {
      throw new Error("Reward com este slug já existe");
    }

    const result = await run(
      `
      INSERT INTO auto_mining_rewards (
        name,
        slug,
        gpu_hash_rate,
        image_url,
        description,
        is_active,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [name, slug, gpuHashRate, imageUrl, description, 1, now, now]
    );

    return {
      id: result.lastID,
      name,
      slug,
      gpu_hash_rate: gpuHashRate,
      image_url: imageUrl,
      description,
      is_active: 1,
      created_at: now,
      updated_at: now
    };
  } catch (err) {
    console.error("Erro ao criar reward:", err);
    throw err;
  }
}

/**
 * Obtém todas as rewards ativas
 */
async function getActiveRewards() {
  try {
    const rewards = await all(
      `
      SELECT *
      FROM auto_mining_rewards
      WHERE is_active = 1
      ORDER BY created_at DESC
      `
    );

    return rewards || [];
  } catch (err) {
    console.error("Erro ao obter rewards:", err);
    throw err;
  }
}

/**
 * Obtém todas as rewards (incluindo inativas)
 */
async function getAllRewards() {
  try {
    const rewards = await all(
      `
      SELECT *
      FROM auto_mining_rewards
      ORDER BY created_at DESC
      `
    );

    return rewards || [];
  } catch (err) {
    console.error("Erro ao obter rewards:", err);
    throw err;
  }
}

/**
 * Obtém uma reward por ID
 */
async function getRewardById(rewardId) {
  try {
    const reward = await get(
      `
      SELECT *
      FROM auto_mining_rewards
      WHERE id = ?
      `,
      [rewardId]
    );

    return reward || null;
  } catch (err) {
    console.error("Erro ao obter reward:", err);
    throw err;
  }
}

/**
 * Atualiza uma reward
 */
async function updateReward(rewardId, updates) {
  const now = Date.now();

  try {
    const reward = await getRewardById(rewardId);
    if (!reward) {
      throw new Error("Reward não encontrada");
    }

    // Validar slug único se está sendo alterado
    if (updates.slug && updates.slug !== reward.slug) {
      const existing = await get(
        `SELECT id FROM auto_mining_rewards WHERE slug = ? AND id != ?`,
        [updates.slug, rewardId]
      );

      if (existing) {
        throw new Error("Reward com este slug já existe");
      }
    }

    const updateFields = [];
    const updateValues = [];

    if (updates.name !== undefined) {
      updateFields.push("name = ?");
      updateValues.push(updates.name);
    }

    if (updates.slug !== undefined) {
      updateFields.push("slug = ?");
      updateValues.push(updates.slug);
    }

    if (updates.gpu_hash_rate !== undefined) {
      updateFields.push("gpu_hash_rate = ?");
      updateValues.push(updates.gpu_hash_rate);
    }

    if (updates.image_url !== undefined) {
      updateFields.push("image_url = ?");
      updateValues.push(updates.image_url);
    }

    if (updates.description !== undefined) {
      updateFields.push("description = ?");
      updateValues.push(updates.description);
    }

    if (updates.is_active !== undefined) {
      updateFields.push("is_active = ?");
      updateValues.push(updates.is_active);
    }

    if (updateFields.length === 0) {
      return reward;
    }

    updateFields.push("updated_at = ?");
    updateValues.push(now);
    updateValues.push(rewardId);

    await run(
      `
      UPDATE auto_mining_rewards
      SET ${updateFields.join(", ")}
      WHERE id = ?
      `,
      updateValues
    );

    return {
      ...reward,
      ...updates,
      updated_at: now
    };
  } catch (err) {
    console.error("Erro ao atualizar reward:", err);
    throw err;
  }
}

/**
 * Ativa uma reward
 */
async function activateReward(rewardId) {
  return updateReward(rewardId, { is_active: 1 });
}

/**
 * Desativa uma reward
 */
async function deactivateReward(rewardId) {
  return updateReward(rewardId, { is_active: 0 });
}

/**
 * Deleta uma reward
 */
async function deleteReward(rewardId) {
  try {
    const reward = await getRewardById(rewardId);
    if (!reward) {
      throw new Error("Reward não encontrada");
    }

    // Verifica se há GPUs associadas
    const gpuCount = await get(
      `SELECT COUNT(*) as count FROM auto_mining_gpu WHERE reward_id = ?`,
      [rewardId]
    );

    if (gpuCount.count > 0) {
      throw new Error("Não é possível deletar reward com GPUs associadas");
    }

    await run(
      `DELETE FROM auto_mining_rewards WHERE id = ?`,
      [rewardId]
    );

    return true;
  } catch (err) {
    console.error("Erro ao deletar reward:", err);
    throw err;
  }
}

/**
 * Obtém uma reward aleatória ativa
 */
async function getRandomActiveReward() {
  try {
    const rewards = await getActiveRewards();

    if (rewards.length === 0) {
      return null;
    }

    const randomIndex = Math.floor(Math.random() * rewards.length);
    return rewards[randomIndex];
  } catch (err) {
    console.error("Erro ao obter reward aleatória:", err);
    throw err;
  }
}

/**
 * Obtém estatísticas de rewards
 */
async function getRewardsStats() {
  try {
    const totalResult = await get(
      `SELECT COUNT(*) as count FROM auto_mining_rewards`
    );

    const activeResult = await get(
      `SELECT COUNT(*) as count FROM auto_mining_rewards WHERE is_active = 1`
    );

    const gpuInsResult = await get(
      `SELECT COUNT(*) as count FROM auto_mining_gpu`
    );

    const claimedResult = await get(
      `SELECT COUNT(*) as count FROM auto_mining_gpu WHERE is_claimed = 1`
    );

    return {
      total_rewards: totalResult.count || 0,
      active_rewards: activeResult.count || 0,
      total_gpu_instances: gpuInsResult.count || 0,
      total_claimed: claimedResult.count || 0
    };
  } catch (err) {
    console.error("Erro ao obter estatísticas:", err);
    throw err;
  }
}

module.exports = {
  createReward,
  getActiveRewards,
  getAllRewards,
  getRewardById,
  updateReward,
  activateReward,
  deactivateReward,
  deleteReward,
  getRandomActiveReward,
  getRewardsStats
};
