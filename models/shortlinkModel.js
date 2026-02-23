const { get, all, run } = require("../src/db/sqlite");

// Get shortlink completion status for user
async function getUserShortlinkStatus(userId) {
  const query = `
    SELECT 
      id,
      user_id,
      shortlink_type,
      current_step,
      completed_at,
      reset_at,
      created_at
    FROM shortlink_completions
    WHERE user_id = ?
  `;
  
  const status = await get(query, [userId]);
  
  if (!status) {
    return {
      id: null,
      user_id: userId,
      shortlink_type: "internal",
      current_step: 0,
      completed_at: null,
      reset_at: null,
      created_at: null,
      isCompleted: false,
      canRetry: true
    };
  }

  const now = Date.now();
  const isCompleted = status.completed_at !== null;
  
  // Check if can retry (daily reset at 9 AM BRT)
  const canRetry = !isCompleted || (status.reset_at && status.reset_at <= now);
  
  return {
    ...status,
    isCompleted,
    canRetry
  };
}

// Update shortlink step
async function updateShortlinkStep(userId, step) {
  const now = Date.now();
  
  const existing = await get(
    "SELECT id FROM shortlink_completions WHERE user_id = ?",
    [userId]
  );
  
  if (existing) {
    await run(
      `UPDATE shortlink_completions 
       SET current_step = ?, updated_at = ?
       WHERE user_id = ?`,
      [step, now, userId]
    );
  } else {
    await run(
      `INSERT INTO shortlink_completions (user_id, shortlink_type, current_step, created_at)
       VALUES (?, ?, ?, ?)`,
      [userId, "internal", step, now]
    );
  }
}

// Mark shortlink as completed
async function completeShortlink(userId) {
  const now = Date.now();
  
  const existing = await get(
    "SELECT id FROM shortlink_completions WHERE user_id = ?",
    [userId]
  );
  
  if (existing) {
    await run(
      `UPDATE shortlink_completions
       SET current_step = 3, completed_at = ?
       WHERE user_id = ?`,
      [now, userId]
    );
  } else {
    await run(
      `INSERT INTO shortlink_completions (user_id, shortlink_type, current_step, completed_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, "internal", 3, now, now]
    );
  }
  
  return { completedAt: now };
}

// Reset shortlink completion (called by cron at 9 AM BRT daily)
async function resetShortlinkCompletion(userId) {
  const now = Date.now();
  
  await run(
    `UPDATE shortlink_completions
     SET completed_at = NULL, current_step = 0, reset_at = ?
     WHERE user_id = ?`,
    [now, userId]
  );
}

// Reset all shortlinks (called by cron daily)
async function resetAllShortlinks() {
  const now = Date.now();
  
  const result = await run(
    `UPDATE shortlink_completions
     SET completed_at = NULL, current_step = 0, reset_at = ?
     WHERE completed_at IS NOT NULL`,
    [now]
  );
  
  return result;
}

module.exports = {
  getUserShortlinkStatus,
  updateShortlinkStep,
  completeShortlink,
  resetShortlinkCompletion,
  resetAllShortlinks
};
