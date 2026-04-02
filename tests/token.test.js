const test = require("node:test");
const assert = require("node:assert/strict");

const { getTokenFromRequest } = require("../utils/token");

test("getTokenFromRequest prioritizes access cookie over bearer header", () => {
  const req = {
    headers: {
      authorization: "Bearer invalid-local-token",
      cookie: "blockminer_access=header.payload.sig"
    }
  };

  const token = getTokenFromRequest(req);
  assert.equal(token, "header.payload.sig");
});

test("getTokenFromRequest ignores malformed bearer token", () => {
  const req = {
    headers: {
      authorization: "Bearer cookie-session"
    }
  };

  const token = getTokenFromRequest(req);
  assert.equal(token, null);
});
