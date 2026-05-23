import crypto from "crypto";
import jwt from "jsonwebtoken";
import { isSmtpConfigured, sendLoginTwoFactorCodeEmail, sendWithdrawalTwoFactorCodeEmail } from "../utils/mailer.js";

const PURPOSE_LOGIN = "email-2fa";
const PURPOSE_WITHDRAWAL = "email-2fa-withdrawal";
const EMAIL_2FA_CODE_LEN = 6;
const EMAIL_2FA_CODE_TTL_MINUTES = Math.max(1, Number(process.env.EMAIL_2FA_CODE_TTL_MINUTES || 10));

type Email2faJwtPayload = {
  sub?: string;
  typ?: string;
  cid?: string;
  cch?: string;
};

function isEmail2faJwtVerified(v: unknown): v is Email2faJwtPayload {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

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

async function issueChallenge(
  { userId, email, name }: { userId: number; email: string; name?: string | null },
  purpose: string,
  sendEmail: (params: { to: string; name?: string | null; code: string; ttlMinutes: number }) => Promise<void>,
) {
  if (!isSmtpConfigured()) {
    return { ok: false, reason: "SMTP_UNAVAILABLE" };
  }

  const challengeId = crypto.randomUUID();
  const code = createNumericCode();
  const codeHash = hashChallengeCode(challengeId, code);
  const secret = requireJwtSecret();

  const challengeToken = jwt.sign(
    { sub: String(userId), typ: purpose, cid: challengeId, cch: codeHash },
    secret,
    {
      expiresIn: `${EMAIL_2FA_CODE_TTL_MINUTES}m`,
      issuer: process.env.JWT_ISSUER || "blockminer",
      audience: process.env.JWT_AUDIENCE || "blockminer.app",
    },
  );

  await sendEmail({ to: email, name, code, ttlMinutes: EMAIL_2FA_CODE_TTL_MINUTES });

  return { ok: true, challengeToken, ttlMinutes: EMAIL_2FA_CODE_TTL_MINUTES };
}

function verifyChallenge(
  { challengeToken, code, userId }: { challengeToken?: string; code?: string; userId: number },
  expectedPurpose: string,
) {
  const submittedCode = String(code || "").trim();
  if (!challengeToken || !submittedCode) {
    return { ok: false, reason: "MISSING_INPUT" };
  }
  if (!/^\d{6}$/.test(submittedCode)) {
    return { ok: false, reason: "INVALID_FORMAT" };
  }

  try {
    const secret = requireJwtSecret();
    const verified = jwt.verify(challengeToken, secret, {
      issuer: process.env.JWT_ISSUER || "blockminer",
      audience: process.env.JWT_AUDIENCE || "blockminer.app",
    });
    if (typeof verified === "string" || !isEmail2faJwtVerified(verified)) {
      return { ok: false, reason: "INVALID_OR_EXPIRED" };
    }
    const payload = verified;

    if (payload.typ !== expectedPurpose) {
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
  } catch (err: unknown) {
    if (err instanceof jwt.JsonWebTokenError && err.name === "TokenExpiredError") {
      return { ok: false, reason: "EXPIRED" };
    }
    return { ok: false, reason: "INVALID_OR_EXPIRED" };
  }
}

/**
 * @param {{ userId: number; email: string; name?: string | null }} params
 */
export async function issueEmailTwoFactorChallenge({ userId, email, name }) {
  return issueChallenge({ userId, email, name }, PURPOSE_LOGIN, sendLoginTwoFactorCodeEmail);
}

/**
 * @param {{ challengeToken?: string; code?: string; userId: number }} params
 */
export function verifyEmailTwoFactorChallenge({ challengeToken, code, userId }) {
  return verifyChallenge({ challengeToken, code, userId }, PURPOSE_LOGIN);
}

/**
 * @param {{ userId: number; email: string; name?: string | null }} params
 */
export async function issueWithdrawalTwoFactorChallenge({ userId, email, name }) {
  return issueChallenge({ userId, email, name }, PURPOSE_WITHDRAWAL, sendWithdrawalTwoFactorCodeEmail);
}

/**
 * @param {{ challengeToken?: string; code?: string; userId: number }} params
 */
export function verifyWithdrawalTwoFactorChallenge({ challengeToken, code, userId }) {
  return verifyChallenge({ challengeToken, code, userId }, PURPOSE_WITHDRAWAL);
}
