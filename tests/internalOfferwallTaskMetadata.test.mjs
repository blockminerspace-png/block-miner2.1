import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeTaskMetadata } from "../server/services/internalOfferwall/internalOfferwallTaskMetadata.js";
import { OFFER_KIND_GENERAL_TASK, OFFER_KIND_PTC_IFRAME } from "../server/services/internalOfferwall/internalOfferwallConstants.js";

describe("normalizeTaskMetadata", () => {
  it("returns null for empty input", () => {
    const r = normalizeTaskMetadata(OFFER_KIND_GENERAL_TASK, null);
    assert.equal(r.ok, true);
    assert.equal(r.value, null);
  });

  it("normalizes required actions", () => {
    const r = normalizeTaskMetadata(OFFER_KIND_GENERAL_TASK, {
      requiredActions: ["  Visit page ", ""]
    });
    assert.equal(r.ok, true);
    assert.deepEqual(r.value?.requiredActions, ["Visit page"]);
  });

  it("rejects external URL on PTC kind", () => {
    const r = normalizeTaskMetadata(OFFER_KIND_PTC_IFRAME, {
      externalInfoUrl: "https://example.com/x"
    });
    assert.equal(r.ok, false);
  });

  it("rejects external URL when host is not in the provided allowlist", () => {
    const r = normalizeTaskMetadata(
      OFFER_KIND_GENERAL_TASK,
      { externalInfoUrl: "https://unknown-partner.example/x" },
      { allowedHosts: new Set(["other.com"]) }
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "IFRAME_URL_NOT_ALLOWED");
  });

  it("accepts external URL when host matches the allowlist", () => {
    const r = normalizeTaskMetadata(
      OFFER_KIND_GENERAL_TASK,
      { externalInfoUrl: "https://www.example.com/path" },
      { allowedHosts: new Set(["example.com"]) }
    );
    assert.equal(r.ok, true);
    if (r.ok) assert.match(String(r.value?.externalInfoUrl || ""), /^https:\/\/www\.example\.com\//);
  });

  it("normalizes resetType and cooldownSeconds", () => {
    const r = normalizeTaskMetadata(OFFER_KIND_GENERAL_TASK, {
      resetType: "cooldown",
      cooldownSeconds: 90
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value?.resetType, "COOLDOWN");
      assert.equal(r.value?.cooldownSeconds, 90);
    }
  });

  it("rejects invalid resetType", () => {
    const r = normalizeTaskMetadata(OFFER_KIND_GENERAL_TASK, { resetType: "weekly" });
    assert.equal(r.ok, false);
  });
});
