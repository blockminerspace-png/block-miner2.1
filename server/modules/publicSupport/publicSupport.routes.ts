import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { createRateLimiter } from "../../middleware/rateLimit.js";
import { resolveUploadsRoot } from "../../utils/uploadsRoot.js";
import * as ctrl from "./publicSupport.controller.js";

export const publicSupportRouter = Router();

const readLimiter = createRateLimiter({ windowMs: 60_000, max: 30 });
const writeLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });
const uploadLimiter = createRateLimiter({ windowMs: 60_000, max: 5 });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = resolveUploadsRoot(__dirname);
mkdirSync(UPLOADS_DIR, { recursive: true });

const psImageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "") || ".bin";
    cb(null, `ps-${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`);
  },
});

const psImageUpload = multer({
  storage: psImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPEG, PNG, GIF, and WebP images are allowed."));
  },
});

publicSupportRouter.post(
  "/upload-image",
  uploadLimiter,
  psImageUpload.single("image"),
  (req: Request, res: Response) => {
    if (!req.file) return res.status(400).json({ error: "no_file" });
    res.json({ ok: true, url: `/uploads/${req.file.filename}` });
  }
);

publicSupportRouter.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const msg = err instanceof Error ? err.message : "Upload error";
  res.status(400).json({ error: msg });
});

publicSupportRouter.post("/ticket", writeLimiter, ctrl.createTicket);
publicSupportRouter.get("/tickets", readLimiter, ctrl.listTicketsByEmail);
publicSupportRouter.get("/ticket/:id", readLimiter, ctrl.getTicket);
publicSupportRouter.post("/ticket/:id/message", writeLimiter, ctrl.addGuestMessage);
