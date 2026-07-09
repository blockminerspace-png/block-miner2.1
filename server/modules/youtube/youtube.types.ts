export type YoutubeStatusResult = {
  ok: true;
  activeHashRate: number;
  count: number;
  rewardGh: number;
  durationMin: number;
};

export type YoutubeDailyResetMeta = {
  timezone: string;
  localDate: string;
  nextResetAt: string;
  nextResetInMs: number;
};

export type YoutubeStatsResult = {
  ok: true;
  claims24h: number;
  hashGranted24h: number;
  claimsTotal: number;
  hashGrantedTotal: number;
  dailyLimit: number;
  dailyRemainingHash: number;
  dailyLimitMinutes: number;
  dailyMinutesUsed: number;
  dailyRemainingMinutes: number;
  activeHashTotal: number;
  dailyReset: YoutubeDailyResetMeta;
  watchSecondsBalance: number;
  minSecondsToClaim: number;
};

export type YoutubeClaimSuccess = {
  ok: true;
  rewardGh: number;
  message: string;
};

export type YoutubeClaimFailure = {
  ok: false;
  status: number;
  message: string;
  retryAfterMs?: number;
};

export type YoutubeClaimResult = YoutubeClaimSuccess | YoutubeClaimFailure;
