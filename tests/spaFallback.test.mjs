import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import {
  applyNoStoreHtmlHeaders,
  attachClientDistStatic,
  attachSpaFallback,
  isApiRequestPath,
  isAssetsRequestPath,
  isSocketIoRequestPath,
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

test("isAssetsRequestPath and isSocketIoRequestPath guard reserved paths", () => {
  assert.equal(isAssetsRequestPath("/assets/index-abc.js"), true);
  assert.equal(isSocketIoRequestPath("/socket.io/"), true);
  assert.equal(isAssetsRequestPath("/wallet"), false);
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

test("SPA HTML responses use no-store cache headers", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bm-spa-cache-"));
  const root = path.join(tmp, "repo");
  const distDir = path.join(root, "client", "dist");
  const assetsDir = path.join(distDir, "assets");
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, "index.html"), "<!doctype html><html><body>spa</body></html>");
  fs.writeFileSync(path.join(assetsDir, "index-D0TfrHPc.js"), "console.log('ok');");

  const paths = resolveClientDistPaths(root);
  const app = express();
  attachClientDistStatic(app, paths.distPath, paths.indexExists);
  attachSpaFallback(app, {
    indexPath: paths.indexPath,
    indexExists: paths.indexExists,
    renderIndex: (html) => html,
  });

  const { server, baseUrl } = await listen(app);
  try {
    const login = await request(baseUrl, "/login");
    assert.equal(login.status, 200);
    const loginCache = login.headers.get("cache-control") || "";
    assert.match(loginCache, /no-store/i);
    assert.match(loginCache, /no-cache/i);

    const dashboard = await request(baseUrl, "/dashboard");
    assert.equal(dashboard.status, 200);
    const dashCache = dashboard.headers.get("cache-control") || "";
    assert.match(dashCache, /no-store/i);

    const asset = await request(baseUrl, "/assets/index-D0TfrHPc.js");
    assert.equal(asset.status, 200);
    const assetCache = asset.headers.get("cache-control") || "";
    assert.match(assetCache, /immutable/i);
  } finally {
    server.close();
  }
});

test("applyNoStoreHtmlHeaders sets pragma and expires", () => {
  const app = express();
  app.get("/probe", (_req, res) => {
    applyNoStoreHtmlHeaders(res);
    res.status(200).send("ok");
  });
  return listen(app).then(async ({ server, baseUrl }) => {
    try {
      const res = await request(baseUrl, "/probe");
      assert.equal(res.status, 200);
      assert.match(res.headers.get("cache-control") || "", /no-store/i);
      assert.equal(res.headers.get("pragma"), "no-cache");
      assert.equal(res.headers.get("expires"), "0");
    } finally {
      server.close();
    }
  });
});

test("API paths do not hit SPA fallback (404 JSON)", async () => {
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
    const body = await res.json();
    assert.equal(body.code, "ROUTE_NOT_FOUND");
  } finally {
    server.close();
  }
});

test("missing /assets/*.js returns 404 JSON, never SPA HTML", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bm-spa-asset-miss-"));
  const root = path.join(tmp, "repo");
  const distDir = path.join(root, "client", "dist");
  const assetsDir = path.join(distDir, "assets");
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, "index.html"), "<!doctype html><html><body>spa</body></html>");

  const paths = resolveClientDistPaths(root);
  const app = express();
  attachClientDistStatic(app, paths.distPath, paths.indexExists);
  attachSpaFallback(app, {
    indexPath: paths.indexPath,
    indexExists: paths.indexExists,
    renderIndex: (html) => html,
  });

  const { server, baseUrl } = await listen(app);
  try {
    const res = await request(baseUrl, "/assets/wifi-Cknu6UMX.js");
    assert.equal(res.status, 404);
    const ct = res.headers.get("content-type") || "";
    assert.match(ct, /application\/json/i);
    const body = await res.json();
    assert.equal(body.code, "ASSET_NOT_FOUND");
    const text = JSON.stringify(body);
    assert.doesNotMatch(text, /<!doctype html>/i);
  } finally {
    server.close();
  }
});

test("/socket.io path does not return SPA HTML from catch-all", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bm-spa-sio-"));
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
    const res = await request(baseUrl, "/socket.io/?EIO=4&transport=polling");
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.code, "ROUTE_NOT_FOUND");
  } finally {
    server.close();
  }
});
