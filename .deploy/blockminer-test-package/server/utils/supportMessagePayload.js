/**
 * Support ticket message encoding: optional image attachments without extra DB columns.
 * Legacy rows are plain text; new rows may use a versioned JSON prefix.
 */

const PAYLOAD_PREFIX = "__BM_SPT1__\n";
const MAX_ATTACHMENTS = 5;
const MAX_URL_LENGTH = 512;
const MAX_BODY_LENGTH = 12000;

/**
 * Returns true if the URL is a safe relative path to our uploads directory.
 * @param {string} url
 * @returns {boolean}
 */
export function isAllowedUploadUrl(url) {
  const u = String(url || "").trim();
  if (!u.startsWith("/uploads/")) return false;
  if (u.includes("..") || u.includes("\\")) return false;
  if (u.length > MAX_URL_LENGTH) return false;
  return true;
}

/**
 * @param {unknown} attachment
 * @returns {{ url: string, mimeType?: string } | null}
 */
function sanitizeAttachment(attachment) {
  if (!attachment || typeof attachment !== "object") return null;
  const url = typeof attachment.url === "string" ? attachment.url.trim() : "";
  if (!isAllowedUploadUrl(url)) return null;
  const mimeType =
    typeof attachment.mimeType === "string" ? attachment.mimeType.trim().slice(0, 120) : undefined;
  return mimeType ? { url, mimeType } : { url };
}

/**
 * @param {string} body
 * @param {Array<{ url: string, mimeType?: string }>} attachments
 * @returns {string}
 */
export function serializeSupportPayload(body, attachments = []) {
  const trimmed = String(body ?? "").slice(0, MAX_BODY_LENGTH).trimEnd();
  const list = Array.isArray(attachments) ? attachments.slice(0, MAX_ATTACHMENTS) : [];
  const safe = list.map(sanitizeAttachment).filter(Boolean);
  if (safe.length === 0) return trimmed;
  return PAYLOAD_PREFIX + JSON.stringify({ v: 1, body: trimmed, attachments: safe });
}

/**
 * @param {string | null | undefined} raw
 * @returns {{ body: string, attachments: Array<{ url: string, mimeType?: string }> }}
 */
export function parseSupportPayload(raw) {
  const s = String(raw ?? "");
  if (!s.startsWith(PAYLOAD_PREFIX)) {
    return { body: s, attachments: [] };
  }
  try {
    const data = JSON.parse(s.slice(PAYLOAD_PREFIX.length));
    if (data?.v !== 1 || typeof data.body !== "string") {
      return { body: s, attachments: [] };
    }
    const attachments = Array.isArray(data.attachments)
      ? data.attachments.map(sanitizeAttachment).filter(Boolean)
      : [];
    return { body: data.body.slice(0, MAX_BODY_LENGTH), attachments };
  } catch {
    return { body: s, attachments: [] };
  }
}
