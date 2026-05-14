import type { RequestHandler } from "express";

export type CreateDistributedRateLimiterOptions = {
  windowMs?: number;
  max?: number;
  name?: string;
  keyGenerator?: (req: import("express").Request) => string;
  secondaryKeyGenerator?: (req: import("express").Request) => string | null | undefined;
  skip?: (req: import("express").Request) => boolean;
  message?: string;
  statusCode?: number;
};

export function createDistributedRateLimiter(options?: CreateDistributedRateLimiterOptions): RequestHandler;

export function __resetSlidingWindowMemoryForTests(): void;
