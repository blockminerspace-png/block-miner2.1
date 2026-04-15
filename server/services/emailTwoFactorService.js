import crypto from "crypto";
import jwt from "jsonwebtoken";
import { isSmtpConfigured, sendLoginTwoFactorCodeEmail } from "../utils/mailer.js";

const EMAIL_2FA_TOKEN_PURPOSE = "email-2fa";
const EMAIL_2FA_CODE_LEN = 6;
const EMAIL_2FA_CODE_TTL_MINUTES = Math.max(1, Number(process.env.EMAIL_2FA_CODE_TTL_MINUTES || 10));

function requireJwtSecret() {
  const secret = String(process.env.JWT_SECRET || "");
  if (!secret) {
    throw new Error("JWT_SECRET is required for email 2FA.");
  }
  return secret;
}

function hashChallengeCode(challengeId, code) {
  return crypto.createHash("sha256").update(`${challengeId}:${code}`).digest("hex");
}

function createNumericCode() {
  const max = 10 ** EMAIL_2FA_CODE_LEN;
  return String(crypto.randomInt(0, max)).padStart(EMAIL_2FA_CODE_LEN, "0");
}

/**
 * @param {{ userId: number; email: string; name?: string | null }} params
 */
export async function issueEmailTwoFactorChallenge({ userId, email, name }) {
  if (!isSmtpConfigured()) {
    return { ok: false, reason: "SMTP_UNAVAILABLE" };
  }

  const challengeId = crypto.randomUUID();
  const code = createNumericCode();
  const codeHash = hashChallengeCode(challengeId, code);
  const secret = requireJwtSecret();

  const challengeToken = jwt.sign(
    { sub: String(userId), typ: EMAIL_2FA_TOKEN_PURPOSE, cid: challengeId, cch: codeHash },
    secret,
    {
      expiresIn: `${EMAIL_2FA_CODE_TTL_MINUTES}m`,
      issuer: process.env.JWT_ISSUER || "blockminer",
      audience: process.env.JWT_AUDIENCE || "blockminer.app",
    },
  );

  await sendLoginTwoFactorCodeEmail({
    to: email,
    name: name || "Miner",
    code,
    ttlMinutes: EMAIL_2FA_CODE_TTL_MINUTES,
  });

  return { ok: true, challengeToken, ttlMinutes: EMAIL_2FA_CODE_TTL_MINUTES };
}

/**
 * @param {{ challengeToken?: string; code?: string; userId: number }} params
 */
export function verifyEmailTwoFactorChallenge({ challengeToken, code, userId }) {
  const submittedCode = String(code || "").trim();
  if (!challengeToken || !submittedCode) {
    return { ok: false, reason: "MISSING_INPUT" };
  }
  if (!/^\d{6}$/.test(submittedCode)) {
    return { ok: false, reason: "INVALID_FORMAT" };
  }

  try {
    const secret = requireJwtSecret();
    const payload = jwt.verify(challengeToken, secret, {
      issuer: process.env.JWT_ISSUER || "blockminer",
      audience: process.env.JWT_AUDIENCE || "blockminer.app",
    });

    if (payload?.typ !== EMAIL_2FA_TOKEN_PURPOSE) {
      return { ok: false, reason: "INVALID_TYPE" };
    }
    if (String(payload?.sub || "") !== String(userId)) {
      return { ok: false, reason: "USER_MISMATCH" };
    }

    const expectedHash = hashChallengeCode(String(payload?.cid || ""), submittedCode);
    const provided = Buffer.from(String(payload?.cch || ""), "utf8");
    const expected = Buffer.from(expectedHash, "utf8");
    if (provided.length !== expected.length) {
      return { ok: false, reason: "INVALID_CODE" };
    }
    if (!crypto.timingSafeEqual(provided, expected)) {
      return { ok: false, reason: "INVALID_CODE" };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "INVALID_OR_EXPIRED" };
  }
}
