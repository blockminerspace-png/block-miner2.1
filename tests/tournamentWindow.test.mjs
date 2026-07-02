import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { snapWindowForType } from "#server/modules/tournaments/tournamentWindow.js";

describe("tournamentWindow UTC", () => {
  it("daily window = 00:00 UTC", () => {
    const anchor = new Date("2026-07-01T15:00:00.000Z");
    const w = snapWindowForType("DAILY", anchor);
    assert.ok(w);
    assert.equal(w.start.toISOString(), "2026-07-01T00:00:00.000Z");
    assert.equal(w.end.toISOString(), "2026-07-02T00:00:00.000Z");
  });

  it("monthly window = dia 1 UTC a dia 1 UTC", () => {
    const anchor = new Date("2026-06-15T15:00:00.000Z");
    const w = snapWindowForType("MONTHLY", anchor);
    assert.ok(w);
    assert.equal(w.start.toISOString(), "2026-06-01T00:00:00.000Z");
    assert.equal(w.end.toISOString(), "2026-07-01T00:00:00.000Z");
  });
});
