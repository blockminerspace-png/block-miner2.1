---
name: blockminer-ship-test-vm
description: >-
  After BlockMiner code changes pass tests, commit and push to main, then deploy
  to the test VPS (89.167.114.67) using scripts/deploy-test-vm-remote.py. Use
  when the user ships work, asks for deploy, or finishes a feature on this repo.
---

# BlockMiner — ship to test VM

## When to use

Apply at the **end of a coding task** on this repository when tests pass and the work should be on **tests.blockminer.space** / test VPS — not only when the user types "deploy".

## Steps (in order)

1. **Tests:** `npm test` at repo root; if `client/` changed, `npm run test -- --run --prefix client`. No coverage unless asked.
2. **Git:** Stage intentional changes only (no `coverage-server.txt`, `.npmrc` unless requested, no secrets). Commit with clear **English** message. `git push origin main` (or branch in `DEPLOY_GIT_BRANCH` if the task uses another branch).
3. **Test VM deploy:** From repo root:
   ```bash
   python3 scripts/deploy-test-vm-remote.py
   ```
   - Reads **`scripts/vm_config_secret.py`** (gitignored; copy from `vm_config_secret.example.py`) **or** env **`VM_IP`**, **`VM_PASSWORD`**, optional **`VM_USER`**.
   - Script runs local `git push` then SSH + `deploy-production-safe.sh` on `/root/block-miner-v3`.
4. **If deploy fails:** Report the exact error (e.g. missing `paramiko`, missing secret file, HTTPS push needs PAT). Git push may still succeed.

## Security

- **Never** commit `vm_config_secret.py`, `.env`, or passwords into rules, skills, or tracked files.
- Do not echo full passwords in chat logs when avoidable.

## Optional env

- `SKIP_GIT_PUSH=1` — redeploy only (remote already has the commit).
- `DEPLOY_GIT_BRANCH` — non-default branch.
- `BLOCKMINER_DOCKER_BUILD_NO_CACHE=1` — slower clean Docker build on VM.
