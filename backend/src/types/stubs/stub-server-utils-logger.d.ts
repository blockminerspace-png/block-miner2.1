import type { Request } from "express";
export declare function logUnhandledError(
  err: Error,
  req: Request | null | undefined,
  extra?: Record<string, unknown>,
): void;
