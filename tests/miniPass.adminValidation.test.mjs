import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeDescriptionI18n,
  nonNegativeDecimalString,
  normalizeTitleI18nForMiniPass,
  validateAndNormalizeLevelRewardInput,
  validateMissionInput
} from "#server/services/miniPass/miniPassAdminValidation.js";
import {
  MISSION_AUTO_MINING_TURBO,
  MISSION_INTERNAL_OFFERWALL,
  MISSION_PLAY_GAMES,
  MISSION_WATCH_YOUTUBE,
  REWARD_BLK,
  REWARD_EVENT_MINER,
  REWARD_HASHRATE_TEMP,
  REWARD_NONE,
  REWARD_POL,
  REWARD_SHOP_MINER
} from "#server/services/miniPass/miniPassConstants.js";

describe("validateAndNormalizeLevelRewardInput", () => {
  it("accepts NONE with cleared refs", () => {
    const r = validateAndNormalizeLevelRewardInput({
      rewardKind: REWARD_NONE,
      minerId: 99,
      blkAmount: "5"
    });
    assert.equal(r.ok, true);
    assert.equal(r.normalized.minerId, null);
    assert.equal(r.normalized.blkAmount, null);
  });

  it("requires minerId for SHOP_MINER", () => {
    const r = validateAndNormalizeLevelRewardInput({ rewardKind: REWARD_SHOP_MINER });
    assert.equal(r.ok, false);
  });

  it("requires eventMinerId for EVENT_MINER", () => {
    const r = validateAndNormalizeLevelRewardInput({
      rewardKind: REWARD_EVENT_MINER,
      eventMinerId: 3
    });
    assert.equal(r.ok, true);
    assert.equal(r.normalized.eventMinerId, 3);
  });

  it("validates HASHRATE_TEMP", () => {
    assert.equal(
      validateAndNormalizeLevelRewardInput({
        rewardKind: REWARD_HASHRATE_TEMP,
        hashRate: 0
      }).ok,
      false
    );
    const ok = validateAndNormalizeLevelRewardInput({
      rewardKind: REWARD_HASHRATE_TEMP,
      hashRate: 10,
      hashRateDays: 7
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.normalized.hashRate, 10);
  });

  it("validates BLK and POL amounts", () => {
    assert.equal(
      validateAndNormalizeLevelRewardInput({ rewardKind: REWARD_BLK, blkAmount: "0" }).ok,
      false
    );
    const b = validateAndNormalizeLevelRewardInput({ rewardKind: REWARD_BLK, blkAmount: "1.5" });
    assert.equal(b.ok, true);
    const p = validateAndNormalizeLevelRewardInput({ rewardKind: REWARD_POL, polAmount: "0,01" });
    assert.equal(p.ok, true);
    assert.equal(p.normalized.polAmount, "0.01");
  });
});

describe("validateMissionInput", () => {
  it("rejects non-positive target", () => {
    assert.equal(
      validateMissionInput({
        missionType: MISSION_PLAY_GAMES,
        targetValue: "0",
        xpReward: 10
      }).ok,
      false
    );
  });

  it("normalizes game slug", () => {
    const r = validateMissionInput({
      missionType: MISSION_PLAY_GAMES,
      targetValue: "3,5",
      gameSlug: "Crypto-Match-3",
      xpReward: 5
    });
    assert.equal(r.ok, true);
    assert.equal(r.targetDecimal, "3.5");
    assert.equal(r.gameSlug, "crypto-match-3");
  });

  it("accepts positive integer-style targets for youtube and internal offerwall missions", () => {
    const yt = validateMissionInput({
      missionType: MISSION_WATCH_YOUTUBE,
      targetValue: "2",
      xpReward: 10
    });
    assert.equal(yt.ok, true);

    const offerwall = validateMissionInput({
      missionType: MISSION_INTERNAL_OFFERWALL,
      targetValue: "1",
      xpReward: 20
    });
    assert.equal(offerwall.ok, true);
  });

  it("accepts turbo mission target", () => {
    const turbo = validateMissionInput({
      missionType: MISSION_AUTO_MINING_TURBO,
      targetValue: "3",
      xpReward: 30
    });
    assert.equal(turbo.ok, true);
  });

  it("rejects invalid slug characters", () => {
    const r = validateMissionInput({
      missionType: MISSION_PLAY_GAMES,
      targetValue: "1",
      gameSlug: "bad_slug",
      xpReward: 1
    });
    assert.equal(r.ok, false);
  });
});

describe("nonNegativeDecimalString", () => {
  it("normalizes comma decimals and accepts zero", () => {
    assert.equal(nonNegativeDecimalString("12,5"), "12.5");
    assert.equal(nonNegativeDecimalString("0"), "0");
    assert.equal(nonNegativeDecimalString("-1"), null);
  });
});

describe("normalizeTitleI18nForMiniPass", () => {
  it("returns null when all locales empty", () => {
    assert.equal(normalizeTitleI18nForMiniPass(null), null);
    assert.equal(normalizeTitleI18nForMiniPass({ en: "  ", ptBR: "", es: "" }), null);
  });

  it("fills en from pt-BR when English missing", () => {
    const r = normalizeTitleI18nForMiniPass({ en: "", ptBR: "Temporada 1", es: "" });
    assert.deepEqual(r, { en: "Temporada 1", ptBR: "Temporada 1", es: "Temporada 1" });
  });

  it("keeps distinct strings when all provided", () => {
    const r = normalizeTitleI18nForMiniPass({
      en: "Season A",
      ptBR: "Temporada A",
      es: "Temporada A ES"
    });
    assert.deepEqual(r, { en: "Season A", ptBR: "Temporada A", es: "Temporada A ES" });
  });
});

describe("normalizeDescriptionI18n", () => {
  it("returns null for empty", () => {
    assert.equal(normalizeDescriptionI18n(null), null);
    assert.equal(normalizeDescriptionI18n({ en: "  ", ptBR: "" }), null);
  });

  it("requires en when other locales set", () => {
    const r = normalizeDescriptionI18n({ en: "", ptBR: "Oi" });
    assert.ok(r.error);
  });

  it("accepts en-only", () => {
    const r = normalizeDescriptionI18n({ en: "Play games", ptBR: "", es: "" });
    assert.ok(r.value);
    assert.equal(r.value.en, "Play games");
  });
});
