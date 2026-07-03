import express from "express";
import { createDistributedRateLimiter } from "../../middleware/distributedRateLimit.js";
import { validateBody } from "../../middleware/validate.js";
import { registerBodySchema } from "../../validation/registerBodySchema.js";
import { requireTurnstileWhenConfigured } from "../../middleware/turnstile.js";
import { requireAuth } from "../../middleware/auth.js";
import { getRequestIp } from "../../utils/clientIp.js";
import { loginSchema } from "./login/login.schemas.js";
import { changePasswordSchema } from "./auth.schemas.js";
import { loginPost } from "./login/login.controller.js";
import { registerPost } from "./register/register.controller.js";
import { getSession, logoutPost, markAdblockPost } from "./session/session.controller.js";
import { refreshPost } from "./session/refresh.controller.js";
import * as AuthCtrl from "./auth.controller.js";

export const authRouter = express.Router();

const authLimiter = createDistributedRateLimiter({
  windowMs: 60_000,
  max: 24,
  name: "auth_login_ip",
  keyGenerator: (req) => `ip:${getRequestIp(req)}`,
});

const passwordResetCompleteLimiter = createDistributedRateLimiter({
  windowMs: 15 * 60_000,
  max: 10,
  name: "auth_pwd_reset_complete_ip",
  keyGenerator: (req) => `ip:${getRequestIp(req)}`,
});

const adminManualPasswordResetLimiter = createDistributedRateLimiter({
  windowMs: 15 * 60_000,
  max: 8,
  name: "auth_admin_pwd_reset_ip",
  keyGenerator: (req) => `ip:${getRequestIp(req)}`,
});

authRouter.post(
  "/register",
  authLimiter,
  validateBody(registerBodySchema),
  requireTurnstileWhenConfigured({ purpose: "register" }),
  registerPost,
);

authRouter.post(
  "/login",
  authLimiter,
  validateBody(loginSchema),
  requireTurnstileWhenConfigured({ purpose: "login" }),
  loginPost,
);

authRouter.get("/session", getSession);

authRouter.post("/refresh", refreshPost);

authRouter.post("/logout", logoutPost);

authRouter.post("/mark-adblock", requireAuth, markAdblockPost);

authRouter.post("/legacy-password-reset", passwordResetCompleteLimiter, AuthCtrl.legacyPasswordResetPost);

authRouter.post("/reset-password-manual", adminManualPasswordResetLimiter, AuthCtrl.resetPasswordManualPost);

authRouter.post("/forgot-password", authLimiter, AuthCtrl.forgotPasswordPost);

authRouter.post("/admin/force-password-reset", adminManualPasswordResetLimiter, AuthCtrl.adminForcePasswordResetPost);

authRouter.post(
  "/change-password",
  requireAuth,
  validateBody(changePasswordSchema),
  AuthCtrl.changePasswordPost,
);
