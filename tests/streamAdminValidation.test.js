import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseCreateStreamDestination,
  parsePatchStreamDestination
} from "../server/services/streaming/streamAdminValidation.js";

describe("streamAdminValidation", () => {
  it("accepts valid create payload", () => {
    const r = parseCreateStreamDestination({
      label: "Main",
      captureUrl: "https://blockminer.space/crypto-broadcast/",
      streamKey: "abcd-efgh"
    });
    assert.equal(r.ok, true);
    assert.equal(r.data.label, "Main");
  });

  it("rejects invalid capture URL", () => {
    const r = parseCreateStreamDestination({
      label: "Main",
      captureUrl: "not-a-url",
      streamKey: "k"
    });
    assert.equal(r.ok, false);
  });

  it("accepts patch with partial fields", () => {
    const r = parsePatchStreamDestination({ label: "Renamed" });
    assert.equal(r.ok, true);
    assert.equal(r.data.label, "Renamed");
  });
});
