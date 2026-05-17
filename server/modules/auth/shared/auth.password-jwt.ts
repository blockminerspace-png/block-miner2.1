import jwt from "jsonwebtoken";
import type { JwtPayload, SignOptions } from "jsonwebtoken";
import { JWT_AUDIENCE, JWT_ISSUER, PASSWORD_RESET_TOKEN_TTL } from "./auth.constants.js";

export function signPasswordResetToken(userId: number): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is required.");
  }

  const payload: JwtPayload & { typ: string } = { sub: String(userId), typ: "pwd_reset" };
  const signOptions: SignOptions = {
    expiresIn: PASSWORD_RESET_TOKEN_TTL as SignOptions["expiresIn"],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  };
  return jwt.sign(payload, secret, signOptions);
}

export function verifyPasswordResetToken(token: unknown): (JwtPayload & { typ?: string }) | null {
  try {
    if (!process.env.JWT_SECRET) return null;
    const raw = jwt.verify(String(token), process.env.JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    if (typeof raw === "string") return null;
    const payload = raw as JwtPayload & { typ?: string };
    if (payload.typ !== "pwd_reset") return null;
    return payload;
  } catch {
    return null;
  }
}
