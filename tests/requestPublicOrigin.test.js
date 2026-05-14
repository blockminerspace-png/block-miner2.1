import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveRequestPublicOrigin } from "#server/utils/requestPublicOrigin.js";

function makeReq(headers, secure = false) {
  const h = headers || {};
  return {
    secure,
    get(name) {
      const k = String(name).toLowerCase();
      const entry = Object.entries(h).find(([x]) => x.toLowerCase() === k);
      return entry ? entry[1] : undefined;
    }
  };
}

describe("resolveRequestPublicOrigin", () => {
  it("returns empty when host missing", () => {
    assert.equal(resolveRequestPublicOrigin(makeReq({})), "");
  });

  it("uses host and http when no forwarded proto", () => {
    assert.equal(resolveRequestPublicOrigin(makeReq({ host: "localhost:3000" })), "http://localhost:3000");
  });

  it("uses x-forwarded-host and proto", () => {
    const req = makeReq({
      "x-forwarded-host": "tests.blockminer.space",
      "x-forwarded-proto": "https"
    });
    assert.equal(resolveRequestPublicOrigin(req), "https://tests.blockminer.space");
  });

  it("takes first value from comma-separated forwarded headers", () => {
    const req = makeReq({
      "x-forwarded-host": "a.example.com, b.example.com",
      "x-forwarded-proto": "https, http"
    });
    assert.equal(resolveRequestPublicOrigin(req), "https://a.example.com");
  });

  it("uses https when req.secure and no forwarded proto", () => {
    assert.equal(resolveRequestPublicOrigin(makeReq({ host: "x.com" }, true)), "https://x.com");
  });
});
