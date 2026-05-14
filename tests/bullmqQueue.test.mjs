import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import { isBullMqPublishingEnabled } from "#server/jobs/blockminerQueue.js";

describe("BullMQ queue flags", () => {
  const savedRedis = process.env.REDIS_URL;
  const savedDisabled = process.env.BULLMQ_DISABLED;

  afterEach(() => {
    process.env.REDIS_URL = savedRedis;
    process.env.BULLMQ_DISABLED = savedDisabled;
  });

  it("is disabled when REDIS_URL is empty", () => {
    delete process.env.REDIS_URL;
    delete process.env.BULLMQ_DISABLED;
    assert.equal(isBullMqPublishingEnabled(), false);
  });

  it("is enabled when REDIS_URL is set", () => {
    process.env.REDIS_URL = "redis://127.0.0.1:6379";
    delete process.env.BULLMQ_DISABLED;
    assert.equal(isBullMqPublishingEnabled(), true);
  });

  it("is disabled when BULLMQ_DISABLED=1", () => {
    process.env.REDIS_URL = "redis://127.0.0.1:6379";
    process.env.BULLMQ_DISABLED = "1";
    assert.equal(isBullMqPublishingEnabled(), false);
  });
});
