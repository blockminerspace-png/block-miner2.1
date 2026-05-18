import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import {
  attachClientDistStatic,
  attachSpaFallback,
  isApiRequestPath,
  resolveClientDistPaths,
} from "#server/utils/spaStatic.js";

function listen(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("no address"));
        return;
      }
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

function request(baseUrl, pathname) {
  return fetch(`${baseUrl}${pathname}`, { redirect: "manual" });
}

test("isApiRequestPath identifies API routes only", () => {
  assert.equal(isApiRequestPath("/api/auth/session"), true);
  assert.equal(isApiRequestPath("/api"), true);
  assert.equal(isApiRequestPath("/login"), false);
  assert.equal(isApiRequestPath("/admin/miners"), false);
});

test("resolveClientDistPaths detects index.html", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bm-spa-"));
  const root = path.join(tmp, "repo");
  fs.mkdirSync(path.join(root, "client", "dist"), { recursive: true });
  fs.writeFileSync(path.join(root, "client", "dist", "index.html"), "<!doctype html><html></html>");

  const resolved = resolveClientDistPaths(root);
  assert.equal(resolved.indexExists, true);
  assert.equal(path.basename(resolved.indexPath), "index.html");
});

test("SPA routes return 200 when client/dist/index.html exists", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bm-spa-http-"));
  const root = path.join(tmp, "repo");
  const distDir = path.join(root, "client", "dist");
  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, "index.html"), "<!doctype html><html><body>spa</body></html>");

  const paths = resolveClientDistPaths(root);
  const app = express();
  app.use((req, res, next) => {
    res.locals.cspNonce = "test-nonce";
    next();
  });
  attachClientDistStatic(app, paths.distPath, paths.indexExists);
  attachSpaFallback(app, {
    indexPath: paths.indexPath,
    indexExists: paths.indexExists,
    renderIndex: (html) => html,
  });

  const { server, baseUrl } = await listen(app);
  try {
    for (const route of ["/login", "/admin/miners", "/register", "/wallet"]) {
      const res = await request(baseUrl, route);
      assert.equal(res.status, 200, `${route} should be 200`);
      assert.match(await res.text(), /spa/);
    }
  } finally {
    server.close();
  }
});

test("SPA routes return 503 when index.html is missing", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bm-spa-miss-"));
  const root = path.join(tmp, "repo");
  fs.mkdirSync(path.join(root, "client", "dist"), { recursive: true });

  const paths = resolveClientDistPaths(root);
  assert.equal(paths.indexExists, false);

  const app = express();
  attachSpaFallback(app, {
    indexPath: paths.indexPath,
    indexExists: paths.indexExists,
    renderIndex: (html) => html,
  });

  const { server, baseUrl } = await listen(app);
  try {
    const res = await request(baseUrl, "/login");
    assert.equal(res.status, 503);
    assert.match(await res.text(), /Frontend build unavailable/);
  } finally {
    server.close();
  }
});

test("API paths do not hit SPA fallback (404 from catch-all guard)", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bm-spa-api-"));
  const root = path.join(tmp, "repo");
  const distDir = path.join(root, "client", "dist");
  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, "index.html"), "<!doctype html><html></html>");

  const paths = resolveClientDistPaths(root);
  const app = express();
  attachSpaFallback(app, {
    indexPath: paths.indexPath,
    indexExists: paths.indexExists,
    renderIndex: (html) => html,
  });

  const { server, baseUrl } = await listen(app);
  try {
    const res = await request(baseUrl, "/api/auth/session");
    assert.equal(res.status, 404);
    assert.match(await res.text(), /Not found/);
  } finally {
    server.close();
  }
});
