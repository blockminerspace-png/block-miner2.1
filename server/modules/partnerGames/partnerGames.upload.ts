import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import { resolveUploadsSubdir } from "../../utils/uploadsRoot.js";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = resolveUploadsSubdir(MODULE_DIR, "partner-games");

export const PARTNER_GAME_COVER_FIELD = "cover";
export const PARTNER_GAME_PUBLIC_PREFIX = "/uploads/partner-games";
export const PARTNER_GAME_MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

const MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

export function buildPartnerGameCoverUrl(filename: string): string {
  return `${PARTNER_GAME_PUBLIC_PREFIX}/${path.basename(filename)}`;
}

export const partnerGameCoverUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = MIME_EXT[file.mimetype] || ".bin";
      cb(null, `pg-${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
    },
  }),
  limits: { fileSize: PARTNER_GAME_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) cb(null, true);
    else cb(new Error("Formato não suportado. Use JPG, PNG, WebP ou GIF."));
  },
});
