# Polygon HD deposit — unified specification (BlockMiner)

**Audience:** Cursor agent, OpenCoder (or any implementer), and reviewers.  
**Language:** English (repository standard).  
**Scope:** Dedicated Docker service that owns **100%** of Polygon HD deposit address lifecycle, plus a **new wallet UI path** (“deposit address” / HD) alongside existing deposit options (smart contract, WalletConnect, BTCPay soon).

**Status:** Design / implementation charter — not yet implemented unless tracked elsewhere.

---

## 1. Product intent

- Add a **fourth deposit mode** in the wallet/deposit UI: user gets a **custodial-style unique Polygon address** derived from a company-controlled HD tree.
- **Single-responsibility container:** all derivation, allocation rules, chain observation hooks, sweep orchestration (if in scope), and service-specific persistence that the monolith must not duplicate.
- **BlockMiner core** remains source of truth for **user identity**, **balances/credits in the product**, and **authorization**; the new service is a **specialist satellite** with a narrow API and strong auth.

---

## 2. Architecture (boundary)

| Area | Owner | Notes |
|------|--------|--------|
| User session, roles, product ledger | BlockMiner API (Express + Prisma) | No private keys in the monolith. |
| HD master secret, derivation, optional signing for sweep | **New `phd-service` container** | Only this service touches xprv/signing material (or HSM). |
| UI: new tab/button | React/Vite client | Same i18n rules (`en`, `pt-BR`, `es-ES`). |
| Chain read / tx broadcast | `phd-service` (configurable RPC) | Rate limits, retries, circuit breaker. |
| Webhooks into core | BlockMiner existing webhook style | HMAC or mTLS; idempotent handlers. |

**Postgres:** Prefer **one database** with a **clearly namespaced Prisma schema / tables** owned operationally by `phd-service` migrations *or* a dedicated DB if compliance demands isolation — choose explicitly in implementation PR (default: same Postgres, separate migration ownership, least new infra).

---

## 3. HD derivation policy (must be explicit)

- **Default recommendation for Polygon EVM compatibility:** use **`m/44'/60'/0'/0/<index>`** (Ethereum coin type **60**) so addresses match what users and tools expect across EVM chains unless the product deliberately wants a separate namespace.
- **Alternative:** SLIP-44 registers other coin types; if the team picks a non-60 path, document it in runbooks and **test cross-wallet import** expectations — users may assume MetaMask-style addresses.

**Allocation:** monotonic `index` per environment; DB unique constraint on `(environment, index)` and optional `(userId)` if one active address per user.

---

## 4. Data model (minimal)

- **Master key reference:** store **encrypted xprv** or **HSM key id** — never log, never echo in API responses.
- **Optional xpub:** if the design separates “derive address” (xpub) from “sweep” (xprv/HSM), document who holds what.
- **`PolygonHdAddress` (example):** `id`, `userId` (FK logical to core user), `index`, `address`, `derivationPath`, `createdAt`, `firstSeenTxHash`, `lastBalanceWei`, `sweptAt`, `status` (`unused` / `funded` / `sweep_pending` / `swept` / `archived`).

**Regulatory / product policy:** decide **single-use vs reusable** per address; single-use reduces attribution errors but increases index churn — document the choice.

---

## 5. API surface (indicative)

All traffic from the public internet should go **through BlockMiner API** (proxy) where possible; `phd-service` listens on an internal Docker network.

| Concern | Suggested shape | Auth |
|--------|------------------|------|
| Allocate or fetch address for user | `POST /internal/hd/addresses` `{ userId }` | Service token / mTLS from core |
| Read address state | `GET /internal/hd/addresses/:userId` | Same |
| Trigger sweep (manual or ops) | `POST /internal/hd/sweep` | Strong internal auth |
| Inbound chain events | Worker in `phd-service` **or** webhook from indexer → `phd-service` | Verify source |

Responses should follow the existing API envelope convention if proxied (`success`, `data`, `error`).

---

## 6. Security & secrets

- **Master seed / xprv:** KMS, Vault, or HSM; in-memory only; rotation playbook is mandatory before mainnet.
- **Internal auth:** short-lived tokens between core and `phd-service`; no anonymous internal routes.
- **Logs:** structured, **no** addresses of secrets, no partial mnemonics, no xprv/xpub in debug logs in production.
- **Threat model:** RPC provider sees traffic; use private endpoints where possible.

---

## 7. Indexing, confirmations, webhooks

- **Detection:** poll RPC, use indexer (Alchemy/QuickNode/etc.), or hybrid — document SLAs (e.g. credit after N confirmations).
- **Reorgs:** define max depth and whether credits are reversible or held until finality policy.
- **Core notification:** signed webhook `hd-received` / `hd-swept` with **idempotency key** (`txHash` + `logIndex` for tokens).

**ERC-20 vs native MATIC:** spec must list **allowed token contract addresses**; do not treat “any transfer to address” as deposit without allowlist unless explicitly desired.

---

## 8. Sweep & gas (if custodial consolidation is required)

- Sub-accounts need **MATIC for gas** on first-out sweep unless using account abstraction / relayer — budget and **funding policy** for gas must be defined.
- **Gas caps**, backoff, alerting on stuck sweeps, and manual ops endpoint.
- **Hot wallet** destination configurable per environment.

---

## 9. Client i18n (required keys — adjust namespaces to project conventions)

| Key idea | en | pt-BR | es-ES |
|----------|----|--------|--------|
| Section title | Polygon HD deposit | Depósito HD Polygon | Depósito HD Polygon |
| Short help | Send only supported assets to this address. | Envie apenas ativos suportados para este endereço. | Envíe solo activos admitidos a esta dirección. |
| Copy action | Copy address | Copiar endereço | Copiar dirección |
| Loading / error | Unable to load deposit address. | Não foi possível carregar o endereço de depósito. | No se pudo cargar la dirección de depósito. |
| Sweep pending (if shown) | Consolidation in progress. | Consolidação em andamiento. | Consolidación en curso. |

All user-visible strings must exist in **three** locales before merge.

---

## 10. Testing matrix (non-coverage command per project norms)

- **Unit:** derivation vectors for first N indices; path parsing errors.
- **Integration:** idempotent address for same user; concurrency on index allocation (`FOR UPDATE SKIP LOCKED` or equivalent); webhook HMAC reject/accept.
- **E2E (smoke):** UI shows new option, QR/copy flows with mocked API.
- **Security:** grep CI guard against logging mnemonics; dependency audit for crypto libs.

---

## 11. Rollout

- Feature flag in core + UI (`polygonHdDepositEnabled`).
- Staging with testnet Polygon + separate HD root.
- Canary users → monitor sweep success, webhook lag, RPC errors.
- Runbook: key rotation, incident “total leak” response, and reconciliation job.

---

## 12. Risks & mitigations (merged)

| Risk | Mitigation |
|------|------------|
| Master key leak | HSM/KMS, no disk persistence, split roles, incident playbook. |
| Index collision / double assign | DB uniqueness + transactional allocation. |
| Wrong coin type / path | Explicit documented path; tests against known test vectors. |
| User sends wrong token | Allowlist + clear UI warnings + support tooling. |
| RPC outage | Retries, circuit breaker, pause crediting/sweep, alert. |
| Webhook loss / dup | Idempotency store, periodic reconciliation against chain. |
| UI confusion among deposit methods | Distinct labeling, docs link, optional confirmation modal. |
| Scale (many rows) | Indexes on hot queries; archival policy for swept addresses. |

---

## 13. OpenRouter (free model) — distilled additions

The advisory model proposed naming the service **`phd-service`**, keeping **Express + Prisma** inside the container, exposing narrow HTTP routes, using **JWT from core** for user-facing flows proxied through BlockMiner, and **HMAC webhooks** back to core. It emphasized: **encrypted master xprv**, cron-like **balance polling**, **sweep with gas ceiling**, **E2E Cypress** for the new tab, and a **staged rollout** behind flags. **Correction applied in this document:** derivation coin type **must be chosen deliberately** — default to **`60`** for EVM/Polygon interoperability unless the team intentionally diverges.

---

## 14. Implementation checklist (for agents)

1. ADR or PR description referencing this file.  
2. Docker Compose service + internal network + env contract (`.env.example` keys only, no secrets).  
3. Migrations for HD tables; no schema changes to unrelated domains without approval.  
4. Core proxy routes + service auth + webhooks.  
5. Client UI fourth option + i18n + accessibility (QR alt text, focus order).  
6. Tests (`npm test` scope as usual; coverage only if requested).  
7. Staging validation on testnet before production flag.

---

*End of unified report.*
