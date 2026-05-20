import path from "path";
import { existsSync } from "fs";
import type { Express, Request, Response } from "express";
import express from "express";

export interface ClientDistPaths {
  distPath: string;
  indexPath: string;
  indexExists: boolean;
}

export function resolveClientDistPaths(projectRoot: string): ClientDistPaths {
  const distPath = path.resolve(projectRoot, "client", "dist");
  const indexPath = path.join(distPath, "index.html");
  return {
    distPath,
    indexPath,
    indexExists: existsSync(indexPath),
  };
}

/** Browser paths under `/api` must never hit the SPA fallback. */
export function isApiRequestPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

/** Browser paths under `/uploads` are served only by uploads static middleware. */
export function isUploadsRequestPath(pathname: string): boolean {
  return pathname === "/uploads" || pathname.startsWith("/uploads/");
}

/** Vite build output lives under `/assets/*`. */
export function isAssetsRequestPath(pathname: string): boolean {
  return pathname === "/assets" || pathname.startsWith("/assets/");
}

/** Socket.IO engine path — must never return SPA HTML. */
export function isSocketIoRequestPath(pathname: string): boolean {
  return pathname === "/socket.io" || pathname.startsWith("/socket.io/");
}

/** Missing hashed bundles must not be rewritten to index.html. */
export function isBundledAssetExtensionPath(pathname: string): boolean {
  return /\.(m?js|css|wasm|map)(\?.*)?$/i.test(pathname);
}

export function applyNoStoreHtmlHeaders(res: Response): void {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

function isHashedAssetPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized.includes("/assets/")) {
    return true;
  }
  const base = path.basename(filePath);
  return /[-.][0-9A-Za-z_-]{7,}\.(m?js|css|wasm)$/i.test(base);
}

function sendAssetNotFound(res: Response): void {
  res.status(404).json({
    ok: false,
    code: "ASSET_NOT_FOUND",
    message: "Asset não encontrado.",
    error: "Asset não encontrado.",
  });
}

function sendReservedRouteNotFound(res: Response): void {
  res.status(404).json({
    ok: false,
    code: "ROUTE_NOT_FOUND",
    message: "Rota não encontrada.",
    error: "Rota não encontrada.",
  });
}

export function attachClientDistStatic(app: Express, distPath: string, indexExists: boolean): void {
  if (!indexExists) {
    return;
  }

  app.use(
    express.static(distPath, {
      index: false,
      fallthrough: true,
      acceptRanges: false,
      setHeaders(res, filePath) {
        const normalized = filePath.replace(/\\/g, "/");
        if (normalized.endsWith("/index.html") || path.basename(filePath) === "index.html") {
          applyNoStoreHtmlHeaders(res);
          return;
        }
        if (isHashedAssetPath(filePath)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          res.setHeader("X-Content-Type-Options", "nosniff");
          return;
        }
        if (/\.(png|jpe?g|webp|gif|ico|svg)$/i.test(filePath)) {
          res.setHeader("Cache-Control", "public, max-age=604800, immutable");
          return;
        }
        res.setHeader("Cache-Control", "public, max-age=3600");
        res.setHeader("X-Content-Type-Options", "nosniff");
      },
    }),
  );

  /** Only reached when `express.static` did not find the file (fallthrough). */
  app.use("/assets", (_req: Request, res: Response) => {
    sendAssetNotFound(res);
  });
}

export type SpaIndexRenderer = (html: string, ctx: { nonce: string }) => string;

export interface SpaFallbackOptions {
  indexPath: string;
  indexExists: boolean;
  adminOnlyMode?: boolean;
  renderIndex: SpaIndexRenderer;
  onMissingIndex?: (res: Response) => void;
  onRenderFailure?: (res: Response, error: unknown) => void;
}

function sendSpaUnavailable(res: Response): void {
  res.status(503).type("text/plain").send("Frontend build unavailable.");
}

export function attachSpaFallback(app: Express, opts: SpaFallbackOptions): void {
  const {
    indexPath,
    indexExists,
    adminOnlyMode = false,
    renderIndex,
    onMissingIndex = sendSpaUnavailable,
    onRenderFailure = sendSpaUnavailable,
  } = opts;

  app.get("/{*all}", async (req: Request, res: Response) => {
    if (isApiRequestPath(req.path)) {
      sendReservedRouteNotFound(res);
      return;
    }

    if (isUploadsRequestPath(req.path)) {
      res.status(404).json({
        ok: false,
        code: "UPLOAD_NOT_FOUND",
        message: "Arquivo não encontrado.",
        error: "Arquivo não encontrado.",
      });
      return;
    }

    if (isSocketIoRequestPath(req.path)) {
      sendReservedRouteNotFound(res);
      return;
    }

    if (isAssetsRequestPath(req.path) || isBundledAssetExtensionPath(req.path)) {
      sendAssetNotFound(res);
      return;
    }

    if (adminOnlyMode && !req.path.startsWith("/admin")) {
      res.redirect(302, "/admin/login");
      return;
    }

    if (!indexExists) {
      onMissingIndex(res);
      return;
    }

    try {
      const fs = await import("fs/promises");
      const rawHtml = await fs.readFile(indexPath, "utf8");
      const nonce = typeof res.locals.cspNonce === "string" ? res.locals.cspNonce : "";
      const html = renderIndex(rawHtml, { nonce });

      applyNoStoreHtmlHeaders(res);
      res.type("html");
      res.send(html);
    } catch (error: unknown) {
      onRenderFailure(res, error);
    }
  });
}
