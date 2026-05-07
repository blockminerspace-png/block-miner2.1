# BlockMiner deployment (test VM)

This project deploys from Windows via `deploy.py` → `scripts/deploy-vps-windows.ps1` (PuTTY `plink`/`pscp`) or via CI workflows. The application stack on the VM is **Docker Compose** (`docker-compose.yml`): `db`, `app`, optional `nginx` (profile `proxy`).

> **Note:** `deploy.md` at the repo root is gitignored for local notes. This file is the committed reference.

## Quick checks on the VM (SSH)

Run as the same user that owns the repo path (often `root`):

```bash
cd /path/to/block-miner   # e.g. /root/block-miner-v3
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs --tail=120 app
```

Confirm the published app port matches health checks:

```bash
grep -E '^APP_HOST_PORT=' .env.production || true
```

Compose binds the app to `127.0.0.1:${APP_HOST_PORT:-3000}:3000`. The deploy script resolves this port from the **merged** `.env.production` text (uploaded from your machine) so `curl http://127.0.0.1:<port>/health` targets the same port Docker publishes.

## Common failure modes

1. **Health shows `000` or connection reset** — The Node process is still booting (`docker-entrypoint.sh` waits for Postgres, runs `prisma generate`, then starts the server). The deploy script **retries `/health` for up to ~90 seconds** and prints `docker compose logs` if it never reaches HTTP 200.

2. **`APP_HOST_PORT` mismatch** — If `deploy.secrets.local` sets `APP_HOST_PORT` but `.env.production` on the VM uses a different value after merge, the old script could curl the wrong port. The script now prefers **`APP_HOST_PORT` from the merged env** (same file Compose uses).

3. **Migrations before health** — If the app cannot start until `prisma migrate deploy` runs, checking health before migrate always fails. The script now runs **`DEPLOY_PRISMA_MIGRATE_DEPLOY` before the health loop** when that flag is enabled.

4. **Nginx profile** — `docker compose up -d nginx` uses profile `proxy`. If nginx fails to start, check `nginx/certs` and `nginx/nginx.conf`; app health on `127.0.0.1:<APP_HOST_PORT>` bypasses nginx.

5. **Site still shows an old UI after deploy** — The SPA ships from **`client/dist` inside the `app` image** (built in Docker). Nginx only reverse-proxies; it does not ship an old copy from disk unless the **container image** is old. Check in order:
   - **Wrong hostname:** production (`blockminer.space`) vs staging (`tests.blockminer.space`) vs raw VM IP — each can point at different commits or VMs.
   - **Git on the VM:** `cd $REMOTE_PATH && git log -1 --oneline` must match the commit you expect after `deploy.py` runs `git reset --hard origin/<branch>`.
   - **Image not rebuilt:** Default deploy runs `docker compose up -d --build`. If layers were reused incorrectly, run a full rebuild: `python deploy.py --no-cache` (Windows) or on the VM `docker compose --env-file .env.production build --no-cache app` then `up -d --no-deps app`.
   - **CDN / browser cache:** If Cloudflare (or similar) caches HTML, purge cache or disable “cache everything” for `/`. Users should hard-refresh once (`Ctrl+Shift+R` / empty cache). The Node app already sends **`Cache-Control: no-store`** on the HTML shell (`server/server.js` catch-all for `index.html`).
   - **Confirm headers:** `curl -sI https://<host>/ | findstr /i cache` (Windows) or `curl -sI https://<host>/ | grep -i cache` — expect `no-store` / `no-cache` on the document response from origin.

## Live streaming admin (`STREAM_ENCRYPTION_KEY`)

Saving RTMP destinations encrypts stream keys with **AES-256-GCM** using `STREAM_ENCRYPTION_KEY` (exactly **64 hex characters**, i.e. 32 bytes). If this variable is missing on the API host, the admin UI returns HTTP 503.

**Windows deploy:** add to `deploy.secrets.local` (merged into `.env.production` on upload):

```text
STREAM_ENCRYPTION_KEY=paste_output_of_openssl_rand_hex_32
```

Generate locally:

```bash
openssl rand -hex 32
```

**Manual VM edit:** add the same line to `.env.production` next to the compose project and run `docker compose up -d app` (or redeploy).

## Local secrets (never commit)

- `deploy.secrets.local` — `SSH_HOST`, `SSH_USER`, `SSH_PASSWORD`, `REMOTE_PATH`, optional `DEPLOY_GIT_BRANCH`, `APP_HOST_PORT`, `STREAM_ENCRYPTION_KEY`, `DEPLOY_PRISMA_MIGRATE_DEPLOY=1`, etc.
- `.deploy-pw.txt` — single-line root password for `deploy.py` (gitignored).
- Optional local copies of production env (gitignored): never commit real secrets.

For GitHub Actions / test VM variables, see `.github/workflows/deploy-test-vm.yml` and `.env.example`.

## Cloudflare Turnstile (pink “testing only” banner)

That banner is rendered by **Cloudflare** when the widget uses their [dummy / testing site key](https://developers.cloudflare.com/turnstile/troubleshooting/testing/). It cannot be hidden in CSS; you must use **real** Turnstile keys.

On the VM (same directory as `docker-compose.yml`):

1. Edit `.env.production`: set `VITE_TURNSTILE_SITE_KEY_LOGIN` (and `TURNSTILE_SECRET_KEY_LOGIN` to the matching secret from the Turnstile dashboard). Add the same for register if you use separate widgets.
2. **Unset** or delete `TURNSTILE_USE_CLOUDFLARE_DUMMY_KEYS` and `VITE_TURNSTILE_DUMMY_FALLBACK` (do not set them to `1` on hosts you treat as real).
3. Rebuild the SPA inside the image (Vite reads `VITE_*` at build time):

```bash
docker compose --env-file .env.production build app
docker compose --env-file .env.production up -d --no-deps app
```

If you only change server secrets but not `VITE_*`, the browser still loads the old site key from the previous build.

**Production safety:** With `NODE_ENV=production`, the API process **exits on startup** if `TURNSTILE_USE_CLOUDFLARE_DUMMY_KEYS` is enabled, unless you set `ALLOW_TURNSTILE_DUMMY_IN_PRODUCTION=1` (emergency escape hatch only). Use real Turnstile keys instead.
