const shortlinkModel = require("../models/shortlinkModel");
const machineModel = require("../models/machineModel");
const logger = require("../utils/logger").child("ShortlinkController");

// Get shortlink status
async function getShortlinkStatus(req, res) {
  try {
    const userId = req.user.id;
    
    const status = await shortlinkModel.getUserShortlinkStatus(userId);
    
    res.json({
      ok: true,
      status
    });
  } catch (error) {
    logger.error("Failed to get shortlink status", {
      userId: req.user?.id,
      error: error.message
    });
    
    res.status(500).json({
      ok: false,
      message: "Failed to get shortlink status"
    });
  }
}

// Complete a shortlink step
async function completeShortlinkStep(req, res) {
  try {
    const userId = req.user.id;
    const { step, shortlinkId } = req.body;
    
    if (!step || ![1, 2, 3].includes(Number(step))) {
      return res.status(400).json({
        ok: false,
        message: "Invalid step"
      });
    }
    
    // Get current status
    const status = await shortlinkModel.getUserShortlinkStatus(userId);
    
    // Check if already completed today
    if (status.isCompleted && !status.canRetry) {
      return res.status(400).json({
        ok: false,
        message: "You already completed this shortlink today. Try again after 9 AM BRT"
      });
    }
    
    // Update step
    await shortlinkModel.updateShortlinkStep(userId, Number(step));
    
    let reward = null;
    
    // If step 3 is completed, grant reward
    if (Number(step) === 3) {
      const completion = await shortlinkModel.completeShortlink(userId);
      
      // Grant 5 GHS machine to user
      reward = await grantRewardMachine(userId);
      
      logger.info("User completed shortlink", {
        userId,
        step: 3,
        reward: reward
      });
    }
    
    res.json({
      ok: true,
      message: "Step completed",
      step: Number(step),
      reward
    });
  } catch (error) {
    logger.error("Failed to complete shortlink step", {
      userId: req.user?.id,
      error: error.message
    });
    
    res.status(500).json({
      ok: false,
      message: "Failed to complete step"
    });
  }
}

// Grant reward machine (5 GHS) to user
async function grantRewardMachine(userId) {
  try {
    // Create or get next available slot for reward machine
    const { run } = require("../src/db/sqlite");
    const now = Date.now();
    
    // Insert new machine: reward3.png with 5 GHS
    const result = await run(
      `INSERT INTO user_miners 
        (user_id, miner_id, slot_index, level, hash_rate, is_active, purchased_at, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, null, 99, 1, 5, 1, now, "/assets/machines/reward3.png"]
    );
    
    logger.info("Reward machine granted to user", {
      userId,
      hashRate: 5,
      image: "reward3.png"
    });
    
    return {
      id: result.lastID,
      hashRate: 5,
      image: "reward3.png",
      message: "You received a 5 GHS machine!"
    };
  } catch (error) {
    logger.error("Failed to grant reward machine", {
      userId,
      error: error.message
    });
    
    throw error;
  }
}

module.exports = {
  getShortlinkStatus,
  completeShortlinkStep,
  grantRewardMachine
};
