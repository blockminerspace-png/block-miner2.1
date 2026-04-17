---
name: blockminer-central-brain
description: Maintain an autonomous project brain for BlockMiner using OpenRouter and Obsidian. Use when planning, implementing, reviewing, or organizing work in this repo so the agent preserves context, improves prompts, and operates with senior-level structure.
---

# BlockMiner Central Brain

## Purpose

Use OpenRouter as an active reasoning partner and Obsidian as persistent project memory so work stays organized, reusable, increasingly intelligent, and increasingly autonomous across sessions.

## Memory locations

- Main hub: `/home/gustavo/Obsidian/Projects/BlockMiner-2.1.md`
- Central brain note: `/home/gustavo/Obsidian/Projects/BlockMiner 2.1 - Central Brain.md`

## When to apply

- New feature, bugfix, refactor, review, deploy, or architecture work in BlockMiner.
- Any task where preserving context or improving future execution is valuable.

## Workflow

1. Read the relevant Obsidian project note when the task is substantive or depends on prior context.
2. Run OpenRouter via `node scripts/openrouter-ask.mjs "<prompt>"` from repo root unless explicitly skipped.
3. Use the OpenRouter response to improve reasoning quality:
   - extract risks
   - identify missing checks
   - compare alternatives
   - choose a better execution order
   - refine your own prompt if the first framing was weak
4. Distill the task into:
   - mission
   - constraints
   - risks
   - current next step
5. If useful, update the central brain note before coding so the plan is externally visible.
6. Execute autonomously:
   - prefer the next obvious high-value step
   - avoid unnecessary back-and-forth
   - use stored project memory to avoid relearning the same context
   - keep your approach senior-level: structured, pragmatic, and quality-focused
   - keep code, docs, and structure tidy
7. After meaningful progress, update the central brain note with:
   - what changed
   - decisions made
   - pending items
   - reusable prompt or workflow improvements

## What to record

- Stable project goals and constraints
- Short decision log with why
- Repeated gotchas or repo-specific habits
- Better prompt patterns for future tasks
- Natural next steps after unfinished work

## What not to record

- Secrets, passwords, tokens, raw `.env`, or private credentials
- Low-value noise or terminal spam
- Temporary speculation that is no longer useful

## Autonomy standard

- Act like a senior engineer: organized, proactive, and careful.
- Optimize your own working method when you learn something reusable.
- Improve your own prompts, plans, and checklists over time instead of repeating weak patterns.
- Use OpenRouter for better thinking and Obsidian for better continuity.
- Ask the user only when there is real ambiguity, approval-sensitive risk, or an external blocker.
- Stay responsible for correctness; OpenRouter and Obsidian support judgment but do not replace it.
- Never confuse autonomy with guessing; verify against the repo, tests, and constraints.
