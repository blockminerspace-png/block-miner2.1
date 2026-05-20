import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const uploadsStatic = readFileSync(
  new URL("../../server/utils/uploadsStatic.ts", import.meta.url),
  "utf8",
);
const serverTs = readFileSync(new URL("../../server/server.ts", import.meta.url), "utf8");
const spaStatic = readFileSync(new URL("../../server/utils/spaStatic.ts", import.meta.url), "utf8");
const apiErrorHandler = readFileSync(
  new URL("../../backend/src/shared/http/apiErrorHandler.ts", import.meta.url),
  "utf8",
);

describe("uploadsStatic", () => {
  it("returns 404 JSON for missing upload files", () => {
    assert.match(uploadsStatic, /UPLOAD_NOT_FOUND/);
    assert.match(uploadsStatic, /status === 404/);
    assert.match(uploadsStatic, /fallthrough:\s*false/);
  });

  it("server mounts uploadsStatic before SPA fallback", () => {
    const uploadsIdx = serverTs.indexOf("mountUploadsStatic");
    const spaIdx = serverTs.indexOf("attachSpaFallback");
    assert.ok(uploadsIdx > 0 && spaIdx > uploadsIdx);
  });

  it("SPA fallback skips /uploads paths", () => {
    assert.match(spaStatic, /isUploadsRequestPath/);
    assert.match(spaStatic, /UPLOAD_NOT_FOUND/);
  });

  it("apiErrorHandler maps serve-static 404 on /uploads to 404 JSON", () => {
    assert.match(apiErrorHandler, /isServeStaticNotFound/);
    assert.match(apiErrorHandler, /UPLOAD_NOT_FOUND/);
  });
});
