import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import { resolveUploadsSubdir } from "../../utils/uploadsRoot.js";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const MINERS_UPLOAD_DIR = resolveUploadsSubdir(MODULE_DIR, "miners");

export const ADMIN_MINER_IMAGE_FIELD = "image";
export const ADMIN_MINER_UPLOAD_PUBLIC_PREFIX = "/uploads/miners";
export const ADMIN_MINER_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ADMIN_MINER_ALLOWED_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

const MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export function resolveMinersUploadDir(): string {
  return MINERS_UPLOAD_DIR;
}

export function buildMinerUploadPublicUrl(filename: string): string {
  const safe = path.basename(filename);
  return `${ADMIN_MINER_UPLOAD_PUBLIC_PREFIX}/${safe}`;
}

export const uploadAdminMinerImageMiddleware = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, MINERS_UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = MIME_EXT[file.mimetype] || ".bin";
      cb(null, `miner-${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
    },
  }),
  limits: { fileSize: ADMIN_MINER_MAX_IMAGE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ADMIN_MINER_ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) cb(null, true);
    else cb(new Error("Formato não suportado. Use JPG, PNG ou WebP."));
  },
});
