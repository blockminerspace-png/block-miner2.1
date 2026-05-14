import type { Express } from "express";
import { mountUserApplicationApiRoutes } from "./mount/userApiRoutes.mount.js";
import { mountAdminApiRoutes } from "./mount/adminApiRoutes.mount.js";
import { mountPublicSurfaceRoutes } from "./mount/publicSurfaceRoutes.mount.js";

/**
 * Registers all HTTP API routes and public JSON endpoints (paths preserved).
 */
export function registerHttpRoutes(app: Express): void {
  mountUserApplicationApiRoutes(app);
  mountAdminApiRoutes(app);
  mountPublicSurfaceRoutes(app);
}
