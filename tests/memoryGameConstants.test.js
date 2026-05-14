import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getMemoryMismatchRevealMs } from "#server/utils/memoryGameConstants.js";

describe("getMemoryMismatchRevealMs", () => {
  it("defaults to 800 when env unset", () => {
    const prev = process.env.MEMORY_MISMATCH_REVEAL_MS;
    delete process.env.MEMORY_MISMATCH_REVEAL_MS;
    try {
      assert.equal(getMemoryMismatchRevealMs(), 800);
    } finally {
      if (prev !== undefined) process.env.MEMORY_MISMATCH_REVEAL_MS = prev;
      else delete process.env.MEMORY_MISMATCH_REVEAL_MS;
    }
  });

  it("clamps to 500 minimum and 1500 maximum", () => {
    const prev = process.env.MEMORY_MISMATCH_REVEAL_MS;
    try {
      process.env.MEMORY_MISMATCH_REVEAL_MS = "100";
      assert.equal(getMemoryMismatchRevealMs(), 500);
      process.env.MEMORY_MISMATCH_REVEAL_MS = "99999";
      assert.equal(getMemoryMismatchRevealMs(), 1500);
    } finally {
      if (prev !== undefined) process.env.MEMORY_MISMATCH_REVEAL_MS = prev;
      else delete process.env.MEMORY_MISMATCH_REVEAL_MS;
    }
  });
});
