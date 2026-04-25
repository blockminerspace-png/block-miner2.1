---
name: blockminer-notebooklm
description: >-
  Use Google NotebookLM via unofficial notebooklm-py for BlockMiner-sidecar research,
  briefings, and artifacts. Triggers when the user asks for NotebookLM, notebooklm-py,
  teng-lin/notebooklm-py, or ingesting project docs into a notebook.
---

# BlockMiner + NotebookLM (notebooklm-py)

## Agent behavior (Cursor must do this)

When the task is a **good fit for NotebookLM** — multi-source synthesis, “explain these docs together”, podcast/slides/quiz from **already public** material, or the user names NotebookLM — **try the CLI first** before improvising from memory:

1. From repo root run **`./scripts/notebooklm-run.sh auth check --test`** (or `list` / `ask` as needed).
2. If auth fails with “Run `notebooklm login`”: tell the user to run **`./scripts/notebooklm-run.sh login`** once (browser), then retry; continue the task with repo/OpenRouter meanwhile.
3. For `ask` / `generate` / `download`, **always** prefer explicit notebook id **`-n` / `--notebook`** when you know it (avoid `use` races between parallel agents). Optional shell env: `NOTEBOOKLM_NOTEBOOK_ID` (see `.env.example`).
4. **Never** pass secrets, `.env`, keys, or mnemonics into `source add` or pasted prompts.

## Purpose

Optional **research and synthesis** beside the Node stack: add URLs or files as NotebookLM sources, ask questions, or generate artifacts (audio overview, slides, quiz, etc.). **Not** part of the BlockMiner server runtime — no coupling to Express, Prisma, or production secrets.

## Upstream (full API and long skill)

- **Repository:** [teng-lin/notebooklm-py](https://github.com/teng-lin/notebooklm-py) — MIT, **unofficial** NotebookLM access; Google may change endpoints; rate limits apply. See upstream [README](https://github.com/teng-lin/notebooklm-py/blob/main/README.md) and [SECURITY](https://github.com/teng-lin/notebooklm-py/blob/main/SECURITY.md).
- **Directory listing / install stats:** [skills.sh — notebooklm-py](https://skills.sh/teng-lin/notebooklm-py).
- **Full procedural skill (long `SKILL.md`):** after `npx skills add teng-lin/notebooklm-py -y`, read **`.agents/skills/notebooklm/SKILL.md`** (that folder is **gitignored** here). Alternatively read [raw SKILL.md on GitHub](https://raw.githubusercontent.com/teng-lin/notebooklm-py/main/SKILL.md).

## Minimal setup (BlockMiner repo)

**Preferred (agent + humans, no global pip install):**

```bash
./scripts/notebooklm-run.sh login          # first time; may need: pip install "notebooklm-py[browser]" + playwright if the CLI asks
./scripts/notebooklm-run.sh auth check --test
```

The script bootstraps **`vendor-notebooklm/`** (gitignored) with `pip install --target`. Alternatively install upstream’s way: `pip install "notebooklm-py[browser]"` then `notebooklm login`.

## BlockMiner guardrails

- **Never** add `.env`, deploy passwords, API keys, wallet mnemonics, or private SSH keys as sources. Use **public** GitHub URLs (e.g. `Architecture.md` on `main`), published docs, or **redacted** exports only.
- **Verify** NotebookLM answers against the repo — models over sources can still drift.
- **Obsidian:** project memory lives under `[[BlockMiner 2.1]]` in the vault; prefer stable **HTTPS** sources over local-only `file://` if collaboration or cloud NotebookLM matters.

## Typical CLI flow

1. `notebooklm create "BlockMiner — <topic>"` then `notebooklm use <notebook_id>` (or pass `-n` / `--notebook` explicitly for automation — see upstream skill for parallel agents).
2. `notebooklm source add "https://…"` for each document.
3. `notebooklm ask "…"` or `notebooklm generate …` with `--wait` as needed; `notebooklm download …` for artifacts.

## When to load the long upstream skill

Use the full **`.agents/skills/notebooklm/SKILL.md`** (after install) or the GitHub raw file when the user needs every subcommand, artifact type, profile, or CI auth pattern (`NOTEBOOKLM_AUTH_JSON`, etc.).
