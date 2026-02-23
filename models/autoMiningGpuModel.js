const { get, run, all } = require("./db");
const inventoryModel = require("./inventoryModel");

const AUTO_MINING_IMAGE_DEFAULT = "/assets/machines/reward2.png";

function normalizeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function resolveAutoRewardMiner(gpu) {
  const normalizedRewardSlug = normalizeSlug(gpu.reward_slug) || `reward-${gpu.reward_id || gpu.id}`;
  const minerSlug = `auto-${normalizedRewardSlug}`;
  const minerName = String(gpu.reward_name || "Auto Mining GPU").trim();
  const minerHashRate = Number(gpu.reward_g_hash_rate || gpu.gpu_hash_rate || 1);
  const minerImageUrl = gpu.reward_image || AUTO_MINING_IMAGE_DEFAULT;

  const existing = await get(
    "SELECT id, name, slug, base_hash_rate, slot_size, image_url, is_active FROM miners WHERE slug = ?",
    [minerSlug]
  );

  const now = Date.now();
  if (!existing) {
    const result = await run(
      "INSERT INTO miners (name, slug, base_hash_rate, price, slot_size, image_url, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [minerName, minerSlug, minerHashRate, 0, 1, minerImageUrl, 1, now]
    );

    return {
      id: result.lastID,
      name: minerName,
      base_hash_rate: minerHashRate,
      slot_size: 1,
      image_url: minerImageUrl
    };
  }

  await run(
    "UPDATE miners SET name = ?, base_hash_rate = ?, slot_size = 1, image_url = ?, is_active = 1 WHERE id = ?",
    [minerName, minerHashRate, minerImageUrl, existing.id]
  );

  return {
    id: existing.id,
    name: minerName,
    base_hash_rate: minerHashRate,
    slot_size: 1,
    image_url: minerImageUrl
  };
}

/**
 * Libera uma nova GPU para um usuário
 * @param {number} userId - ID do usuário
 * @param {number} rewardId - ID da reward (GPU configurada)
 * @param {number} gpuHashRate - Hash rate da GPU (vem das rewards)
 * @param {number} expiresAtMinutes - Minutos até expiração
 */
async function releaseNewGPU(userId, rewardId, gpuHashRate = 1, expiresAtMinutes = 0) {
  const now = Date.now();
  const expiresAt = expiresAtMinutes > 0 ? now + (expiresAtMinutes * 60 * 1000) : null;

  try {
    const result = await run(
      `
      INSERT INTO auto_mining_gpu (
        user_id,
        reward_id,
        gpu_hash_rate,
        is_available,
        is_claimed,
        released_at,
        expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [userId, rewardId, gpuHashRate, 1, 0, now, expiresAt]
    );

    return {
      id: result.lastID,
      user_id: userId,
      reward_id: rewardId,
      gpu_hash_rate: gpuHashRate,
      is_available: 1,
      is_claimed: 0,
      released_at: now,
      expires_at: expiresAt
    };
  } catch (err) {
    console.error("Erro ao liberar GPU:", err);
    throw err;
  }
}

/**
 * Obtém GPUs disponíveis para um usuário
 * @param {number} userId - ID do usuário
 */
async function getAvailableGPUs(userId) {
  try {
    const now = Date.now();
    const gpus = await all(
      `
      SELECT ag.*, ar.name as reward_name, ar.image_url as reward_image, ar.gpu_hash_rate as reward_g_hash_rate, ar.slug as reward_slug
      FROM auto_mining_gpu ag
      LEFT JOIN auto_mining_rewards ar ON ag.reward_id = ar.id
      WHERE ag.user_id = ?
        AND ag.is_available = 1
        AND ag.is_claimed = 0
        AND (ag.expires_at IS NULL OR ag.expires_at > ?)
      ORDER BY ag.released_at DESC
      `,
      [userId, now]
    );

    return gpus || [];
  } catch (err) {
    console.error("Erro ao obter GPUs disponíveis:", err);
    throw err;
  }
}

/**
 * Reivindica uma GPU específica
 * @param {number} gpuId - ID da GPU
 * @param {number} userId - ID do usuário
 */
async function claimGPU(gpuId, userId) {
  const now = Date.now();

  try {
    // Verifica se a GPU existe e está disponível
    const gpu = await get(
      `
      SELECT ag.*, ar.id as reward_id, ar.name as reward_name, ar.slug as reward_slug, ar.image_url as reward_image, ar.gpu_hash_rate as reward_g_hash_rate
      FROM auto_mining_gpu ag
      LEFT JOIN auto_mining_rewards ar ON ag.reward_id = ar.id
      WHERE ag.id = ? AND ag.user_id = ? AND ag.is_available = 1 AND ag.is_claimed = 0
      `,
      [gpuId, userId]
    );

    if (!gpu) {
      throw new Error("GPU não disponível ou já foi reivindicada");
    }

    // Atualiza o status da GPU
    const result = await run(
      `
      UPDATE auto_mining_gpu
      SET is_claimed = 1, claimed_at = ?
      WHERE id = ?
      `,
      [now, gpuId]
    );

    if (result.changes === 0) {
      throw new Error("Falha ao reivindicar GPU");
    }

    // Registra no log (inclui reward_id se presente)
    await logGPUClaim(userId, gpuId, gpu.gpu_hash_rate, "claim", "user_claim", gpu.expires_at, null, gpu.reward_id || null);

    // Adiciona item ao inventário do usuário (se a reward representar um miner/GPU)
    try {
      const mappedMiner = await resolveAutoRewardMiner(gpu);
      const acquiredAt = Date.now();
      const updatedAt = acquiredAt;
      // level e slotSize padrão
      await inventoryModel.addInventoryItem(
        userId,
        mappedMiner.name,
        1,
        mappedMiner.base_hash_rate,
        mappedMiner.slot_size,
        acquiredAt,
        updatedAt,
        mappedMiner.id,
        mappedMiner.image_url
      );
    } catch (invErr) {
      console.error("Erro ao adicionar item ao inventário:", invErr);
      // não bloquear o claim por conta de falha no inventário
    }

    return {
      ...gpu,
      is_claimed: 1,
      claimed_at: now
    };
  } catch (err) {
    console.error("Erro ao reivindicar GPU:", err);
    throw err;
  }
}

/**
 * Registra uma ação de GPU no log
 * @param {number} userId - ID do usuário
 * @param {number} gpuId - ID da GPU
 * @param {number} gpuHashRate - Hash rate da GPU
 * @param {string} action - Ação realizada (claim, expire, revoke, etc)
 * @param {string} source - Fonte da ação (user_claim, auto_mining, admin, etc)
 * @param {number} expiresAt - Timestamp de expiração
 * @param {string} notes - Notas adicionais
 */
async function logGPUClaim(
  userId,
  gpuId,
  gpuHashRate,
  action = "claim",
  source = "user_claim",
  expiresAt = null,
  notes = null,
  rewardId = null
) {
  const now = Date.now();

  try {
    const result = await run(
      `
      INSERT INTO auto_mining_gpu_logs (
        user_id,
        reward_id,
        gpu_id,
        gpu_hash_rate,
        action,
        source,
        claimed_at,
        expires_at,
        notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [userId, rewardId, gpuId, gpuHashRate, action, source, now, expiresAt, notes]
    );

    return {
      id: result.lastID,
      user_id: userId,
      reward_id: rewardId,
      gpu_id: gpuId,
      gpu_hash_rate: gpuHashRate,
      action,
      source,
      claimed_at: now,
      expires_at: expiresAt,
      notes
    };
  } catch (err) {
    console.error("Erro ao registrar GPU no log:", err);
    throw err;
  }
}

/**
 * Obtém histórico de GPUs de um usuário
 * @param {number} userId - ID do usuário
 * @param {number} limit - Limite de registros
 * @param {number} offset - Offset para paginação
 */
async function getUserGPUHistory(userId, limit = 50, offset = 0) {
  try {
    const logs = await all(
      `
      SELECT 
        agl.*,
        ar.name as reward_name
      FROM auto_mining_gpu_logs agl
      LEFT JOIN auto_mining_rewards ar ON agl.reward_id = ar.id
      WHERE agl.user_id = ?
      ORDER BY agl.claimed_at DESC
      LIMIT ? OFFSET ?
      `,
      [userId, limit, offset]
    );

    return logs || [];
  } catch (err) {
    console.error("Erro ao obter histórico de GPUs:", err);
    throw err;
  }
}

/**
 * Obtém estatísticas de GPUs para um usuário
 * @param {number} userId - ID do usuário
 */
async function getUserGPUStats(userId) {
  try {
    const pendingResult = await get(
      `
      SELECT COUNT(*) as pending_count, COALESCE(SUM(gpu_hash_rate), 0) as pending_hash_rate
      FROM auto_mining_gpu
      WHERE user_id = ? AND is_claimed = 0 AND is_available = 1
      `,
      [userId]
    );

    const claimedResult = await get(
      `
      SELECT COUNT(*) as claimed_count, COALESCE(SUM(gpu_hash_rate), 0) as claimed_hash_rate
      FROM auto_mining_gpu
      WHERE user_id = ? AND is_claimed = 1
      `,
      [userId]
    );

    const logsResult = await get(
      `
      SELECT COUNT(*) as total_logs, COALESCE(SUM(gpu_hash_rate), 0) as total_earned_hash_rate
      FROM auto_mining_gpu_logs
      WHERE user_id = ? AND action = 'claim'
      `,
      [userId]
    );

    return {
      pending_gpus: pendingResult.pending_count || 0,
      pending_hash_rate: pendingResult.pending_hash_rate || 0,
      claimed_gpus: claimedResult.claimed_count || 0,
      claimed_hash_rate: claimedResult.claimed_hash_rate || 0,
      total_claimed_ever: logsResult.total_logs || 0,
      total_hash_rate_earned: logsResult.total_earned_hash_rate || 0
    };
  } catch (err) {
    console.error("Erro ao obter estatísticas de GPUs:", err);
    throw err;
  }
}

/**
 * Revoga uma GPU (marca como não disponível)
 * @param {number} gpuId - ID da GPU
 * @param {string} reason - Motivo da revogação
 */
async function revokeGPU(gpuId, reason = "revoked") {
  try {
    const gpu = await get(`SELECT * FROM auto_mining_gpu WHERE id = ?`, [gpuId]);

    if (!gpu) {
      throw new Error("GPU não encontrada");
    }

    await run(
      `
      UPDATE auto_mining_gpu
      SET is_available = 0
      WHERE id = ?
      `,
      [gpuId]
    );

    await logGPUClaim(gpu.user_id, gpuId, gpu.gpu_hash_rate, "revoke", "admin", null, reason, gpu.reward_id || null);

    return true;
  } catch (err) {
    console.error("Erro ao revogar GPU:", err);
    throw err;
  }
}

/**
 * Remove GPUs expiradas
 */
async function removeExpiredGPUs() {
  const now = Date.now();

  try {
    // Busca GPUs expiradas
    const expiredGPUs = await all(
      `
      SELECT *
      FROM auto_mining_gpu
      WHERE expires_at IS NOT NULL AND expires_at < ?
      `,
      [now]
    );

    // Registra expiração de cada GPU e remove
    for (const gpu of expiredGPUs) {
      await logGPUClaim(
        gpu.user_id,
        gpu.id,
        gpu.gpu_hash_rate,
        "expired",
        "auto_cleanup",
        gpu.expires_at,
        "GPU expirada automaticamente",
        gpu.reward_id || null
      );

      await run(
        `
        UPDATE auto_mining_gpu
        SET is_available = 0
        WHERE id = ?
        `,
        [gpu.id]
      );
    }

    return expiredGPUs.length;
  } catch (err) {
    console.error("Erro ao remover GPUs expiradas:", err);
    throw err;
  }
}

/**
 * Obtém todas as GPUs liberadas no sistema (admin)
 * @param {number} limit - Limite de registros
 * @param {number} offset - Offset para paginação
 */
async function getAllReleasedGPUs(limit = 100, offset = 0) {
  try {
    const gpus = await all(
      `
      SELECT a.*, u.username, u.name
      FROM auto_mining_gpu a
      LEFT JOIN users u ON a.user_id = u.id
      ORDER BY a.released_at DESC
      LIMIT ? OFFSET ?
      `,
      [limit, offset]
    );

    return gpus || [];
  } catch (err) {
    console.error("Erro ao obter todas as GPUs:", err);
    throw err;
  }
}

/**
 * Obtém relatório de GPUs (admin)
 */
async function getGPUReport() {
  try {
    const totalReleasedResult = await get(
      `SELECT COUNT(*) as count, COALESCE(SUM(gpu_hash_rate), 0) as total_hash_rate FROM auto_mining_gpu`
    );

    const claimedResult = await get(
      `SELECT COUNT(*) as count, COALESCE(SUM(gpu_hash_rate), 0) as total_hash_rate FROM auto_mining_gpu WHERE is_claimed = 1`
    );

    const pendingResult = await get(
      `SELECT COUNT(*) as count, COALESCE(SUM(gpu_hash_rate), 0) as total_hash_rate FROM auto_mining_gpu WHERE is_claimed = 0 AND is_available = 1`
    );

    const usersWithGPUResult = await get(
      `SELECT COUNT(DISTINCT user_id) as users_count FROM auto_mining_gpu`
    );

    return {
      total_released: totalReleasedResult.count || 0,
      total_hash_rate_released: totalReleasedResult.total_hash_rate || 0,
      total_claimed: claimedResult.count || 0,
      total_claimed_hash_rate: claimedResult.total_hash_rate || 0,
      total_pending: pendingResult.count || 0,
      total_pending_hash_rate: pendingResult.total_hash_rate || 0,
      users_with_gpu: usersWithGPUResult.users_count || 0
    };
  } catch (err) {
    console.error("Erro ao gerar relatório de GPUs:", err);
    throw err;
  }
}

module.exports = {
  releaseNewGPU,
  getAvailableGPUs,
  claimGPU,
  logGPUClaim,
  getUserGPUHistory,
  getUserGPUStats,
  revokeGPU,
  removeExpiredGPUs,
  getAllReleasedGPUs,
  getGPUReport
};
