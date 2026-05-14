import type { NextFunction, Request, RequestHandler, Response } from "express";
import { isSidebarPathVisible } from "../services/sidebarNavService.js";

/**
 * Sidebar registry entries may be typed as `string | null`. Routes need a concrete
 * string for `requireVisibleSidebarPath`; throw if a feature is mounted without a path.
 */
export function sidebarRegistryPath(path: string | null | undefined, featureKey: string): string {
  if (path == null || path === "") {
    throw new Error(`Missing sidebar path for feature "${featureKey}"`);
  }
  return path;
}

export function requireVisibleSidebarPath(requiredPath: string): RequestHandler {
  return async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const allowed = await isSidebarPathVisible(requiredPath);
      if (!allowed) {
        res.status(403).json({
          ok: false,
          code: "feature_disabled",
          message: "This feature is not available.",
        });
        return;
      }
      next();
    } catch (err: unknown) {
      next(err);
    }
  };
}
