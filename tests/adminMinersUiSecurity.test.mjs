import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(new URL("../client/src/pages/admin/AdminMiners.tsx", import.meta.url), "utf8");
const shopController = readFileSync(
  new URL("../dist/server/controllers/shopController.js", import.meta.url),
  "utf8",
);
const adminRoutes = readFileSync(new URL("../dist/server/routes/admin.js", import.meta.url), "utf8");

describe("admin miners UI/security guards", () => {
  it("does not render external miner data as raw HTML", () => {
    assert.equal(source.includes("dangerouslySetInnerHTML"), false);
    assert.equal(source.includes("innerHTML"), false);
  });

  it("uses the dedicated safe upload endpoint and blocks SVG accept list", () => {
    assert.match(source, /\/admin\/miners\/upload-image/);
    assert.match(source, /image\/jpeg,image\/png,image\/webp/);
    assert.doesNotMatch(source, /image\/svg/);
  });

  it("shop purchase uses backend catalog price and writes snapshot fields", () => {
    assert.match(shopController, /currentPrice/);
    assert.match(shopController, /currentTotalPrice/);
    assert.match(shopController, /snapshotSlug/);
    assert.match(shopController, /snapshotPrice/);
    assert.match(shopController, /acquisitionSource: "shop"/);
  });

  it("admin miner routes are mounted after admin auth and include archive/toggle endpoints", () => {
    assert.match(adminRoutes, /adminRouter\.use\(requireAdminAuth, adminLimiter\)/);
    assert.match(adminRoutes, /\/miners\/:id\/archive/);
    assert.match(adminRoutes, /\/miners\/:id\/toggle-store/);
    assert.match(adminRoutes, /\/miners\/:id\/toggle-active/);
  });
});
