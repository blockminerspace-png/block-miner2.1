import fs from "node:fs";
import path from "node:path";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { resolveUploadsRoot } from "./uploadsRoot.js";

export type UploadsStaticLogger = {
  info?: (message: string, meta?: Record<string, unknown>) => void;
  warn?: (message: string, meta?: Record<string, unknown>) => void;
  error?: (message: string, meta?: Record<string, unknown>) => void;
};

export type MountUploadsStaticOptions = {
  app: Express;
  fromModuleDir: string;
  logger?: UploadsStaticLogger;
};

function readErrorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

function ensureUploadSubdirs(uploadRoot: string, logger?: UploadsStaticLogger): void {
  if (!fs.existsSync(uploadRoot)) {
    fs.mkdirSync(uploadRoot, { recursive: true });
    logger?.warn?.("uploads.root.created", { uploadRoot });
  }
  for (const sub of ["miners", "machines"]) {
    const dir = path.join(uploadRoot, sub);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Serves `/uploads/*` from the persistent uploads volume.
 * Missing files return 404 JSON — never SPA HTML and never generic 500.
 */
export function mountUploadsStatic({ app, fromModuleDir, logger }: MountUploadsStaticOptions): string {
  const uploadRoot = path.resolve(resolveUploadsRoot(fromModuleDir));
  ensureUploadSubdirs(uploadRoot, logger);

  app.use(
    "/uploads",
    express.static(uploadRoot, {
      index: false,
      fallthrough: false,
      setHeaders(res, filePath) {
        res.setHeader("X-Content-Type-Options", "nosniff");
        if (/\.svg$/i.test(filePath)) {
          res.setHeader("Content-Type", "application/octet-stream");
          res.setHeader("Content-Security-Policy", "default-src 'none'");
        } else if (/\.(png|jpe?g|webp|gif|ico)$/i.test(filePath)) {
          res.setHeader("Cache-Control", "public, max-age=604800, immutable");
        } else {
          res.setHeader("Cache-Control", "public, max-age=3600");
        }
      },
    }),
  );

  app.use(
    "/uploads",
    (error: unknown, _req: Request, res: Response, next: NextFunction) => {
      const status = readErrorStatus(error);
      if (status === 404) {
        return res.status(404).json({
          ok: false,
          code: "UPLOAD_NOT_FOUND",
          message: "Arquivo não encontrado.",
          error: "Arquivo não encontrado.",
        });
      }

      logger?.error?.("uploads.static.error", {
        message: error instanceof Error ? error.message : "unknown upload static error",
        status,
      });

      return res.status(500).json({
        ok: false,
        code: "UPLOAD_STATIC_ERROR",
        message: "Não foi possível carregar o arquivo.",
        error: "Não foi possível carregar o arquivo.",
      });
    },
  );

  logger?.info?.("uploads.static.mounted", { uploadRoot });
  return uploadRoot;
}

/** Browser paths under `/uploads` must never hit the SPA fallback. */
export function isUploadsRequestPath(pathname: string): boolean {
  return pathname === "/uploads" || pathname.startsWith("/uploads/");
}
