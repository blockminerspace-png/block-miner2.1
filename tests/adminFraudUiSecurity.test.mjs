import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("admin fraud UI XSS guard", () => {
  it("does not render external intelligence values through raw HTML", async () => {
    const source = await readFile(new URL("../client/src/pages/AdminFraudSignals.jsx", import.meta.url), "utf8");
    assert.equal(source.includes("dangerouslySetInnerHTML"), false);
    assert.match(source, /reverseDns/);
    assert.match(source, /asnOrg/);
    assert.match(source, /riskScore/);
  });
});
