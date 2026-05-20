import type { TFunction } from 'i18next';
import type { CheckinMilestoneRow } from '../../types/checkin';

export type CheckinRewardType = 'pol' | 'temporary_power' | 'machine' | 'unavailable' | 'unknown';

export type CheckinMilestoneUiState = 'locked' | 'eligible' | 'claimed' | 'unavailable';

export function normalizeCheckinRewardType(value: string | null | undefined): CheckinRewardType {
  switch (String(value || '').toLowerCase()) {
    case 'pol':
    case 'balance':
      return 'pol';
    case 'temporary_power':
    case 'hashrate':
      return 'temporary_power';
    case 'machine':
      return 'machine';
    case 'unavailable':
      return 'unavailable';
    case 'item':
    case 'stelar':
    case 'zer':
    case 'none':
      return 'unavailable';
    default:
      return 'unknown';
  }
}

function formatRewardAmount(value: string | number | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (Number.isInteger(n)) return String(n);
  return String(n);
}

function formatDurationLabel(hours: number | null | undefined, t: TFunction): string {
  const h = Number(hours);
  if (!Number.isFinite(h) || h <= 0) return '';
  if (h < 24) return t('checkin.milestones.durationHours', { count: h });
  const days = Math.max(1, Math.round(h / 24));
  return t('checkin.milestones.durationDays', { count: days });
}

function milestoneRewardParams(m: CheckinMilestoneRow, t: TFunction): Record<string, string | number> {
  const day = m.dayThreshold;
  const amount = formatRewardAmount(m.rewardValue ?? m.amount);
  const power = formatRewardAmount(m.powerAmount ?? m.rewardValue ?? m.amount);
  const params: Record<string, string | number> = { day };
  if (amount) params.amount = amount;
  if (power) params.power = power;
  if (m.minerName) params.name = m.minerName;
  const duration = formatDurationLabel(m.durationHours, t);
  if (duration) params.duration = duration;
  return params;
}

export function getCheckinMilestoneTitle(t: TFunction, milestone: CheckinMilestoneRow): string {
  const rewardType = normalizeCheckinRewardType(milestone.rewardType);
  return String(t(`checkin.milestones.reward.${rewardType}.title`, milestoneRewardParams(milestone, t)));
}

export function getCheckinMilestoneDescription(t: TFunction, milestone: CheckinMilestoneRow): string {
  const rewardType = normalizeCheckinRewardType(milestone.rewardType);
  return String(t(`checkin.milestones.reward.${rewardType}.description`, milestoneRewardParams(milestone, t)));
}

export function getCheckinMilestoneRewardLine(t: TFunction, milestone: CheckinMilestoneRow): string {
  const rewardType = normalizeCheckinRewardType(milestone.rewardType);
  if (rewardType === 'unavailable' || rewardType === 'unknown') return '';
  const value = formatRewardAmount(milestone.rewardValue ?? milestone.amount);
  if (rewardType === 'pol' && value) {
    return String(t('checkin.milestone_reward_pol', { value }));
  }
  if (rewardType === 'temporary_power' && value) {
    const duration = formatDurationLabel(milestone.durationHours, t);
    return String(
      t('checkin.milestones.reward.temporaryPower.line', {
        power: value,
        duration: duration || '—',
      }),
    );
  }
  if (rewardType === 'machine') {
    return '';
  }
  return '';
}

export function getCheckinMilestoneStatusLabel(t: TFunction, state: string | undefined): string {
  if (state === 'unavailable') {
    return String(t('checkin.milestones.status.unavailable'));
  }
  switch (state) {
    case 'claimed':
      return String(t('checkin.milestones.status.claimed'));
    case 'eligible':
      return String(t('checkin.milestones.status.unlockedNextCheckin'));
    case 'locked':
    default:
      return String(t('checkin.milestones.status.blocked'));
  }
}

export function getCheckinMilestoneDayLabel(t: TFunction, dayThreshold: number): string {
  return String(t('checkin.milestones.days', { count: dayThreshold }));
}
