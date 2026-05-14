import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("admin Telegram routes are under admin auth and expose finance automation endpoints", () => {
  const routes = fs.readFileSync("dist/server/routes/admin.js", "utf8");
  assert.match(routes, /adminRouter\.use\(requireAdminAuth, adminLimiter\)/);
  assert.match(routes, /\/finance\/telegram\/settings/);
  assert.match(routes, /\/finance\/telegram\/events\/:id\/retry/);
});

test("admin finance UI does not render raw HTML or editable Telegram token fields", () => {
  const source = fs.readFileSync("client/src/pages/admin/AdminFinance.tsx", "utf8");
  assert.equal(source.includes("dangerouslySetInnerHTML"), false);
  assert.equal(source.includes("privateBotToken"), false);
  assert.equal(source.includes("publicBotToken"), false);
  assert.match(source, /privateChatId/);
  assert.match(source, /publicThreadId/);
});
