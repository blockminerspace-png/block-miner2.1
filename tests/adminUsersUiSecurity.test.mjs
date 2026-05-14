import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("admin users UI safety", () => {
  it("does not render user/log metadata with raw HTML", async () => {
    const source = await readFile(new URL("../client/src/pages/admin/AdminUsers.tsx", import.meta.url), "utf8");
    assert.equal(source.includes("dangerouslySetInnerHTML"), false);
    assert.match(source, /txHash/);
    assert.match(source, /metadata/);
    assert.match(source, /Polygonscan/);
  });
});
