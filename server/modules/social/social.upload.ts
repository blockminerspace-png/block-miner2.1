import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import { resolveUploadsSubdir } from "../../utils/uploadsRoot.js";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const CHANNEL_PHOTOS_DIR = resolveUploadsSubdir(MODULE_DIR, "channel-photos");

export const CHANNEL_PHOTO_FIELD = "photo";
export const CHANNEL_PHOTO_PUBLIC_PREFIX = "/uploads/channel-photos";
export const CHANNEL_PHOTO_MAX_BYTES = 3 * 1024 * 1024; // 3 MB
export const CHANNEL_PHOTO_ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

export function buildChannelPhotoPublicUrl(filename: string): string {
  return `${CHANNEL_PHOTO_PUBLIC_PREFIX}/${path.basename(filename)}`;
}

export const uploadChannelPhotoMiddleware = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, CHANNEL_PHOTOS_DIR),
    filename: (_req, file, cb) => {
      const ext = MIME_EXT[file.mimetype] || ".bin";
      cb(null, `channel-${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
    },
  }),
  limits: { fileSize: CHANNEL_PHOTO_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (CHANNEL_PHOTO_ALLOWED_MIMES.has(file.mimetype)) cb(null, true);
    else cb(new Error("Formato inválido. Use JPG, PNG, WebP ou GIF."));
  },
});
