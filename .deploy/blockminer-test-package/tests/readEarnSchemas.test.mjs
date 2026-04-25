import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readEarnAdminCreateSchema,
  readEarnAdminUpdateSchema,
  readEarnRedeemBodySchema
} from "../server/utils/readEarnSchemas.js";

test("readEarnAdminCreateSchema accepts valid machine campaign", () => {
  const parsed = readEarnAdminCreateSchema.parse({
    title: "Partner article Q2",
    partnerUrl: "https://partner.example.com/article",
    rewardCode: "SECRET1",
    rewardType: "machine",
    rewardAmount: 2,
    rewardMinerId: 5,
    hashrateValidityDays: 7,
    startsAt: new Date("2026-01-01T00:00:00Z"),
    expiresAt: new Date("2026-12-31T00:00:00Z"),
    maxRedemptions: 1000,
    sortOrder: 0,
    isActive: true
  });
  assert.equal(parsed.rewardType, "machine");
  assert.equal(parsed.rewardMinerId, 5);
});

test("readEarnAdminCreateSchema rejects machine without miner id", () => {
  assert.throws(() =>
    readEarnAdminCreateSchema.parse({
      title: "X",
      partnerUrl: "https://a.com",
      rewardCode: "SECRET1",
      rewardType: "machine",
      rewardAmount: 1,
      startsAt: new Date("2026-01-01T00:00:00Z"),
      expiresAt: new Date("2026-12-31T00:00:00Z")
    })
  );
});

test("readEarnAdminCreateSchema rejects invalid URL scheme", () => {
  assert.throws(() =>
    readEarnAdminCreateSchema.parse({
      title: "X",
      partnerUrl: "ftp://a.com/x",
      rewardCode: "SECRET1",
      rewardType: "blk",
      rewardAmount: 10,
      startsAt: new Date("2026-01-01T00:00:00Z"),
      expiresAt: new Date("2026-12-31T00:00:00Z")
    })
  );
});

test("readEarnRedeemBodySchema trims campaign id and code", () => {
  const parsed = readEarnRedeemBodySchema.parse({ campaignId: "3", code: " ABC " });
  assert.equal(parsed.campaignId, 3);
  assert.equal(parsed.code, " ABC ");
});

test("readEarnAdminUpdateSchema allows partial payload", () => {
  const parsed = readEarnAdminUpdateSchema.parse({ title: "New title" });
  assert.equal(parsed.title, "New title");
});
