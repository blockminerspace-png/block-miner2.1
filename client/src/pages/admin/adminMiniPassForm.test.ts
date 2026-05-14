import { describe, expect, it } from 'vitest';
import {
  buildProgressionTiers,
  validateRewardDraft,
  validateSeasonForm,
  summarizeRewardRow,
  countRewardLevels,
  validateMissionDraft,
} from './adminMiniPassForm';
import type { MissionDraft } from './adminMiniPassForm';

function baseMission(): MissionDraft {
  return {
    cadence: 'EVENT',
    missionType: 'PLAY_GAMES',
    targetValue: '1',
    xpReward: '50',
    titleEn: '',
    titlePtBR: '',
    titleEs: '',
    descriptionEn: '',
    descriptionPtBR: '',
    descriptionEs: '',
    gameSlug: '',
    sortOrder: '0',
  };
}

describe('adminMiniPassForm', () => {
  it('buildProgressionTiers matches linear XP gate', () => {
    const rows = buildProgressionTiers(3, 100);
    expect(rows.length).toBe(3);
    expect(rows.map((r) => r.minTotalXp)).toEqual([0, 100, 200]);
    expect(rows[0].xpToAdvance).toBe(100);
    expect(rows[2].xpToAdvance).toBe(0);
  });

  it('validateRewardDraft NONE always ok', () => {
    expect(validateRewardDraft({ rewardKind: 'NONE' }).ok).toBe(true);
  });

  it('validateRewardDraft SHOP_MINER needs minerId', () => {
    expect(validateRewardDraft({ rewardKind: 'SHOP_MINER', minerId: '' }).ok).toBe(false);
    expect(validateRewardDraft({ rewardKind: 'SHOP_MINER', minerId: '5' }).ok).toBe(true);
  });

  it('validateSeasonForm catches bad slug', () => {
    const keys = validateSeasonForm({
      slug: 'BAD SLUG',
      titleEn: 'T',
      startsAt: '2026-01-01T10:00',
      endsAt: '2026-02-01T10:00',
      maxLevel: 10,
      xpPerLevel: 100,
    });
    expect(keys.includes('invalid_slug')).toBe(true);
  });

  it('validateSeasonForm catches invalid POL price strings', () => {
    const keys = validateSeasonForm({
      slug: 'spring-2026',
      titleEn: 'T',
      startsAt: '2026-01-01T10:00',
      endsAt: '2026-02-01T10:00',
      maxLevel: 10,
      xpPerLevel: 100,
      buyLevelPricePol: 'abc',
      completePassPricePol: '1,5.2',
    });
    expect(keys.includes('invalid_buy_level_price')).toBe(true);
    expect(keys.includes('invalid_complete_pass_price')).toBe(true);
  });

  it('summarizeRewardRow', () => {
    expect(summarizeRewardRow({})).toBe('—');
    expect(summarizeRewardRow({ rewardKind: 'NONE' })).toBe('—');
    expect(summarizeRewardRow({ rewardKind: 'SHOP_MINER', miner: { name: 'Falcon X' }, minerId: 7 })).toBe('Falcon X');
    expect(summarizeRewardRow({ rewardKind: 'HASHRATE_TEMP', hashRate: 25, hashRateDays: 7 }).includes('25')).toBe(true);
  });

  it('countRewardLevels', () => {
    const { missingLevels } = countRewardLevels([{ level: 1 }, { level: 3 }], 3);
    expect(missingLevels).toEqual([2]);
  });

  it('validateMissionDraft requires title', () => {
    expect(validateMissionDraft({ ...baseMission(), titleEn: '', titlePtBR: '', titleEs: '' }).ok).toBe(false);
  });

  it('validateMissionDraft ok', () => {
    expect(
      validateMissionDraft({
        ...baseMission(),
        titleEn: 'Play',
        targetValue: '1',
        xpReward: '50',
      }).ok
    ).toBe(true);
  });

  it('validateMissionDraft ok for turbo mission without game slug', () => {
    expect(
      validateMissionDraft({
        ...baseMission(),
        missionType: 'AUTO_MINING_TURBO',
        titlePtBR: 'Turbo',
        targetValue: '2',
        xpReward: '75',
        gameSlug: '',
      }).ok
    ).toBe(true);
  });
});
