#!/usr/bin/env node
/**
 * One-shot OpenRouter chat (for Cursor agents / local CLI). Does not print secrets.
 * Default model: openai/gpt-oss-120b:free (OpenRouter free tier when available).
 *
 * Usage (from repo root):
 *   export OPENROUTER_API_KEY=sk-or-v1-...
 *   node scripts/openrouter-ask.mjs "Your question or full context for the model"
 *
 * Optional: OPENROUTER_MODEL=openai/gpt-oss-20b:free
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

const body = {
  model,
  messages: [{ role: "user", content: userContent }]
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
