import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filterPublicOfferEvents,
  getUserBalanceNumber,
  hasEventMinerStock,
  isOfferEventActiveForPublic,
  normalizeOfferCurrency,
  userBalanceFieldForCurrency,
  SUPPORTED_OFFER_CURRENCIES
} from "#server/services/offerEventHelpers.js";

test("isOfferEventActiveForPublic respects window and flags", () => {
  const now = new Date("2026-06-15T12:00:00Z");
  const live = {
    isActive: true,
    deletedAt: null,
    startsAt: new Date("2026-06-01T00:00:00Z"),
    endsAt: new Date("2026-06-30T23:59:59Z")
  };
  assert.equal(isOfferEventActiveForPublic(now, live), true);
  assert.equal(isOfferEventActiveForPublic(now, { ...live, isActive: false }), false);
  assert.equal(isOfferEventActiveForPublic(now, { ...live, deletedAt: new Date() }), false);
  assert.equal(
    isOfferEventActiveForPublic(now, { ...live, endsAt: new Date("2026-06-10T00:00:00Z") }),
    false
  );
  assert.equal(
    isOfferEventActiveForPublic(now, { ...live, startsAt: new Date("2026-06-20T00:00:00Z") }),
    false
  );
});

test("filterPublicOfferEvents keeps only live events", () => {
  const now = new Date("2026-06-15T12:00:00Z");
  const events = [
    {
      id: 1,
      isActive: true,
      deletedAt: null,
      startsAt: new Date("2026-06-01"),
      endsAt: new Date("2026-06-30")
    },
    {
      id: 2,
      isActive: true,
      deletedAt: null,
      startsAt: new Date("2026-07-01"),
      endsAt: new Date("2026-07-30")
    }
  ];
  const out = filterPublicOfferEvents(events, now);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 1);
});

test("hasEventMinerStock", () => {
  assert.equal(hasEventMinerStock({ isActive: true, stockUnlimited: true, soldCount: 999 }), true);
  assert.equal(
    hasEventMinerStock({ isActive: true, stockUnlimited: false, stockCount: 5, soldCount: 5 }),
    false
  );
  assert.equal(
    hasEventMinerStock({ isActive: true, stockUnlimited: false, stockCount: 5, soldCount: 4 }),
    true
  );
  assert.equal(hasEventMinerStock({ isActive: false, stockUnlimited: true }), false);
  assert.equal(
    hasEventMinerStock({ isActive: true, stockUnlimited: false, stockCount: null, soldCount: 0 }),
    false
  );
});

test("currency helpers", () => {
  assert.equal(normalizeOfferCurrency("pol"), "POL");
  assert.equal(normalizeOfferCurrency("XYZ"), "POL");
  assert.ok(SUPPORTED_OFFER_CURRENCIES.includes("USDC"));
  assert.equal(userBalanceFieldForCurrency("USDC"), "usdcBalance");
  const user = { polBalance: 10, usdcBalance: 5 };
  assert.equal(getUserBalanceNumber(user, "POL"), 10);
  assert.equal(getUserBalanceNumber(user, "USDC"), 5);
});
