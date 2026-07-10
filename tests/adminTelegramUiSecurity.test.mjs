import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("admin Telegram routes are under admin auth and expose finance automation endpoints", () => {
  const composer = fs.readFileSync("dist/server/modules/admin/admin.routes.js", "utf8");
  const economy = fs.readFileSync("dist/server/modules/admin/routes/economy.routes.js", "utf8");
  assert.match(composer, /adminRouter\.use\(requireAdminAuth, adminLimiter\)/);
  assert.match(economy, /\/finance\/telegram\/settings/);
  assert.match(economy, /\/finance\/telegram\/events\/:id\/retry/);
});

test("admin finance UI does not render raw HTML or editable Telegram token fields", () => {
  const source = fs.readFileSync("client/src/pages/admin/finance/AdminFinancePage.tsx", "utf8");
  assert.equal(source.includes("dangerouslySetInnerHTML"), false);
  assert.equal(source.includes("privateBotToken"), false);
  assert.equal(source.includes("publicBotToken"), false);
  assert.match(source, /privateChatId/);
  assert.match(source, /publicThreadId/);
});
