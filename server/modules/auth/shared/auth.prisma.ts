import type { Response } from "express";
import loggerLib from "../../../utils/logger.js";
import {
  buildPrismaAwareErrorBody,
  isPrismaConnectionError,
  isPrismaSchemaMismatch,
  prismaAwareHttpStatus,
  prismaErrorCode,
  unknownErrorMessage,
} from "../../../utils/prismaHttpErrors.js";

const logger = loggerLib.child("AuthPrisma");

export function isAuthPrismaInfrastructureError(error: unknown): boolean {
  return isPrismaConnectionError(error) || isPrismaSchemaMismatch(error);
}

/**
 * Maps Prisma pool/transaction/schema errors to stable JSON for auth routes.
 * @returns true if a response was sent
 */
export function respondAuthPrismaError(
  res: Response,
  error: unknown,
  fallbackMessage: string,
  logKey: string,
): boolean {
  if (!isAuthPrismaInfrastructureError(error)) return false;
  logger.error(logKey, { message: unknownErrorMessage(error), code: prismaErrorCode(error) });
  const status = prismaAwareHttpStatus(error);
  res.status(status).json(buildPrismaAwareErrorBody(error, fallbackMessage));
  return true;
}
