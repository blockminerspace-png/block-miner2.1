import crypto from "crypto";

const ALGO = "aes-256-gcm";

/**
 * @returns {Buffer | null}
 */
export function getStreamEncryptionKeyBuffer() {
  const hex = String(process.env.STREAM_ENCRYPTION_KEY || "").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return null;
  return Buffer.from(hex, "hex");
}

/**
 * @param {string | null | undefined} plain
 * @returns {string | null}
 */
export function encryptStreamSecret(plain) {
  const key = getStreamEncryptionKeyBuffer();
  if (!key || plain == null || String(plain).length === 0) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

/**
 * @param {string | null | undefined} blob
 * @returns {string | null}
 */
export function decryptStreamSecret(blob) {
  const key = getStreamEncryptionKeyBuffer();
  if (!key || !blob) return null;
  try {
    const raw = Buffer.from(String(blob), "base64");
    if (raw.length < 12 + 16) return null;
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const data = raw.subarray(28);
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function isStreamEncryptionConfigured() {
  return getStreamEncryptionKeyBuffer() !== null;
}
