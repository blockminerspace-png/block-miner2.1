# BlockMiner 2.1 - Bug Report

> Generated: 2026-04-16
> Agents: OpenCode + Cursor (shared working document)
> Total Issues: 45+

---

## Index

1. [Critical (Immediate Fix)](#critical-immediate-fix)
2. [High (This Sprint)](#high-this-sprint)
3. [Medium (Backlog)](#medium-backlog)
4. [Low (Nice to Fix)](#low-nice-to-fix)
5. [Schema Issues](#schema-issues)
6. [Test Status](#test-status)

---

## Critical (Immediate Fix)

### 1. Silent Error Swallowing - Deposit Scanner

**File:** `server/cron/depositsCron.js`
**Lines:** 43, 128, 140, 144

```javascript
// All errors silently swallowed - NO logging!
} catch (e) {}
scanForNewDeposits().catch(() => {});
```

**Fix:** Add proper error logging with `logger.error()`

---

### 2. Race Condition - Distributed Rate Limit Middleware

**File:** `server/middleware/distributedRateLimit.js`
**Lines:** 58-114

```javascript
// Async IIFE runs AFTER next() is called - causes header conflicts
void (async () => {
  if (!primary.ok) {
    res.status(statusCode).json(...); // Runs AFTER next()!
    return;
  }
  next(); // next() called BEFORE async operations!
})();
```

**Fix:** Use proper async middleware or wrap in promise

---

### 3. Missing Input Validation - Number() Returns NaN

**File:** `server/controllers/vaultController.js`
**Lines:** 604, 614

```javascript
const vaultId = Number(req.body.vaultId); // NaN if undefined
const slotIndex = Number(req.body.slotIndex); // NaN passes isInteger check!
if (!Number.isInteger(vaultId) || vaultId < 0) { // NaN fails this check, but misleading
```

**Fix:** Add explicit validation: `const vaultId = Number(req.body?.vaultId); if (!Number.isInteger(vaultId) || vaultId <= 0) throw...`

---

### 4. Async Fire-and-Forget - Check-in Controller

**File:** `server/controllers/checkinController.js`
**Lines:** 137-139, 215-216, 225-226, 528-530

```javascript
applyStreakMilestoneRewards(updated.userId).catch(() => {});
notifyMiniPassLoginDay(updated.userId, updated.checkinDate).catch(() => {});
notifyDailyTaskLoginDay(updated.userId, updated.checkinDate).catch(() => {});
```

**Fix:** Add logging or use queue system

---

### 5. No Database Reconnection - All Cron Jobs

**Files:** `server/cron/*.js`
**Issue:** No Prisma connection health check before queries. If DB drops, jobs crash forever.
**Fix:** Add connection check + reconnection logic

---

## High (This Sprint)

### 6. Race Condition - Withdrawal Auto-Send

**File:** `server/cron/withdrawalsCron.js`
**Lines:** 53-85

- No transaction isolation - same withdrawal processed twice possible
- No locking on withdrawal record
  **Fix:** Add database-level locking

---

### 7. Race Condition - Cron Action Runner

**File:** `server/cron/cronActionRunner.js`
**Lines:** 62, 83, 93, 217

```javascript
const inFlight = new Set(); // NOT thread-safe in multi-process!
if (!allowConcurrent && inFlight.has(lockKey)) { ... }
inFlight.add(lockKey);
```

**Fix:** Use Redis distributed lock instead of in-memory Set

---

### 8. Unsafe Promise Handling - BLK Reward Cycle

**File:** `server/cron blkRewardCycleCron.js`
**Lines:** 50, 55

- Interval continues after repeated failures
- No circuit breaker
  **Fix:** Add circuit breaker pattern

---

### 9. Memory Leak - Intervals Without Cleanup

**Files:**
| File | Lines |
|------|-------|
| `client/src/pages/Games.jsx` | 121, 141, 151, 259, 270, 338, 354, 361 |
| `client/src/pages/Landing.jsx` | 267 |
| `client/src/pages/AutoMining.jsx` | 79, 87, 136, 174, 179 |

**Fix:** Add cleanup in useEffect return

---

### 10. Race Condition - Game2048 Page

**File:** `client/src/pages/Game2048Page.jsx`
**Lines:** 215-250

- Retry timeout fires after unmount causes state update on unmounted component
  **Fix:** Track mounted state, cancel on unmount

---

## Medium (Backlog)

### 11. Empty catch Blocks - Client

**Files:**
| File | Line |
|------|------|
| `client/src/pages/Wallet.jsx` | 279, 632 |
| `client/src/pages/Dashboard.jsx` | 60 |
| `client/src/pages/AdminUsers.jsx` | 100, 534 |
| `client/src/pages/AdminAnalytics.jsx` | 100 |

**Fix:** Add proper error logging or user feedback

---

### 12. Empty Dependency Arrays - useEffect

**Files:**
| File | Line |
|------|------|
| `client/src/pages/AdminTransparency.jsx` | 118 |
| `client/src/pages/AdminBroadcast.jsx` | 24 |
| `client/src/pages/AdminBanners.jsx` | 206 |

**Fix:** Add dependencies or use useCallback

---

### 13. Duplicate className - Syntax Error

**File:** `client/src/pages/Faucet.jsx`
**Line:** 148

```javascript
className="something" className="something-else" // Duplicate!
```

**Fix:** Fix syntax

---

### 14. Missing Validation - Deposits Cron API Response

**File:** `server/cron/depositsCron.js`
**Lines:** 67-72

- No defensive coding for malformed API response
  **Fix:** Add response validation

---

### 15. Interval Timer Not Cleaned Up

**File:** `server/cron/gamePowerCleanup.js`
**Lines:** 11, 61

- No stop function exists
  **Fix:** Add stopGamePowerCleanup()

---

### 16. Inconsistent Error Handling - Withdrawals Cron

**File:** `server/cron/withdrawalsCron.js`
**Lines:** 86-88, 22-25, 30-33

- Three different patterns in one file
  **Fix:** Standardize error handling

---

### 17. Promise.allSettled Silent Failures

**File:** `server/cron/miningCron.js`
**Lines:** 67-73

```javascript
await Promise.allSettled(saves); // All errors suppressed!
```

**Fix:** Check results for rejections

---

## Low (Nice to Fix)

### 18. Syntax Warnings - Browser Scripts

**Files:** `LiveDashboard/script.js`

- `'document' is not defined` warnings
  **Fix:** Add ESLint globals for browser

---

### 19. Mixed Import Styles

**File:** `server/cron/autoMiningGpuCron.js`

- Uses CommonJS `require()` in ESM project
  **Fix:** Migrate to ES imports

---

### 20. Hardcoded Values

**File:** `server/cron/securityArtifactCleanupCron.js`
**Lines:** 17-18

- Hardcoded defaults instead of required env vars
  **Fix:** Require env vars in production

---

### 21. Stale Timer Reference

**File:** `server/cron/miningCron.js`
**Lines:** 67-73

- No backpressure if persistence takes longer than interval
  **Fix:** Add backpressure handling

---

### 22. Configuration Typo Risk

**File:** `server/cron/depositsCron.js`
**Line:** 12

```javascript
process.env.ETHERSCAN_API_KEY || process.env.POLYGONSCAN_API_KEY;
```

- Confusion between Ethereum and Polygon keys
  **Fix:** Use specific POLYGONSCAN key only

---

## Schema Issues

### 23. Payout.amountPol - Float Type

**File:** `server/prisma/schema.prisma`
**Line:** 558

```prisma
amountPol Float @map("amount_pol") // WRONG - use Decimal!
```

**Fix:** Change to `Decimal @db.Decimal(20, 8)`

---

### 24. User.referredBy - Missing Index

**File:** `server/prisma/schema.prisma`
**Line:** 25

```prisma
referredBy Int? @map("referred_by") // No index!
```

**Fix:** Add `@@index([referredBy])`

---

### 25. Transaction - Missing Compound Index

**File:** `server/prisma/schema.prisma`
**Lines:** 454-479

```prisma
@@index([status, createdAt]) // Missing!
```

**Fix:** Add compound index for common queries

---

### 26. Notification - Missing Composite Index

**File:** `server/prisma/schema.prisma`
**Lines:** 263-277

```prisma
@@index([userId, isRead]) // Missing!
```

**Fix:** Add composite index

---

### 27. AuditLog - Missing createdAt Index

**File:** `server/prisma/schema.prisma`
**Lines:** 570-583

```prisma
@@index([createdAt]) // Missing!
```

**Fix:** Add for time-based cleanup queries

---

### 28. ReferralEarning - Missing createdAt Index

**File:** `server/prisma/schema.prisma`
**Lines:** 1221-1233

```prisma
@@index([createdAt]) // Missing!
```

**Fix:** Add for reporting queries

---

### 29. PrivateMessage - Missing Index

**File:** `server/prisma/schema.prisma`
**Lines:** 1193-1207

```prisma
@@index([receiverId, isRead]) // Missing!
```

**Fix:** Add for unread message queries

---

### 30. ChatMessage - Missing Reply Index

**File:** `server/prisma/schema.prisma`
**Lines:** 1177-1191

```prisma
@@index([replyToId]) // Missing!
```

**Fix:** Add for thread retrieval

---

### 31. Referral - Missing Index

**File:** `server/prisma/schema.prisma`
**Lines:** 1209-1219

```prisma
@@index([referrerId]) // Missing!
```

**Fix:** Add for "users referred by X" queries

---

### 32. DailyCheckin - Missing Default

**File:** `server/prisma/schema.prisma`
**Line:** 723

```prisma
chainId Int // No default!
```

**Fix:** Add `@default(137)`

---

### 33. Balance Fields Can Go Negative

**File:** `server/prisma/schema.prisma`
**Lines:** 29-36

```prisma
polBalance Decimal @default(0) // No check constraint!
```

**Fix:** Add database check constraint

---

## Test Status

### Test Summary

```
# tests 332
# suites 44
# pass 332
# fail 0
# skipped 0
```

**Status:** All tests passing ✅

### ESLint Warnings (Non-blocking)

- Browser scripts - expected false positives
- Legacy CommonJS files - expected false positives
- No errors found

---

## Recommended Priority

### Sprint 1 (This Week)

1. Fix error swallowing in `depositsCron.js`
2. Fix rate limit middleware race condition
3. Add input validation in `vaultController.js`
4. Add DB connection health check to cron jobs
5. Add circuit breaker to cron jobs

### Sprint 2

6. Fix cron job race conditions (withdrawals, action runner)
7. Fix memory leaks in client pages
8. Add proper error handling to all catch blocks
9. Fix duplicate className syntax error
10. Add circuit breaker to BLK reward cycle

### Backlog

- Schema migrations (Payout.amountPol to Decimal)
- Add missing indexes (referredBy, createdAt, etc.)
- Standardize error handling patterns
- Add proper cleanup functions

---

## Files Modified in This Report

### Server

- `server/cron/depositsCron.js`
- `server/cron/withdrawalsCron.js`
- `server/cron/cronActionRunner.js`
- `server/cron blkRewardCycleCron.js`
- `server/cron/gamePowerCleanupCron.js`
- `server/cron/miningCron.js`
- `server/cron/autoMiningGpuCron.js`
- `server/cron/securityArtifactCleanupCron.js`
- `server/middleware/distributedRateLimit.js`
- `server/controllers/checkinController.js`
- `server/controllers/vaultController.js`
- `server/prisma/schema.prisma`

### Client

- `client/src/pages/Games.jsx`
- `client/src/pages/Landing.jsx`
- `client/src/pages/AutoMining.jsx`
- `client/src/pages/Game2048Page.jsx`
- `client/src/pages/Wallet.jsx`
- `client/src/pages/Dashboard.jsx`
- `client/src/pages/AdminUsers.jsx`
- `client/src/pages/AdminAnalytics.jsx`
- `client/src/pages/AdminTransparency.jsx`
- `client/src/pages/AdminBroadcast.jsx`
- `client/src/pages/AdminBanners.jsx`
- `client/src/pages/Faucet.jsx`
- `LiveDashboard/script.js`

---

_End of Report_

---

## Follow-up (Cursor — 2026-04-16)

Partial Sprint 1 fixes applied in code (no Prisma migrations):

| # | Item | Change |
|---|------|--------|
| 1 | Deposits cron silent errors | `logger.warn` / `logger.error` on hot-wallet parse, `createDepositRequest`, and `scanForNewDeposits` rejects |
| 2 | Distributed rate limit async race | Middleware is now `async` and awaits sliding window before `next()`; warn + in-memory fallback on failure |
| 3 | Vault `vaultId` / `slotIndex` | Explicit `Number.isFinite` + safe read from `req.body` |
| 4 | Check-in fire-and-forget | `checkinLog.warn` on failed side-effect promises |
| 13 | Faucet duplicate `italic` | Removed duplicate class |

**Not done here (needs your go-ahead or larger scope):** Prisma schema / indexes / `Decimal`, withdrawal locking, Redis locks for `cronActionRunner`, full client interval audit, DB reconnect strategy (#5).
