import type { Response } from "express";
import loggerLib from "../../../utils/logger.js";
import {
  isPrismaConnectionError,
  isPrismaSchemaMismatch,
  isPrismaTransactionRuntimeError,
  prismaErrorCode,
  unknownErrorMessage,
} from "../../../utils/prismaHttpErrors.js";

const logger = loggerLib.child("AuthPrisma");

// ---------------------------------------------------------------------------
// Prisma error category guards — typed, stable, no magic strings in callers
// ---------------------------------------------------------------------------

/** P2025: Record required for operation not found (e.g. update on deleted row). */
export function isAuthPrismaNotFound(error: unknown): boolean {
  return prismaErrorCode(error) === "P2025";
}

/** P2002: Unique constraint violation (duplicate email/username on insert). */
export function isAuthPrismaUniqueConflict(error: unknown): boolean {
  return prismaErrorCode(error) === "P2002";
}

/**
 * Bad input errors at the Prisma/DB level:
 *   P2000 — value too long for column
 *   P2006 — invalid value for field type
 *   P2011 — null constraint violation
 *   P2012 — missing required value
 *   P2019 — input error (generic)
 */
export function isAuthPrismaBadInput(error: unknown): boolean {
  const code = prismaErrorCode(error);
  return (
    code === "P2000" ||
    code === "P2006" ||
    code === "P2011" ||
    code === "P2012" ||
    code === "P2019"
  );
}

/**
 * Infrastructure errors: connection issues, pool saturation, transaction
 * timeouts, schema drift. These warrant a 503 response.
 */
export function isAuthPrismaInfrastructureError(error: unknown): boolean {
  return (
    isPrismaConnectionError(error) ||
    isPrismaSchemaMismatch(error) ||
    isPrismaTransactionRuntimeError(error)
  );
}

// ---------------------------------------------------------------------------
// Classification result type
// ---------------------------------------------------------------------------

type AuthPrismaErrorHandled = {
  handled: true;
  status: number;
  code: string;
  message: string;
};

type AuthPrismaErrorUnhandled = { handled: false };

type AuthPrismaErrorResult = AuthPrismaErrorHandled | AuthPrismaErrorUnhandled;

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

/**
 * Classify a caught error from an auth handler and build the appropriate
 * HTTP response data. Returns `{ handled: false }` for non-Prisma errors so
 * the caller can fall through to its own generic 500 handler.
 */
export function classifyAuthPrismaError(
  error: unknown,
  serviceUnavailableMessage: string,
  logKey: string,
): AuthPrismaErrorResult {
  const msg = unknownErrorMessage(error);
  const code = prismaErrorCode(error);

  if (isAuthPrismaInfrastructureError(error)) {
    const isSchema = isPrismaSchemaMismatch(error);
    logger.error(logKey, {
      category: "infrastructure",
      prismaCode: code ?? "unknown",
      message: msg,
    });
    return {
      handled: true,
      status: 503,
      code: isSchema ? "SCHEMA_OUT_OF_DATE" : "SERVICE_UNAVAILABLE",
      message: isSchema
        ? "O banco de dados está desatualizado. Execute as migrations pendentes."
        : serviceUnavailableMessage,
    };
  }

  if (isAuthPrismaNotFound(error)) {
    // P2025 in an auth context means the row was deleted between lookup and
    // update — treat as 409 transient conflict, not 404 (avoids leaking
    // whether a resource exists at a given auth endpoint).
    logger.warn(logKey, { category: "not_found", prismaCode: code ?? "P2025", message: msg });
    return {
      handled: true,
      status: 409,
      code: "RECORD_NOT_FOUND",
      message: "O recurso foi modificado por outra operação. Tente novamente.",
    };
  }

  if (isAuthPrismaUniqueConflict(error)) {
    logger.warn(logKey, { category: "unique_conflict", prismaCode: code ?? "P2002", message: msg });
    return {
      handled: true,
      status: 409,
      code: "CONFLICT",
      message: "Uma operação conflitante foi detectada. Tente novamente.",
    };
  }

  if (isAuthPrismaBadInput(error)) {
    // Bad input that passed JS validation but failed at the DB — log as error
    // since schemas should be in sync.
    logger.error(logKey, { category: "bad_input", prismaCode: code ?? "P2xxx", message: msg });
    return {
      handled: true,
      status: 400,
      code: "INVALID_INPUT",
      message: "Dados inválidos. Verifique os campos e tente novamente.",
    };
  }

  return { handled: false };
}

// ---------------------------------------------------------------------------
// Response helper
// ---------------------------------------------------------------------------

/**
 * Attempts to respond with a typed Prisma error. Returns `true` if a response
 * was sent so callers can early-return; `false` if the error is not Prisma-
 * specific (caller must handle).
 */
export function respondAuthPrismaError(
  res: Response,
  error: unknown,
  fallbackMessage: string,
  logKey: string,
): boolean {
  const result = classifyAuthPrismaError(error, fallbackMessage, logKey);
  if (!result.handled) return false;
  res.status(result.status).json({
    ok: false,
    code: result.code,
    message: result.message,
    error: result.message,
  });
  return true;
}
