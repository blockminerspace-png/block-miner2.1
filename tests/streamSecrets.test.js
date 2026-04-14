import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { decryptStreamSecret, encryptStreamSecret, isStreamEncryptionConfigured } from "../server/services/streaming/streamSecrets.js";

describe("streamSecrets", () => {
  const prev = process.env.STREAM_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.STREAM_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
  });

  afterEach(() => {
    process.env.STREAM_ENCRYPTION_KEY = prev;
  });

  it("roundtrips stream key material", () => {
    assert.equal(isStreamEncryptionConfigured(), true);
    const enc = encryptStreamSecret("yt-key-abc");
    assert.ok(enc && enc.length > 20);
    assert.equal(decryptStreamSecret(enc), "yt-key-abc");
  });

  it("returns null when encryption key missing", () => {
    delete process.env.STREAM_ENCRYPTION_KEY;
    assert.equal(isStreamEncryptionConfigured(), false);
    assert.equal(encryptStreamSecret("x"), null);
  });
});
