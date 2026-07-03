import type { HelmetOptions } from "helmet";
import type { NextFunction, Request, Response } from "express";

export function getHelmetContentSecurityPolicyOptions(): Exclude<
  HelmetOptions["contentSecurityPolicy"],
  boolean | undefined
>;

export function createCspMiddleware(): (req: Request, res: Response, next: NextFunction) => void;
