/**
 * Shop idempotency is implemented via `idempotencyService.js` (Redis when available).
 * This module keeps stable imports for normalization and test resets.
 */

export { normalizeIdempotencyKey as normalizeShopIdempotencyKey } from "../utils/normalizeIdempotencyKey.js";
import { __resetIdempotencyMemoryForTests } from "./idempotencyService.js";

export const __resetShopIdempotencyStoreForTests = __resetIdempotencyMemoryForTests;
