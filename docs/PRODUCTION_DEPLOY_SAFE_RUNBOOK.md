# Production deployment — safe runbook (BlockMiner)

**Target example:** `root@37.27.38.21` — adjust host/path to your server.  
**Repository:** `https://github.com/blockminerspace-png/block-miner-v3.git` — branch `main` (or your production branch).

This runbook is designed for **data safety**: **no database migrations, schema changes, seeds, or destructive SQL** on production unless you have separate written approval.

---

## What this environment cannot do

Deployments from CI/Cursor to your VPS require **your** network path, **SSH keys or approved access**, and often **VPN/firewall** rules. From the development agent, SSH to `37.27.38.21` may **time out** or fail auth. **You** (or your CI) must run the steps below from a trusted machine with access.

---

## Absolute rules (production database)

| Allowed | Forbidden |
|---------|-----------|
| `pg_dump` (logical export, read-only on DB) | `prisma migrate`, `db push`, `ALTER`, `DROP`, `TRUNCATE`, `DELETE` (bulk), seeds |
| `SELECT` / connectivity checks | Rebuilding or reinitializing the database |
| Reading `DATABASE_URL` presence (not logging value) | Changing DB config without approval |

---

## Pre-deployment checklist

1. **Disk:** at least **20%** free on volumes holding app data and backups (`df -h`).
2. **Memory/CPU:** `free -h`, `uptime` — avoid deploying under extreme load if possible.
3. **Git:** confirm branch and clean tree on server (`git fetch`, `git status`, `git log -1 --oneline`).
4. **Secrets:** `.env.production` exists, permissions `600`, **never** committed. Verify keys exist **by name only** (do not print values):
   - `NODE_ENV=production`
   - `DATABASE_URL`
   - `JWT_SECRET`
   - `CCPAYMENT_APP_ID` / `CCPAYMENT_API_KEY`
   - `CCPAYMENT_APP_SECRET` / `CCPAYMENT_SECRET_KEY` / `CCPAYMENT_WEBHOOK_SECRET`
   - `CCPAYMENT_MERCHANT_ID` (optional)
   - `APP_URL` / public URL
5. **SSL:** certificate validity (browser or `openssl s_client`).
6. **Firewall:** only required ports exposed (e.g. 443, 22 from admin IPs).
7. **Record baseline:** note current **commit hash** and **image/tag** or release folder name.

---

## Recommended: zero-downtime with Docker Compose (rolling app container)

Typical stack (see `deploy.md`): **nginx** + **app** + **db**.  
**Do not** recreate `db` or run migrate inside the app startup on production without approval.

### A. SSH and become deployment user

```bash
ssh -i ~/.ssh/your_key root@37.27.38.21
```

### B. Optional: full DB backup (read-only export)

Run **on the server** or from a host that can reach Postgres **read-only**:

```bash
TS=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP_DIR=/var/backups/blockminer
mkdir -p "$BACKUP_DIR"
# Use the same DATABASE_URL as the app, or explicit pg_dump against host/port/user/db (read-only user recommended).
pg_dump "$DATABASE_URL" -Fc -f "$BACKUP_DIR/blockminer_${TS}.dump"
ls -la "$BACKUP_DIR/blockminer_${TS}.dump"
```

Verify file size > 0. **Do not** store dumps in a world-readable path.

### C. Backup current application tree (rollback)

```bash
TS=$(date -u +%Y%m%dT%H%M%SZ)
APP_ROOT=/root/block-miner   # your real clone path
tar czf "/var/backups/blockminer/app_${TS}.tar.gz" -C "$(dirname "$APP_ROOT")" "$(basename "$APP_ROOT")"
```

### D. Pull code (no DB commands)

```bash
cd "$APP_ROOT"
git fetch origin
git checkout main   # or production branch
git pull --ff-only origin main
git rev-parse HEAD
```

### E. Build and rolling restart (example: Docker)

**Does not run Prisma migrate** in this runbook.

```bash
docker compose build app
docker compose up -d --no-deps app
```

For a second replica (true blue/green), you would add a second app service name and switch upstream in nginx — project-specific.

### F. Health checks

```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/health
curl -sS -o /dev/null -w "%{http_code}\n" https://blockminer.space/health
```

### G. Post-deploy verification (5–15 minutes)

- Login, dashboard, mining socket/heartbeat if applicable.
- Wallet / deposits UI; CCPayment webhook is **POST** only — verify nginx routes and logs, not destructive tests against production DB.
- i18n: switch language to **pt-BR** and **es-ES** in the client.
- `docker compose logs -f --tail=200 app` — watch for errors (first 5 minutes).

### H. Rollback (if health or checks fail)

```bash
cd "$APP_ROOT"
git checkout <previous_commit_hash>
docker compose build app
docker compose up -d --no-deps app
```

Or restore tree from `app_${TS}.tar.gz` and restart containers. **Database rollback** only from your verified `pg_dump` with explicit DBA approval (not automated here).

---

## Deployment log template

Copy and fill with timestamps (UTC):

```
[YYYY-MM-DDTHH:MM:SSZ] Operator: 
[ ] Pre-checks disk/mem/git/env
[ ] DB backup path: 
[ ] App tarball path: 
[ ] Git HEAD before: 
[ ] Git HEAD after: 
[ ] docker compose up result: 
[ ] /health status: 
[ ] Smoke tests: 
[ ] Rollback needed: yes/no
```

---

## Environment variables to verify (names only)

- `NODE_ENV`
- `DATABASE_URL`
- `JWT_SECRET`
- `CCPAYMENT_APP_ID` / `CCPAYMENT_API_KEY`
- `CCPAYMENT_APP_SECRET` / `CCPAYMENT_SECRET_KEY` / `CCPAYMENT_WEBHOOK_SECRET`
- `CCPAYMENT_MERCHANT_ID`
- `APP_URL` / `CORS_ORIGINS` as required

---

## Incident: stop conditions

- **DB connection fails** after deploy → stop, rollback app, do **not** run migrations.
- **Git pull / build fails** → restore previous commit or tarball; investigate on staging.
- **Suspected data loss** → stop traffic if needed, restore from backup **with written procedure**, preserve logs.

---

## Automated script (server-side)

See `scripts/deploy-production-safe.sh` — run **on the server** after configuring variables at the top. It **does not** invoke `prisma migrate` or `db push`.
