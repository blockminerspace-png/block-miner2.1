import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BUILTIN_CORS_ORIGINS, parseCorsOriginsList } from "../server/utils/corsConfig.ts";

describe("corsConfig", () => {
  it("merges minercore origins with CORS_ORIGINS", () => {
    const prev = process.env.CORS_ORIGINS;
    process.env.CORS_ORIGINS = "https://blockminer.space";
    try {
      const list = parseCorsOriginsList();
      assert.ok(list.includes("https://blockminer.space"));
      for (const origin of BUILTIN_CORS_ORIGINS) {
        assert.ok(list.includes(origin), `missing ${origin}`);
      }
    } finally {
      if (prev === undefined) delete process.env.CORS_ORIGINS;
      else process.env.CORS_ORIGINS = prev;
    }
  });
});
