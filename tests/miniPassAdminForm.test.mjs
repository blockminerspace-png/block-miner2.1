import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildProgressionTiers,
  validateRewardDraft,
  validateSeasonForm,
  summarizeRewardRow,
  countRewardLevels,
  validateMissionDraft,
} from "../client/src/utils/adminMiniPassForm.js";

test("buildProgressionTiers matches linear XP gate", () => {
  const rows = buildProgressionTiers(3, 100);
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((r) => r.minTotalXp),
    [0, 100, 200],
  );
  assert.equal(rows[0].xpToAdvance, 100);
  assert.equal(rows[2].xpToAdvance, 0);
});

test("validateRewardDraft NONE always ok", () => {
  assert.equal(validateRewardDraft({ rewardKind: "NONE" }).ok, true);
});

test("validateRewardDraft SHOP_MINER needs minerId", () => {
  assert.equal(validateRewardDraft({ rewardKind: "SHOP_MINER", minerId: "" }).ok, false);
  assert.equal(validateRewardDraft({ rewardKind: "SHOP_MINER", minerId: "5" }).ok, true);
});

test("validateSeasonForm catches bad slug", () => {
  const keys = validateSeasonForm({
    slug: "BAD SLUG",
    titleEn: "T",
    startsAt: "2026-01-01T10:00",
    endsAt: "2026-02-01T10:00",
    maxLevel: 10,
    xpPerLevel: 100,
  });
  assert.ok(keys.includes("invalid_slug"));
});

test("validateSeasonForm catches invalid POL price strings", () => {
  const keys = validateSeasonForm({
    slug: "spring-2026",
    titleEn: "T",
    startsAt: "2026-01-01T10:00",
    endsAt: "2026-02-01T10:00",
    maxLevel: 10,
    xpPerLevel: 100,
    buyLevelPricePol: "abc",
    completePassPricePol: "1,5.2",
  });
  assert.ok(keys.includes("invalid_buy_level_price"));
  assert.ok(keys.includes("invalid_complete_pass_price"));
});

test("summarizeRewardRow", () => {
  assert.equal(summarizeRewardRow({}), "—");
  assert.equal(summarizeRewardRow({ rewardKind: "NONE" }), "—");
  assert.equal(summarizeRewardRow({ rewardKind: "SHOP_MINER", miner: { name: "Falcon X" }, minerId: 7 }), "Falcon X");
  assert.ok(summarizeRewardRow({ rewardKind: "HASHRATE_TEMP", hashRate: 25, hashRateDays: 7 }).includes("25"));
});

test("countRewardLevels", () => {
  const { missingLevels } = countRewardLevels([{ level: 1 }, { level: 3 }], 3);
  assert.deepEqual(missingLevels, [2]);
});

test("validateMissionDraft requires title", () => {
  assert.equal(validateMissionDraft({ ...baseMission(), titleEn: "", titlePtBR: "", titleEs: "" }).ok, false);
});

test("validateMissionDraft ok", () => {
  assert.equal(
    validateMissionDraft({
      ...baseMission(),
      titleEn: "Play",
      targetValue: "1",
      xpReward: "50",
    }).ok,
    true,
  );
});

test("validateMissionDraft ok for turbo mission without game slug", () => {
  assert.equal(
    validateMissionDraft({
      ...baseMission(),
      missionType: "AUTO_MINING_TURBO",
      titlePtBR: "Turbo",
      targetValue: "2",
      xpReward: "75",
      gameSlug: "",
    }).ok,
    true,
  );
});

function baseMission() {
  return {
    cadence: "EVENT",
    missionType: "PLAY_GAMES",
    targetValue: "1",
    xpReward: "50",
    titleEn: "",
    titlePtBR: "",
    titleEs: "",
    descriptionEn: "",
    descriptionPtBR: "",
    descriptionEs: "",
    gameSlug: "",
    sortOrder: "0",
  };
}
