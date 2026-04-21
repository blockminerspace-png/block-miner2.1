import express from "express";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";
import * as supportController from "../controllers/supportController.js";
import { requireAuth, authenticateTokenOptional } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import { requireVisibleSidebarPath } from "../middleware/sidebarFeatureGate.js";
import { SIDEBAR_ITEM_REGISTRY } from "../services/sidebarNavRegistry.js";

const supportRouter = express.Router();
const supportPath = SIDEBAR_ITEM_REGISTRY.support.path;

const supportLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5
});

const supportUploadLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, "../../uploads"));
mkdirSync(UPLOADS_DIR, { recursive: true });

const supportImageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "") || ".bin";
    cb(null, `support-${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`);
  }
});

const supportImageUpload = multer({
  storage: supportImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPEG, PNG, GIF, and WebP images are allowed."));
  }
});

supportRouter.post("/", requireVisibleSidebarPath(supportPath), supportLimiter, authenticateTokenOptional, supportController.createMessage);
supportRouter.get("/", requireAuth, requireVisibleSidebarPath(supportPath), supportController.listMessages);
supportRouter.post(
  "/upload-image",
  supportUploadLimiter,
  requireAuth,
  requireVisibleSidebarPath(supportPath),
  supportImageUpload.single("image"),
  supportController.uploadSupportImage
);
supportRouter.get("/:id", requireAuth, requireVisibleSidebarPath(supportPath), supportController.getMessage);
supportRouter.post("/:id/reply", supportLimiter, requireAuth, requireVisibleSidebarPath(supportPath), supportController.replyToMessage);

supportRouter.use((err, _req, res, _next) => {
  if (err?.message) return res.status(400).json({ ok: false, message: err.message });
  res.status(500).json({ ok: false, message: "Upload error" });
});

export default supportRouter;
