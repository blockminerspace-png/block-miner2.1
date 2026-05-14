import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BUILTIN_IFRAME_HOSTS,
  getIframeHostAllowlistCachedSync,
  validateFrameHostnameForStorage
} from "#server/services/internalOfferwall/iframeHostAllowlistCache.js";

describe("iframeHostAllowlistCache validateFrameHostnameForStorage", () => {
  it("accepts a normal hostname", () => {
    const r = validateFrameHostnameForStorage("Partner.EXAMPLE.com");
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.hostname, "partner.example.com");
  });

  it("rejects localhost", () => {
    const r = validateFrameHostnameForStorage("localhost");
    assert.equal(r.ok, false);
  });

  it("rejects IPv4", () => {
    const r = validateFrameHostnameForStorage("8.8.8.8");
    assert.equal(r.ok, false);
  });
});

describe("iframeHostAllowlistCache builtins", () => {
  it("exposes built-in hosts and sync cache includes them", () => {
    assert.ok(BUILTIN_IFRAME_HOSTS.length >= 3);
    const s = getIframeHostAllowlistCachedSync();
    for (const h of BUILTIN_IFRAME_HOSTS) {
      assert.ok(s.has(h.toLowerCase()), `missing ${h}`);
    }
  });
});
