import test from "node:test";
import assert from "node:assert/strict";
import { assertMinViewForSubmit } from "../server/services/internalOfferwall/internalOfferwallMinView.js";
import { OFFER_KIND_PTC_IFRAME, OFFER_KIND_GENERAL_TASK } from "../server/services/internalOfferwall/internalOfferwallConstants.js";

test("PTC requires partnerOpenedAt", () => {
  const startedAt = new Date("2026-01-01T12:00:00.000Z");
  const now = new Date("2026-01-01T12:01:00.000Z");
  const r = assertMinViewForSubmit({
    offerKind: OFFER_KIND_PTC_IFRAME,
    startedAt,
    partnerOpenedAt: null,
    now,
    minViewSeconds: 10
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, "PARTNER_NOT_OPENED");
});

test("PTC min-view from partnerOpenedAt not startedAt", () => {
  const startedAt = new Date("2026-01-01T12:00:00.000Z");
  const partnerOpenedAt = new Date("2026-01-01T12:00:50.000Z");
  const now = new Date("2026-01-01T12:00:55.000Z");
  const r = assertMinViewForSubmit({
    offerKind: OFFER_KIND_PTC_IFRAME,
    startedAt,
    partnerOpenedAt,
    now,
    minViewSeconds: 10
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, "MIN_VIEW_NOT_MET");
});

test("PTC passes when partner window long enough", () => {
  const startedAt = new Date("2026-01-01T12:00:00.000Z");
  const partnerOpenedAt = new Date("2026-01-01T12:00:00.000Z");
  const now = new Date("2026-01-01T12:00:15.000Z");
  const r = assertMinViewForSubmit({
    offerKind: OFFER_KIND_PTC_IFRAME,
    startedAt,
    partnerOpenedAt,
    now,
    minViewSeconds: 10
  });
  assert.equal(r.ok, true);
});

test("general task uses startedAt only", () => {
  const startedAt = new Date("2026-01-01T12:00:00.000Z");
  const now = new Date("2026-01-01T12:00:05.000Z");
  const r = assertMinViewForSubmit({
    offerKind: OFFER_KIND_GENERAL_TASK,
    startedAt,
    partnerOpenedAt: null,
    now,
    minViewSeconds: 10
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, "MIN_VIEW_NOT_MET");
});
