---
name: blockminer-openrouter-always
description: >-
  In BlockMiner, consult OpenRouter (default free model via scripts/openrouter-ask.mjs)
  on substantive user messages and merge the opinion into the reply. Use whenever coding,
  planning, reviewing, or answering questions about this repo.
---

# BlockMiner — always consult OpenRouter

## Trigger

Use on **every substantive** user message in this repository (features, bugs, deploy, architecture, “what to improve”, refactors) — **not** for empty “ok/thanks” unless new work follows.

## Steps

1. `cd` to **repository root** (where `package.json` and `scripts/openrouter-ask.mjs` live).
2. Run:

   ```bash
   node scripts/openrouter-ask.mjs "<prompt>"
   ```

   Prompt must include: short BlockMiner stack reminder (Postgres, webhooks; **not** Redis-first) + user task + what you want (risks, review, priorities). When the work touches code or deploy, also ask the model to restate **ship discipline**: tests → **commit** (English) → **`git push`** → **`python3 scripts/deploy-test-vm-remote.py`** if VM credentials exist (no secrets in chat). The script injects **`scripts/openrouter-system-prompt.md`** as the **system** role automatically.

3. Parse **stdout** (plain text answer). Add an **“OpenRouter (free model)”** section to your reply with the distilled points.
4. If exit ≠ 0: note failure once; continue with your own answer.

## Defaults

- **Model:** `openai/gpt-oss-120b:free` (override with `OPENROUTER_MODEL`).
- **Auth:** `OPENROUTER_API_KEY` in `.env` (loaded by script) or Cursor env.

## Do not

- Commit API keys or put them in tracked files.
- Replace local verification (tests, `read_file`, grep) with model text alone.
