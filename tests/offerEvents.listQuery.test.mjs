import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

// Mirrors admin list query schema (kept in sync manually for fast unit test)
const listEventsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(5).max(100).optional(),
    includeDeleted: z.enum(["0", "1"]).optional()
  })
  .strict();

test("listEventsQuerySchema coerces page and pageSize", () => {
  const q = listEventsQuerySchema.parse({ page: "2", pageSize: "50" });
  assert.equal(q.page, 2);
  assert.equal(q.pageSize, 50);
});

test("listEventsQuerySchema rejects invalid includeDeleted", () => {
  assert.throws(() => listEventsQuerySchema.parse({ includeDeleted: "yes" }), z.ZodError);
});
