import type { RequestHandler } from "express";

export type CreateRateLimiterOptions = {
  windowMs?: number;
  max?: number;
  keyGenerator?: (req: import("express").Request) => string;
  skip?: (req: import("express").Request) => boolean;
  message?: string;
  statusCode?: number;
  cleanupIntervalMs?: number;
  staleAfterMs?: number;
  maxKeys?: number;
};

export function createRateLimiter(options?: CreateRateLimiterOptions): RequestHandler;
