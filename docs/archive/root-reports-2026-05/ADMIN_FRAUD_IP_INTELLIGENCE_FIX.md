# Admin fraud / IP intelligence fix

## 1. Root cause

Production stored **Docker/nginx hop IPs** (e.g. `172.18.0.1`, `172.19.x`) as user `registration_ip` / `last_ip` because:

- Express saw `remoteAddress` from the internal bridge.
- `TRUSTED_PROXY_CIDRS` was often empty, so `X-Real-IP` / `X-Forwarded-For` were ignored unless remote was exactly `127.0.0.1`.
- Reverse DNS ran synchronously on admin list loads, producing useless PTR (`host/backup/ubuntu`, `block-miner-nginx-…`).
- Shared-IP clusters scored hundreds of accounts as **critical** with `ban_candidate` without wallet/fingerprint proof.

## 2. Why `172.18.0.1` appeared

Docker Compose default bridge gateway (`172.18.0.1`) was persisted as the “client IP” when headers were not trusted from that hop.

## 3. Real IP resolution (now)

Central module: `server/modules/ip-intelligence/ipAddress.ts`

Priority when `TRUST_PROXY=1` and remote is a **trusted proxy** or **infrastructure** hop:

1. `CF-Connecting-IP` (if `TRUST_CLOUDFLARE=1`)
2. `X-Real-IP`
3. First **public** IP in `X-Forwarded-For`
4. `socket.remoteAddress` / `req.ip` fallback

Headers are **not** trusted from arbitrary public remotes.

`server/utils/clientIp.ts` re-exports for backward compatibility.

## 4. Cloudflare / Nginx / Docker

- **Nginx** (`nginx/nginx.conf`): passes `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`, and `CF-Connecting-IP` (when present).
- **Docker**: default `TRUSTED_PROXY_CIDRS` includes `10/8`, `172.16/12`, `192.168/16`, loopback when `TRUST_PROXY` is on and CIDR list is empty.
- **Cloudflare**: use `TRUST_CLOUDFLARE=true` so `cf-connecting-ip` is preferred behind edge.

Recommended production `.env.production` (not committed):

```env
TRUST_PROXY=true
TRUST_CLOUDFLARE=true
TRUSTED_PROXY_CIDRS=172.16.0.0/12,10.0.0.0/8,192.168.0.0/16
IP_INTEL_REVERSE_DNS_ENABLED=false
IP_INTEL_CACHE_TTL_HOURS=24
```

## 5. Infrastructure IPs ignored for fraud

Loopback, RFC1918, link-local, Docker bridge, and optional `IP_INFRASTRUCTURE_CIDRS`.

Effect:

- Score **0**, action `infrastructure_ignored`
- No `ban_candidate` from IP alone
- Admin banner explains proxy/infra capture

## 6. Reverse DNS

- Disabled by default: `IP_INTEL_REVERSE_DNS_ENABLED=false`
- Never runs for infrastructure IPs
- Only via cached `getCachedIpIntelligence` / admin “refresh IP” (async), not on every page render

## 7. ASN / provider cache

Existing table `ip_intelligence_cache` reused.

Infrastructure rows return `providerType: infrastructure`, `providerLabel: infrastructure/proxy` without external lookups.

TTL: `IP_INTEL_CACHE_TTL_HOURS` (falls back to `IP_INTEL_SUCCESS_TTL_DAYS`).

## 8. Risk score rules

| Signal | Max contribution alone |
|--------|-------------------------|
| Shared public IP | Capped ~25, usually `shared_ip_low_confidence` |
| Infrastructure IP | **0** |
| Wallet + fingerprint + ASN | `review_candidate` / `high_confidence_cluster` (manual only) |
| Technical UA/email garbage | `needs_more_signals` (never auto-ban) |

## 9. Admin actions

Removed automatic `ban_candidate`. Safe actions:

`ignore`, `monitor`, `review_candidate`, `needs_more_signals`, `shared_ip_low_confidence`, `infrastructure_ignored`, `high_confidence_cluster`.

`destructiveAllowed` is always **false** in code.

## 10. UI changes

- `/admin/fraud-signals`: infrastructure banner, strong/weak signal blocks, infrastructure provider panel (no PTR noise).
- `/admin/users`: infrastructure IPs show `infrastructure/proxy`; `ipRiskIgnored` excludes infra from “suspeito” heuristic.

## 11. Scripts

| Script | Purpose |
|--------|---------|
| `scripts/recompute-fraud-signals-safe.mjs` | Dry-run sample scoring; `--apply` requires `CONFIRM=YES` (no DB writes) |
| `scripts/backfill-real-user-ip-from-headers.mjs` | Reports infra IP counts; **cannot** reconstruct real IPs from DB |

## 12. Recompute dry-run

```bash
node scripts/recompute-fraud-signals-safe.mjs
```

Expect `ban_candidate: 0` for built-in samples.

## 13. Builds / tests (local)

- `tsc -p tsconfig.server.json` → OK (compiled to `/tmp/blockminer-dist-build` when `dist/` not writable)
- `node --test tests/clientIp.test.mjs tests/multiAccountRiskService.test.mjs` → **20/20 pass**
- `node --test tests/adminFraudSignalsService.test.mjs` → **5/5 pass**

Docker/client builds: run on CI/VM with `npm` available.

## 14. Docker build

Run on deploy host:

```bash
docker compose --env-file .env.production build --no-cache app worker
```

## 15. No automatic bans

No user balances, bans, or economy fields were modified. Scoring is advisory at read time.

## 16. Real users unaffected

Only anti-fraud **interpretation** and admin display changed. Historical stored IPs remain until new sessions capture public IPs with correct proxy config.
