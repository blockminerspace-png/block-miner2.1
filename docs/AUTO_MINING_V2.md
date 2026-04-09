# Auto Mining GPU v2

## Overview

Session-based temporary hashrate with **server-side cycle timing** (60 seconds), **24-hour TTL** per grant, and a **1000 H/s daily cap** counted in **UTC midnight** boundaries. Two modes:

- **NORMAL**: +10 H/s per successful cycle (no banner).
- **TURBO**: +20 H/s per cycle after a **registered banner click** and opening the partner URL in a new tab.

Legacy `auto_mining_gpu` rows (inventory GPU claims) remain supported in totals until they expire; v2 uses separate tables.

## API (`/api/auto-mining-gpu`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v2/session/start` | Body: `{ "mode": "NORMAL" \| "TURBO" }`. Ends any prior active session. |
| POST | `/v2/session/stop` | Ends the active session. |
| GET | `/v2/status` | Session, daily usage (UTC day), active grants, recent grants, turbo banner stats. |
| POST | `/v2/claim/normal` | Claims one Normal cycle if due and within daily cap. |
| GET | `/v2/banner` | Turbo: returns or reuses a valid impression for the current cycle. |
| POST | `/v2/banner/click` | Body: `{ "impressionId" }`. Records click (anti-instant minimum delay). |
| POST | `/v2/claim/turbo` | Body: `{ "impressionId" }`. Grants Turbo slice if click valid and cycle due. |

Rate limits are applied per user on session, claim, and banner routes.

## Security

- **Next claim time** is stored on the server; clients cannot advance the cycle by changing the clock.
- **Daily totals** are aggregated from persisted grants for the current UTC calendar day.
- **Optimistic locking** on `nextClaimAt` prevents double claims under concurrency.
- **Turbo**: minimum delay between impression creation and click; impression expiry window; one grant per impression.

## Database

Tables: `auto_mining_v2_sessions`, `auto_mining_v2_power_grants`, `auto_mining_v2_banner_impressions`.

Apply migrations (e.g. `npm run db:migrate`) or `prisma db push` in development after pulling schema changes.

## Cleanup

`gamePowerCleanup` removes expired v2 power grants and stale unclaimed banner impressions.

## Environment

- `AUTO_MINING_V2_FALLBACK_URL` — partner URL when no active `dashboard_banners` row has a link.

## i18n

UI strings live under `autoMiningGpuPage` in `en`, `pt-BR`, and `es` locale files.
