import {
  TASK_LOGIN_DAY,
  TASK_MINE_BLK,
  TASK_PLAY_GAMES,
  TASK_WATCH_YOUTUBE
} from "./dailyTaskConstants.js";
import { bumpDailyTasksForUser } from "./dailyTaskProgressService.js";

export async function notifyDailyTaskLoginDay(userId, checkinDateKey) {
  if (!userId || !checkinDateKey) return;
  await bumpDailyTasksForUser(userId, TASK_LOGIN_DAY, {
    dedupeKey: `login-${checkinDateKey}`,
    delta: 1
  });
}

export async function notifyDailyTaskBlkMined(userId, blkRewardLogId, amountBlk) {
  if (!userId || !blkRewardLogId) return;
  const amt = Number(amountBlk);
  if (!Number.isFinite(amt) || amt <= 0) return;
  await bumpDailyTasksForUser(userId, TASK_MINE_BLK, {
    dedupeKey: `blklog-${blkRewardLogId}`,
    delta: amt
  });
}

export async function notifyDailyTaskGamePlayed(userId, { userPowerGameId, gameSlug }) {
  if (!userId || !userPowerGameId) return;
  await bumpDailyTasksForUser(userId, TASK_PLAY_GAMES, {
    dedupeKey: `game-${userPowerGameId}`,
    delta: 1,
    gameSlug: gameSlug || null
  });
}

export async function notifyDailyTaskYoutubeWatch(userId, youtubeWatchHistoryId) {
  if (!userId || !youtubeWatchHistoryId) return;
  await bumpDailyTasksForUser(userId, TASK_WATCH_YOUTUBE, {
    dedupeKey: `yt-${youtubeWatchHistoryId}`,
    delta: 1
  });
}
