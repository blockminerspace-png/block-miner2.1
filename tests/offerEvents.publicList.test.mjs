import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPublicOfferEventsWhere } from "../server/controllers/offerEventController.js";

test("buildPublicOfferEventsWhere includes active and upcoming events", () => {
  const now = new Date("2026-04-08T10:00:00.000Z");
  const where = buildPublicOfferEventsWhere(now);

  assert.deepEqual(where, {
    deletedAt: null,
    isActive: true,
    endsAt: { gte: now }
  });
});
