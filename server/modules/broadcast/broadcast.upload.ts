import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import { resolveUploadsSubdir } from "../../utils/uploadsRoot.js";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = resolveUploadsSubdir(MODULE_DIR, "broadcast");

export const BROADCAST_IMAGE_FIELD = "image";
export const BROADCAST_PUBLIC_PREFIX = "/uploads/broadcast";
export const BROADCAST_MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

const MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

export function buildBroadcastImageUrl(filename: string): string {
  return `${BROADCAST_PUBLIC_PREFIX}/${path.basename(filename)}`;
}

export const broadcastImageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = MIME_EXT[file.mimetype] || ".bin";
      cb(null, `bc-${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
    },
  }),
  limits: { fileSize: BROADCAST_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) cb(null, true);
    else cb(new Error("Formato não suportado. Use JPG, PNG, WebP ou GIF."));
  },
});
