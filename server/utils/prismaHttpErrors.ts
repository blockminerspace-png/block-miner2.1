import type { Response } from "express";
import { readErrorMessage } from "../controllers/controllerHttpStatusError.js";

export function unknownErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "");
}

export function prismaErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

/** Pool saturation, PG down, or adapter connection timeout (default 10s). */
export function isPrismaConnectionError(error: unknown): boolean {
  const code = prismaErrorCode(error);
  if (code === "P1001" || code === "P1002" || code === "P1008" || code === "P1017") return true;
  const msg = unknownErrorMessage(error).toLowerCase();
  return (
    msg.includes("timeout exceeded when trying to connect") ||
    msg.includes("connection terminated") ||
    msg.includes("too many clients") ||
    msg.includes("pool is full") ||
    msg.includes("econnrefused") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("can't reach database server")
  );
}

/** Prisma client vs DB drift (missing column/table). */
export function isPrismaSchemaMismatch(error: unknown): boolean {
  const code = prismaErrorCode(error);
  if (code === "P2021" || code === "P2022") return true;
  return /does not exist in the current database/i.test(unknownErrorMessage(error));
}

export type PrismaAwareErrorBody = {
  ok: false;
  code: string;
  message: string;
  error: string;
};

export function buildPrismaAwareErrorBody(error: unknown, fallbackMessage: string): PrismaAwareErrorBody {
  if (isPrismaSchemaMismatch(error)) {
    const message =
      "O banco de dados está desatualizado em relação ao aplicativo. Execute as migrations pendentes.";
    return {
      ok: false,
      code: "SCHEMA_OUT_OF_DATE",
      message,
      error: message,
    };
  }
  if (isPrismaConnectionError(error)) {
    const message = fallbackMessage;
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message,
      error: message,
    };
  }
  const message = fallbackMessage;
  return {
    ok: false,
    code: "INTERNAL_ERROR",
    message,
    error: message,
  };
}

export function prismaAwareHttpStatus(error: unknown): number {
  if (isPrismaSchemaMismatch(error) || isPrismaConnectionError(error)) return 503;
  return 500;
}

export function respondPrismaAwareError(
  res: Response,
  error: unknown,
  fallbackMessage: string,
): void {
  const status = prismaAwareHttpStatus(error);
  res.status(status).json(buildPrismaAwareErrorBody(error, fallbackMessage));
}
