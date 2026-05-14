import crypto from "node:crypto";
import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";

const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || "12h";
const REFRESH_TOKEN_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);
const JWT_ISSUER = process.env.JWT_ISSUER || "blockminer";
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || "blockminer.app";
const JWT_SECRET = process.env.JWT_SECRET;

function requireJwtSecret(): string {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is required. Please set it in your .env file.");
  }
  return JWT_SECRET;
}

export type AccessTokenUser = {
  id: number | string;
  name?: string | null;
  email?: string | null;
};

export function signAccessToken(user: AccessTokenUser): string {
  const payload: JwtPayload = {
    sub: String(user.id),
    name: user.name ?? undefined,
    email: user.email ?? undefined,
  };

  const signOptions = {
    expiresIn: ACCESS_TOKEN_TTL,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  } as SignOptions;

  return jwt.sign(payload, requireJwtSecret(), signOptions);
}

export function verifyAccessToken(token: string): JwtPayload | string | null {
  try {
    return jwt.verify(token, requireJwtSecret(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as JwtPayload | string;
  } catch {
    return null;
  }
}

function hashRefreshSecret(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

export type RefreshTokenBundle = {
  token: string;
  tokenId: string;
  tokenHash: string;
  expiresAt: number;
};

export function createRefreshToken(): RefreshTokenBundle {
  const tokenId = crypto.randomUUID();
  const secret = crypto.randomBytes(48).toString("hex");
  const token = `${tokenId}.${secret}`;
  const expiresAt = Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

  return {
    token,
    tokenId,
    tokenHash: hashRefreshSecret(secret),
    expiresAt,
  };
}

export type ParsedRefreshToken = {
  tokenId: string;
  secret: string;
  tokenHash: string;
} | null;

export function parseRefreshToken(rawToken: unknown): ParsedRefreshToken {
  if (!rawToken || typeof rawToken !== "string") {
    return null;
  }

  const parts = rawToken.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [tokenId, secret] = parts;
  if (!tokenId || !secret) {
    return null;
  }

  return {
    tokenId,
    secret,
    tokenHash: hashRefreshSecret(secret),
  };
}

export { ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL_DAYS };
