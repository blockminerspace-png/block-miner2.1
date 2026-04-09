# CCPayment integration (POL / Polygon)

This project accepts **API Deposit** callbacks from [CCPayment](https://docs.ccpayment.com/) and credits **in-game POL** after cryptographic verification.

## Official documentation

- [API Deposit Webhook Notification](https://docs.ccpayment.com/ccpayment-v1.0-api/webhook-notification/api-deposit-webhook-notification)
- [Signature (SHA-256)](https://docs.ccpayment.com/ccpayment-v1.0-api/to-get-started/signature)

## Important: signature algorithm

CCPayment signs the **raw JSON body** with:

```text
Sign = lowercase_hex( SHA256( UTF8( appId + appSecret + timestamp + rawBody ) ) )
```

Headers (required):

| Header    | Description                          |
|-----------|--------------------------------------|
| `Appid`   | Same as your App ID                  |
| `Timestamp` | Unix time in **seconds** (10 digits) |
| `Sign`    | Hex digest above                     |

The webhook is valid for **2 minutes** from `Timestamp`.

The HTTP response must be **200** with body **`success`** (plain text). Any other body causes CCPayment to retry (up to ~6 times).

## Webhook endpoint

- **URL**: `POST https://blockminer.space/api/wallet/ccpayment/deposit-webhook`
- **Content-Type**: `application/json`
- **Auth**: None (signature + optional IP allowlist)

## Merchant order ID → user mapping

CCPayment sends `extend.merchant_order_id`. BlockMiner resolves the user as:

1. `BM{userId}-{suffix}` (case-insensitive `BM` prefix), e.g. `BM42-k9dj2`, or  
2. A numeric string, e.g. `42` (user id).

Configure your checkout / API deposit flow so `merchant_order_id` uses one of these formats.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CCPAYMENT_APP_ID` or `CCPAYMENT_API_KEY` | Yes | App ID from CCPayment Developer page |
| `CCPAYMENT_APP_SECRET` or `CCPAYMENT_SECRET_KEY` or `CCPAYMENT_WEBHOOK_SECRET` | Yes | App Secret (keep in secrets manager / env only) |
| `CCPAYMENT_MERCHANT_ID` | No | Optional; for your own logging / support |
| `CCPAYMENT_ALLOWED_IPS` | No | Comma-separated IPs; if unset, defaults to CCPayment IPs below |
| `CCPAYMENT_SKIP_IP_CHECK` | No | Set to `1` or `true` only for local testing (**not production**) |
| `CCPAYMENT_ALLOWED_CHAINS` | No | Default: `Polygon,MATIC,polygon` |
| `CCPAYMENT_ALLOWED_CRYPTOS` | No | Default: `POL,MATIC,WPOL` |
| `MIN_DEPOSIT_AMOUNT` | No | Default `1` (POL) |
| `MAX_DEPOSIT_AMOUNT` | No | Default `100000` (POL) |
| `CCPAYMENT_VERIFY_TOKEN` | No | If set, serves `GET /ccpayment{token}.txt` for domain verification |
| `CCPAYMENT_VERIFY_FILE_BODY` | No | Plain-text body for verification file |
| `TRUST_PROXY` | No | Set `1` if behind a reverse proxy so IP allowlist uses `X-Forwarded-For` |

Default webhook source IPs (when `CCPAYMENT_ALLOWED_IPS` is empty):

- `54.150.123.157`
- `35.72.150.75`
- `18.176.186.244`

## Website verification file

1. In CCPayment console, obtain the verification token / filename pattern `ccpayment{token}.txt`.
2. Set `CCPAYMENT_VERIFY_TOKEN={token}` (without `.txt`).
3. Deploy; open `https://blockminer.space/ccpayment{token}.txt` and confirm the response.
4. Complete verification in the CCPayment console.

## User API

- `GET /api/wallet/deposits` (authenticated) — last 100 `deposit` rows (includes CCPayment when credited).

## Admin API

- `GET /api/admin/ccpayment/deposits?limit=50` — recent CCPayment webhook ledger rows (requires admin auth).

## Security notes

- **Never** log `App Secret` or full webhook bodies in production.
- Store secrets in environment variables or a vault; do not commit them.
- Keep IP allowlist enabled in production unless traffic is proven to originate only from your TLS terminator with a fixed egress.
- Prisma parameterizes queries (no string-concat SQL).

## Idempotency

Each CCPayment `record_id` is stored exactly once in `ccpayment_deposit_events`. Retries with the same `record_id` return `200` + `success` without double-crediting.

Rejected webhooks (invalid user, limits, duplicate on-chain tx hash, etc.) still persist a **non-credited** row so retries do not loop forever.

## Troubleshooting

| Symptom | Check |
|--------|--------|
| `INVALID_SIGNATURE` | Raw body must match bytes CCPayment signed; ensure `express.raw` is used for this route only. |
| `TIMESTAMP_EXPIRED` | Clock skew; NTP on servers. |
| `403 forbidden` | IP allowlist; set `TRUST_PROXY=1` behind nginx if needed. |
| `ack_no_user` | `extend.merchant_order_id` format wrong. |
| Credits missing | CCPayment `pay_status` must be **`success`** (not `pending` / `processing`). |

## Tests

```bash
node --test tests/ccpayment.webhook.test.js
```

## Database

Apply migration `20260409140000_ccpayment_deposit_events` (or `npm run db:push` in development).
