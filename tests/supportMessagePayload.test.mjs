import test from "node:test";
import assert from "node:assert/strict";
import {
  serializeSupportPayload,
  parseSupportPayload,
  isAllowedUploadUrl
} from "#server/utils/supportMessagePayload.js";

test("roundtrip body with attachments", () => {
  const raw = serializeSupportPayload("Hello", [{ url: "/uploads/x.png", mimeType: "image/png" }]);
  const p = parseSupportPayload(raw);
  assert.equal(p.body, "Hello");
  assert.equal(p.attachments.length, 1);
  assert.equal(p.attachments[0].url, "/uploads/x.png");
});

test("plain text legacy", () => {
  const p = parseSupportPayload("Just text");
  assert.equal(p.body, "Just text");
  assert.equal(p.attachments.length, 0);
});

test("invalid attachment URLs are dropped so payload may fall back to body-only storage", () => {
  const raw = serializeSupportPayload("Only body", [{ url: "/uploads/../etc/passwd" }]);
  assert.equal(raw, "Only body");
  const p = parseSupportPayload(raw);
  assert.equal(p.attachments.length, 0);
});

test("isAllowedUploadUrl", () => {
  assert.equal(isAllowedUploadUrl("/uploads/ok.jpg"), true);
  assert.equal(isAllowedUploadUrl("https://evil.com/x"), false);
  assert.equal(isAllowedUploadUrl("/uploads/sub/x.png"), true);
});
