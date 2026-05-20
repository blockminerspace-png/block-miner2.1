import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const uploadModule = readFileSync(
  new URL("../../../server/modules/admin-miners/adminMiners.upload.ts", import.meta.url),
  "utf8",
);
const uploadsRoot = readFileSync(
  new URL("../../../server/utils/uploadsRoot.ts", import.meta.url),
  "utf8",
);
const schemas = readFileSync(
  new URL("../../../server/modules/admin-miners/adminMiners.schemas.ts", import.meta.url),
  "utf8",
);
const routes = readFileSync(
  new URL("../../../server/modules/admin-miners/adminMiners.routes.ts", import.meta.url),
  "utf8",
);
const serverTs = readFileSync(new URL("../../../server/server.ts", import.meta.url), "utf8");
const apiSource = readFileSync(
  new URL("../../../client/src/pages/admin/miners/adminMiners.api.ts", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(
  new URL("../../../client/src/pages/admin/miners/AdminMinersPage.tsx", import.meta.url),
  "utf8",
);
const imageInput = readFileSync(
  new URL("../../../client/src/pages/admin/miners/components/AdminMinerImageInput.tsx", import.meta.url),
  "utf8",
);
const minerImage = readFileSync(
  new URL("../../../client/src/pages/admin/miners/components/AdminMinerImage.tsx", import.meta.url),
  "utf8",
);

describe("admin miner image upload", () => {
  it("resolves uploads from project root (not dist/server relative path)", () => {
    assert.match(uploadsRoot, /findBlockMinerProjectRoot/);
    assert.match(uploadModule, /resolveUploadsSubdir/);
    assert.doesNotMatch(uploadModule, /\.\.\/\.\.\/\.\.\/uploads/);
  });

  it("stores uploads under /uploads/miners/ with server-generated names", () => {
    assert.match(uploadModule, /ADMIN_MINER_IMAGE_FIELD = "image"/);
    assert.match(uploadModule, /ADMIN_MINER_UPLOAD_PUBLIC_PREFIX/);
    assert.match(uploadModule, /image\/(jpeg|png|webp)/);
    assert.doesNotMatch(uploadModule, /image\/svg/);
  });

  it("validates miner image URLs, blocks placeholder and traversal", () => {
    assert.match(schemas, /isPlaceholderMinerImageUrl/);
    assert.match(schemas, /startsWith\("\/uploads\/"\)/);
    assert.match(schemas, /\.\./);
    assert.match(schemas, /partial && \(raw === "" \|\| raw === null\)/);
  });

  it("serves /uploads without SPA fallthrough", () => {
    assert.match(serverTs, /fallthrough:\s*false/);
    assert.match(serverTs, /index:\s*false/);
  });

  it("accepts multipart image on create/update routes", () => {
    assert.match(routes, /optionalAdminMinerImageUpload/);
    assert.match(routes, /patch\("\/miners\/:id", optionalAdminMinerImageUpload/);
  });

  it("does not force multipart Content-Type in axios", () => {
    assert.match(apiSource, /buildAdminMinerFormData/);
    assert.doesNotMatch(apiSource, /Content-Type.*multipart/);
  });

  it("preserves existing imageUrl on edit when field is empty", () => {
    assert.match(pageSource, /preserveImageUrlRef/);
    assert.match(pageSource, /selectedImageFile/);
  });

  it("preview shows load error instead of silently swapping logo on remote failure", () => {
    assert.match(minerImage, /Imagem não carregou/);
    assert.doesNotMatch(pageSource, /h-24 w-24/);
    assert.match(minerImage, /h-full w-full.*object-contain/);
  });
});
