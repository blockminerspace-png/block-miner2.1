# Production VM migration without DB changes

This runbook is for moving BlockMiner to a production VM without changing schema, seeding data, or touching existing user data.

## Hard rules

- Do not run `prisma migrate deploy`, `prisma db push`, `seed.js`, ad-hoc SQL, truncate, or restore-over-write steps.
- Do not rotate or export HD mnemonics, withdrawal keys, or any other wallet secret into chat, logs, git, or tracked files.
- Keep the existing PostgreSQL data volume, uploaded files, backups, and HD secret files outside the repo path.

## Required persistent assets on the VM

- PostgreSQL Docker volume `block-miner_postgres_data` or the exact volume used by the current stack.
- Repo-adjacent directories bound by Compose: `data/`, `uploads/`, `backups/`, `logs/nginx/`, `certbot-www/`, `nginx/certs/`, `nginx/certs-btcpay/`.
- HD wallet secret directory mounted read-only at `./secrets/phd/` with:
  - `internal_token`
  - `polygon_hd_mnemonic`
- `.env.production` already reviewed with `DB_BOOTSTRAP_ON_STARTUP=false`.

## Pre-cutover checks

1. On the source VM, record container names, mounted volumes, and current compose project.
2. Confirm the production database volume will be attached as-is on the target VM.
3. Copy persistent directories byte-for-byte to the target VM before first start.
4. Copy `./secrets/phd/` from the source VM to the target VM with owner-only permissions.
5. Verify `.env.production` on the target VM does not enable DB bootstrap and does not request Prisma migration.

## Start sequence on the target VM

1. Place the application tree on the target VM.
2. Place persistent directories and `./secrets/phd/` beside the repo so Compose mounts the existing data.
3. Run `scripts/deploy-production-safe.sh` with safe defaults only.
4. Start `db`, `phd`, and `app`.
5. Start `nginx` only after the app health endpoint is stable.

## Post-start verification

- `docker compose ps`
- `docker compose logs --tail=100 app`
- `docker compose logs --tail=100 phd`
- `curl -H 'X-Forwarded-Proto: https' http://127.0.0.1:${APP_HOST_PORT:-3000}/health`
- Verify one known user still has expected balances, check-in history, and owned machines through normal app/admin reads only.
- Verify the HD deposit service answers `/healthz` and can authenticate internally without exposing mnemonic material.

## Secrets handling

- Generate or store the HD mnemonic only on the VM or in your secret manager.
- Never print the mnemonic in terminal history, deployment output, or assistant replies.
- If the mnemonic must move between VMs, do it through your existing secure secret channel and write it directly to `./secrets/phd/polygon_hd_mnemonic` on the target VM.
