import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { createDistributedRateLimiter } from "../middleware/distributedRateLimit.js";
import { requireCriticalIdempotency } from "../middleware/criticalIdempotency.js";
import { validateBody } from "../middleware/validate.js";
import { getRequestIp } from "../utils/clientIp.js";
import { getVault, moveToVault, retrieveFromVault } from "../controllers/vaultController.js";
import { moveToVaultBodySchema, retrieveFromVaultBodySchema } from "../utils/vaultSchemas.js";

const router = express.Router();

router.use(requireAuth);

const vaultWriteLimiter = createDistributedRateLimiter({
  windowMs: 60_000,
  max: 40,
  name: "vault_write",
  keyGenerator: (req) => `ip:${getRequestIp(req)}`,
  secondaryKeyGenerator: (req) => (req.user?.id ? `uid:${req.user.id}` : null),
});

router.get("/", getVault);
router.post(
  "/move-to-vault",
  vaultWriteLimiter,
  validateBody(moveToVaultBodySchema),
  requireCriticalIdempotency({ scope: "vault_move" }),
  moveToVault,
);
router.post(
  "/retrieve-from-vault",
  vaultWriteLimiter,
  validateBody(retrieveFromVaultBodySchema),
  requireCriticalIdempotency({ scope: "vault_retrieve" }),
  retrieveFromVault,
);

export default router;
