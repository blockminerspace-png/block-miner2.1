#!/usr/bin/env node
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
dotenv.config({ path: path.join(repoRoot, ".env"), quiet: true });

/**
 * One-shot OpenRouter chat (for Cursor agents / local CLI). Does not print secrets.
 * Default model: openai/gpt-oss-120b:free (OpenRouter free tier when available).
 *
 * Usage (from repo root):
 *   export OPENROUTER_API_KEY=sk-or-v1-...
 *   node scripts/openrouter-ask.mjs "Your question or full context for the model"
 *
 * Optional: OPENROUTER_MODEL=openai/gpt-oss-20b:free
 *
 * System prompt: by default loads `scripts/openrouter-system-prompt.md` (repo constraints:
 * Postgres + webhooks; Redis only when explicitly needed). Override path with
 * OPENROUTER_SYSTEM_PROMPT_FILE (relative to repo root or absolute). Set to "-" to skip.
 *
 * Exit codes: 0 ok, 1 API/config error, 2 usage, 3 system prompt file contains "${" (unsafe).
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

function fail(code, msg) {
  console.error(msg);
  process.exit(code);
}

const apiKey = (process.env.OPENROUTER_API_KEY || "").trim();
if (!apiKey) {
  fail(1, "OPENROUTER_API_KEY is not set. Add it to Cursor Settings → Environment Variables, or export it in your shell.");
}

const model = (process.env.OPENROUTER_MODEL || "openai/gpt-oss-120b:free").trim();
const userContent = process.argv.slice(2).join(" ").trim();
if (!userContent) {
  fail(2, 'Usage: node scripts/openrouter-ask.mjs "your prompt"');
}

const systemFileFlag = (process.env.OPENROUTER_SYSTEM_PROMPT_FILE ?? "").trim();
const defaultSystemPath = path.join(__dirname, "openrouter-system-prompt.md");
const systemPath =
  systemFileFlag === "-"
    ? ""
    : systemFileFlag
      ? path.isAbsolute(systemFileFlag)
        ? systemFileFlag
        : path.join(repoRoot, systemFileFlag)
      : defaultSystemPath;

// System prompt file must stay static (no user-controlled templating); see header in
// scripts/openrouter-system-prompt.md. Reject "${" so accidental JS template literals
// in the file cannot pull runtime values into the system role.
let systemContent = "";
if (systemPath) {
  try {
    if (fs.existsSync(systemPath)) {
      systemContent = fs.readFileSync(systemPath, "utf8").trim();
    }
  } catch {
    // Optional file; continue with user-only message
  }
}

if (systemContent.includes("${")) {
  fail(
    3,
    `System prompt file must not contain "\${" (forbidden template-like sequence). Edit or replace: ${systemPath}`
  );
}

const messages = [];
if (systemContent) {
  messages.push({ role: "system", content: systemContent });
}
messages.push({ role: "user", content: userContent });

const body = {
  model,
  messages
};

const res = await fetch(OPENROUTER_URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    "HTTP-Referer": "https://blockminer.space",
    "X-Title": "BlockMiner Cursor agent (openrouter-ask)"
  },
  body: JSON.stringify(body)
});

const raw = await res.text();
let data;
try {
  data = JSON.parse(raw);
} catch {
  fail(1, `OpenRouter non-JSON response (HTTP ${res.status}): ${raw.slice(0, 500)}`);
}

if (!res.ok) {
  const errMsg = data?.error?.message || raw.slice(0, 800);
  fail(1, `OpenRouter HTTP ${res.status}: ${errMsg}`);
}

const text = data?.choices?.[0]?.message?.content;
if (typeof text !== "string" || !text.trim()) {
  fail(1, `Unexpected OpenRouter payload: ${JSON.stringify(data).slice(0, 800)}`);
}

process.stdout.write(text.trimEnd());
process.stdout.write("\n");
