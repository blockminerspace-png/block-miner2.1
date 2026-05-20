import type { TFunction } from 'i18next';
import type { CheckinMilestoneRow } from '../../types/checkin';

export type CheckinRewardType =
  | 'pol'
  | 'stelar'
  | 'zer'
  | 'machine'
  | 'item'
  | 'hashrate'
  | 'none'
  | 'unknown';

export type CheckinMilestoneUiState = 'locked' | 'eligible' | 'claimed';

export function normalizeCheckinRewardType(value: string | null | undefined): CheckinRewardType {
  switch (String(value || '').toLowerCase()) {
    case 'pol':
    case 'balance':
      return 'pol';
    case 'stelar':
      return 'stelar';
    case 'zer':
      return 'zer';
    case 'machine':
      return 'machine';
    case 'item':
      return 'item';
    case 'hashrate':
      return 'hashrate';
    case 'none':
      return 'none';
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

function milestoneRewardParams(m: CheckinMilestoneRow): Record<string, string | number> {
  const day = m.dayThreshold;
  const amount = formatRewardAmount(m.rewardValue);
  const params: Record<string, string | number> = { day };
  if (amount) params.amount = amount;
  if (m.itemCode) params.code = m.itemCode;
  if (m.validityDays != null) params.days = m.validityDays;
  return params;
}

export function getCheckinMilestoneTitle(t: TFunction, milestone: CheckinMilestoneRow): string {
  const rewardType = normalizeCheckinRewardType(milestone.rewardType);
  return String(t(`checkin.milestones.reward.${rewardType}.title`, milestoneRewardParams(milestone)));
}

export function getCheckinMilestoneDescription(t: TFunction, milestone: CheckinMilestoneRow): string {
  const rewardType = normalizeCheckinRewardType(milestone.rewardType);
  return String(t(`checkin.milestones.reward.${rewardType}.description`, milestoneRewardParams(milestone)));
}

export function getCheckinMilestoneRewardLine(t: TFunction, milestone: CheckinMilestoneRow): string {
  const rewardType = normalizeCheckinRewardType(milestone.rewardType);
  const value = formatRewardAmount(milestone.rewardValue);
  if (rewardType === 'pol' && value) {
    return String(t('checkin.milestone_reward_pol', { value }));
  }
  if ((rewardType === 'stelar' || rewardType === 'zer') && value) {
    return String(
      t(`checkin.milestones.reward.${rewardType}.title`, {
        day: milestone.dayThreshold,
        amount: value,
      }),
    );
  }
  if (rewardType === 'hashrate' && value) {
    return String(
      t('checkin.milestone_reward_hashrate', {
        value,
        days: milestone.validityDays ?? 7,
      }),
    );
  }
  if (rewardType === 'item' && milestone.itemCode) {
    return String(
      t('checkin.milestones.reward.item.title', {
        day: milestone.dayThreshold,
        code: milestone.itemCode,
      }),
    );
  }
  if (rewardType === 'machine') {
    return '';
  }
  if (rewardType === 'none') {
    return String(t('checkin.milestone_reward_none'));
  }
  return String(t('checkin.milestones.reward.unknown.title', { day: milestone.dayThreshold }));
}

export function getCheckinMilestoneStatusLabel(t: TFunction, state: string | undefined): string {
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
