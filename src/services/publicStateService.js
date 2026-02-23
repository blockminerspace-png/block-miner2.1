function createPublicStateService({ engine, get, run }) {
  async function getActiveGameHashRateTotal() {
    const now = Date.now();
    const row = await get("SELECT COALESCE(SUM(hash_rate), 0) as total FROM users_powers_games WHERE expires_at > ?", [now]);
    return Number(row?.total || 0);
  }

  async function getUserGameHashRate(userId) {
    if (!userId) {
      return 0;
    }
    const now = Date.now();
    const row = await get(
      "SELECT COALESCE(SUM(hash_rate), 0) as total FROM users_powers_games WHERE user_id = ? AND expires_at > ?",
      [userId, now]
    );
    return Number(row?.total || 0);
  }

  async function syncUserBaseHashRate(userId) {
    if (!userId) {
      return 0;
    }

    const row = await get(
      "SELECT COALESCE(SUM(hash_rate), 0) as total FROM user_miners WHERE user_id = ? AND is_active = 1",
      [userId]
    );
    const total = Number(row?.total || 0);
    const now = Date.now();
    await run(
      "UPDATE users_temp_power SET base_hash_rate = ?, updated_at = ? WHERE user_id = ?",
      [total, now, userId]
    );
    return total;
  }

  async function buildPublicState(minerId) {
    const state = engine.getPublicState(minerId);
    const baseNetworkRow = await get("SELECT COALESCE(SUM(base_hash_rate), 0) as total FROM users_temp_power");
    const gameNetworkHash = await getActiveGameHashRateTotal();
    const networkHashRate = Number(baseNetworkRow?.total || 0) + Number(gameNetworkHash || 0);

    state.networkHashRate = networkHashRate;

    if (state.miner) {
      const miner = engine.miners.get(state.miner.id);
      const userId = miner?.userId;
      const userBaseRow = await get("SELECT COALESCE(base_hash_rate, 0) as total FROM users_temp_power WHERE user_id = ?", [
        userId
      ]);
      const userGameHash = await getUserGameHashRate(userId);
      const baseHash = Number(userBaseRow?.total || 0);
      const boostMultiplier = Number(state.miner.boostMultiplier || 1);

      state.miner.baseHashRate = baseHash;
      state.miner.estimatedHashRate = baseHash * boostMultiplier + userGameHash;
    }

    return state;
  }

  return {
    getActiveGameHashRateTotal,
    getUserGameHashRate,
    syncUserBaseHashRate,
    buildPublicState
  };
}

module.exports = {
  createPublicStateService
};
