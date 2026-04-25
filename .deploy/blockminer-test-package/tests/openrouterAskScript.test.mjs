import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { describe, it } from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const script = join(__dirname, "..", "scripts", "openrouter-ask.mjs");
const defaultSystemPrompt = join(__dirname, "..", "scripts", "openrouter-system-prompt.md");

describe("openrouter-ask.mjs", () => {
  it("exits 1 when OPENROUTER_API_KEY is missing", () => {
    const r = spawnSync(process.execPath, [script, "hello"], {
      encoding: "utf8",
      env: { ...process.env, OPENROUTER_API_KEY: "" }
    });
    assert.equal(r.status, 1);
    assert.ok(
      /OPENROUTER_API_KEY/i.test(`${r.stderr || ""}${r.stdout || ""}`) || /EPERM/i.test(r.error?.message || ""),
      "expected OPENROUTER_API_KEY message or sandbox EPERM from spawnSync"
    );
  });

  it("exits 2 when no prompt is given", () => {
    const r = spawnSync(process.execPath, [script], {
      encoding: "utf8",
      env: { ...process.env, OPENROUTER_API_KEY: "dummy" }
    });
    assert.equal(r.status, 2);
  });

  it("ships a default OpenRouter system prompt with Postgres and webhook guidance", () => {
    assert.ok(fs.existsSync(defaultSystemPrompt), "scripts/openrouter-system-prompt.md must exist");
    const text = fs.readFileSync(defaultSystemPrompt, "utf8");
    assert.match(text, /PostgreSQL|Postgres/i);
    assert.match(text, /webhook/i);
    assert.match(text, /Redis/i);
    assert.match(text, /Agent Skills habits/i);
    assert.match(text, /notebooklm-py/i);
    assert.ok(
      !text.includes("${"),
      "default system prompt must not trigger the ${ guard (static file only)"
    );
  });

  it("exits 3 before fetch when custom system prompt contains ${", () => {
    const dir = fs.mkdtempSync(join(os.tmpdir(), "openrouter-sys-"));
    const badPath = join(dir, "bad.md");
    fs.writeFileSync(badPath, "line\nbad ${oops} token\n", "utf8");
    const r = spawnSync(process.execPath, [script, "hello"], {
      encoding: "utf8",
      env: {
        ...process.env,
        OPENROUTER_API_KEY: "dummy",
        OPENROUTER_SYSTEM_PROMPT_FILE: badPath
      }
    });
    fs.rmSync(dir, { recursive: true, force: true });
    assert.equal(r.status, 3);
    assert.ok(
      /System prompt file must not contain/i.test(`${r.stderr || ""}${r.stdout || ""}`) || /EPERM/i.test(r.error?.message || ""),
      "expected system prompt guard message or sandbox EPERM from spawnSync"
    );
  });
});
