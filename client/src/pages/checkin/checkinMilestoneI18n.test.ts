import { describe, it, expect } from 'vitest';
import {
  getCheckinMilestoneDescription,
  getCheckinMilestoneStatusLabel,
  getCheckinMilestoneTitle,
  normalizeCheckinRewardType,
} from './checkinMilestoneI18n';

const t = ((key: string, opts?: Record<string, unknown>) => {
  const params = opts || {};
  let out = key;
  for (const [k, v] of Object.entries(params)) {
    out = out.replace(`{{${k}}}`, String(v));
  }
  return out;
}) as import('i18next').TFunction;

describe('checkinMilestoneI18n', () => {
  it('normalizes reward types safely', () => {
    expect(normalizeCheckinRewardType('balance')).toBe('pol');
    expect(normalizeCheckinRewardType('machine')).toBe('machine');
    expect(normalizeCheckinRewardType('weird')).toBe('unknown');
  });

  it('builds title and status from i18n keys, not displayTitle', () => {
    const title = getCheckinMilestoneTitle(t, {
      id: 1,
      dayThreshold: 7,
      rewardType: 'temporary_power',
      rewardValue: 50,
      powerAmount: 50,
      durationHours: 24,
      displayTitle: 'Day 7 power',
      description: 'Should be ignored',
    });
    expect(title).toBe('checkin.milestones.reward.temporaryPower.title');
    expect(title).not.toContain('Day 7 power');
    expect(getCheckinMilestoneStatusLabel(t, 'eligible')).toBe(
      'checkin.milestones.status.unlockedNextCheckin',
    );
    expect(getCheckinMilestoneDescription(t, {
      id: 1,
      dayThreshold: 14,
      rewardType: 'machine',
      rewardValue: 0,
    })).toBe('checkin.milestones.reward.machine.description');
  });
});
