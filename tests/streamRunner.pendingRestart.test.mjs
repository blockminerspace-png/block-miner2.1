import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clearPendingStreamRestart,
  hasPendingStreamRestart,
  scheduleDesiredStreamRestart
} from "#server/services/streaming/streamRunner.js";

describe("streamRunner pending restart coordination", () => {
  it("exposes pending state and clears scheduled backoff", () => {
    const id = 9_999_001;
    clearPendingStreamRestart(id);
    assert.equal(hasPendingStreamRestart(id), false);

    scheduleDesiredStreamRestart(id, 0);
    assert.equal(hasPendingStreamRestart(id), true);

    clearPendingStreamRestart(id);
    assert.equal(hasPendingStreamRestart(id), false);
  });
});
