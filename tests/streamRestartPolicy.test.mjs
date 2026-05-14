import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isPermanentStreamStartFailure,
  MAX_AUTO_RESTART_ATTEMPTS,
  restartDelayMsForAttempt
} from "#server/services/streaming/streamRestartPolicy.js";

describe("streamRestartPolicy", () => {
  it("restartDelayMsForAttempt clamps to backoff table", () => {
    assert.equal(restartDelayMsForAttempt(0), 8000);
    assert.equal(restartDelayMsForAttempt(4), 120000);
    assert.equal(restartDelayMsForAttempt(99), 120000);
    assert.equal(restartDelayMsForAttempt(-3), 8000);
  });

  it("MAX_AUTO_RESTART_ATTEMPTS is a positive bound", () => {
    assert.equal(typeof MAX_AUTO_RESTART_ATTEMPTS, "number");
    assert.ok(MAX_AUTO_RESTART_ATTEMPTS >= 5);
  });

  it("isPermanentStreamStartFailure detects non-retryable errors", () => {
    assert.equal(isPermanentStreamStartFailure("STREAM_CAPTURE_DISABLED"), true);
    assert.equal(isPermanentStreamStartFailure("STREAM_UNSUPPORTED_OS"), true);
    assert.equal(isPermanentStreamStartFailure("Missing stream key or x"), true);
    assert.equal(isPermanentStreamStartFailure("STREAM_ENCRYPTION_KEY mismatch"), true);
    assert.equal(isPermanentStreamStartFailure("Invalid stream key configuration."), true);
    assert.equal(isPermanentStreamStartFailure("ffmpeg exited (1)"), false);
    assert.equal(isPermanentStreamStartFailure(""), false);
  });
});
