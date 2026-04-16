import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const script = join(__dirname, "..", "scripts", "openrouter-ask.mjs");

describe("openrouter-ask.mjs", () => {
  it("exits 1 when OPENROUTER_API_KEY is missing", () => {
    const r = spawnSync(process.execPath, [script, "hello"], {
      encoding: "utf8",
      env: { ...process.env, OPENROUTER_API_KEY: "" }
    });
    assert.equal(r.status, 1);
    assert.match(r.stderr || "", /OPENROUTER_API_KEY/i);
  });

  it("exits 2 when no prompt is given", () => {
    const r = spawnSync(process.execPath, [script], {
      encoding: "utf8",
      env: { ...process.env, OPENROUTER_API_KEY: "dummy" }
    });
    assert.equal(r.status, 2);
  });
});
