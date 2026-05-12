import type { DailyTaskReward, DailyTaskRow, DailyTasksTranslate } from './dailyTasksTypes';

export function formatRewardSummary(t: DailyTasksTranslate, reward: DailyTaskReward | null | undefined): string {
  if (!reward) return '';
  const k = String(reward.kind || '').toUpperCase();
  if (k === 'BLK' && reward.amount != null) {
    return t('dailyTasks.reward.blk', { amount: reward.amount });
  }
  if (k === 'POL' && reward.amount != null) {
    return t('dailyTasks.reward.pol', { amount: reward.amount });
  }
  if (k === 'HASHRATE_TEMP') {
    return t('dailyTasks.reward.hashrate', {
      hashRate: reward.hashRate ?? 0,
      days: reward.days ?? 1
    });
  }
  return k;
}

export function statusLabel(t: DailyTasksTranslate, status: string): string {
  const map: Record<string, string> = {
    available: 'dailyTasks.status.available',
    in_progress: 'dailyTasks.status.in_progress',
    completed: 'dailyTasks.status.completed',
    claimed: 'dailyTasks.status.claimed'
  };
  return t(map[status] || 'dailyTasks.status.available');
}

export function taskDescription(t: DailyTasksTranslate, task: DailyTaskRow): string {
  const key = task.translationKey || '';
  return t(key, { target: task.targetValue });
}

export function formatIsoLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

export function cadenceLabel(t: DailyTasksTranslate, cadence: string | null | undefined): string {
  const c = String(cadence || 'DAILY').toUpperCase();
  const key = `dailyTasks.cadence.${c}`;
  return t(key, { defaultValue: c });
}

export function formatDashboardNextResetLabel(nextResetAt: string | null | undefined): string {
  if (!nextResetAt) return '';
  try {
    return new Date(nextResetAt).toLocaleString();
  } catch {
    return String(nextResetAt);
  }
}
