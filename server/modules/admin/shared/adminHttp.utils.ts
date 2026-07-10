import path from "path";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";
import crypto from "crypto";
import multer from "multer";
import { createRateLimiter } from "../../../middleware/rateLimit.js";
import loggerLib from "../../../utils/logger.js";
import { resolveUploadsRoot } from "../../../utils/uploadsRoot.js";


function adminErrMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function queryPositiveInt(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const raw = Array.isArray(v) ? v[0] : v;
  const s = typeof raw === "string" || typeof raw === "number" ? String(raw).trim() : "";
  if (!/^\d{1,12}$/.test(s)) return undefined;
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n < 1) return undefined;
  return n;
}



/**
 * @returns {number | null}
 */
function parseStrictPositiveUserId(raw: unknown): number | null {
  const s = String(raw ?? "").trim();
  if (!/^\d{1,12}$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n < 1) return null;
  return n;
}

/**
 * @returns {number | null} null if invalid
 */
function parseStrictQuantity(raw: unknown, fallback: number, max: number): number | null {
  if (raw === undefined || raw === null || raw === "") {
    return Math.min(max, Math.max(1, fallback));
  }
  const s = String(raw).trim();
  if (!/^\d{1,3}$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1) return null;
  return Math.min(max, Math.max(1, n));
}

const backupLogger = loggerLib.child("AdminBackup");
const adminAuditListLogger = loggerLib.child("AdminAuditList");

const adminLimiter = createRateLimiter({
    windowMs: 1 * 60 * 1000,
    max: 100
});

// Multer — salva em /app/uploads (docker) ou ./uploads (dev)
const UPLOADS_DIR = resolveUploadsRoot(path.dirname(fileURLToPath(import.meta.url)));
// Garante que o diretório existe na inicialização (síncrono, sem risco de race condition no multer)
mkdirSync(UPLOADS_DIR, { recursive: true });
const sharedStorage = multer.diskStorage({
    destination: (_req, _file, cb) => { cb(null, UPLOADS_DIR); },
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.bin';
        cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    }
});
const upload = multer({
    storage: sharedStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter: (_req, file, cb) => {
        if (/^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)) cb(null, true);
        else cb(new Error('Somente imagens são permitidas.'));
    }
});
const uploadMedia = multer({
    storage: sharedStorage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
    fileFilter: (_req, file, cb) => {
        const allowed = /^(image\/(jpeg|png|gif|webp)|video\/(mp4|webm|ogg|quicktime|x-msvideo))$/;
        if (allowed.test(file.mimetype)) cb(null, true);
        else cb(new Error('Formato não suportado. Use imagens (PNG, JPG, GIF, WebP) ou vídeos (MP4, WebM).'));
    }
});
export {
  adminErrMessage,
  queryPositiveInt,
  parseStrictPositiveUserId,
  parseStrictQuantity,
  backupLogger,
  adminAuditListLogger,
  adminLimiter,
  upload,
  uploadMedia,
};
