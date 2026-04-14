import test from "node:test";
import assert from "node:assert";
import { auditLogListQuerySchema, buildAuditEventWhere } from "../server/src/audit/query/filters.js";
import { encodeAuditCursor, decodeAuditCursor, buildCursorWhere, buildOrderBy, normalizeResults } from "../server/src/audit/query/pagination.js";

test("auditLogListQuerySchema should parse defaults and validate values", () => {
  const parsed = auditLogListQuerySchema.parse({});
  assert.equal(parsed.limit, 25);
  assert.equal(parsed.direction, "next");
  assert.equal(parsed.cursor, undefined);
});

test("cursor encode/decode returns same values", () => {
  const cursor = { createdAt: new Date("2026-04-08T12:00:00Z").toISOString(), id: 42 };
  const token = encodeAuditCursor(cursor);
  const decoded = decodeAuditCursor(token);
  assert.ok(decoded);
  assert.equal(decoded.id, 42);
  assert.equal(decoded.createdAt.toISOString(), cursor.createdAt);
});

test("buildCursorWhere generates correct next and prev conditions", () => {
  const cursor = { createdAt: new Date("2026-04-08T12:00:00Z"), id: 42 };
  const nextWhere = buildCursorWhere(cursor, "next");
  assert.deepEqual(nextWhere, {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } }
    ]
  });
  const prevWhere = buildCursorWhere(cursor, "prev");
  assert.deepEqual(prevWhere, {
    OR: [
      { createdAt: { gt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { gt: cursor.id } }
    ]
  });
});

test("buildOrderBy respects direction", () => {
  assert.deepEqual(buildOrderBy("next"), [{ createdAt: "desc" }, { id: "desc" }]);
  assert.deepEqual(buildOrderBy("prev"), [{ createdAt: "asc" }, { id: "asc" }]);
});

test("normalizeResults reverses page results for prev direction", () => {
  const results = [{ id: 1 }, { id: 2 }, { id: 3 }];
  assert.deepEqual(normalizeResults(results, "prev"), [{ id: 3 }, { id: 2 }, { id: 1 }]);
  assert.deepEqual(normalizeResults(results, "next"), results);
});

test("buildAuditEventWhere creates a Prisma where object", () => {
  const filters = {
    from: "2026-04-01T00:00:00Z",
    to: "2026-04-02T00:00:00Z",
    userId: 5,
    eventType: "AUTH_LOGIN_SUCCESS",
    status: "SUCCESS",
    severity: "INFO",
    ipHash: "hash123",
    correlationId: "corr-123",
    txHash: "0xabc",
    search: "login"
  };
  const where = buildAuditEventWhere(filters);
  assert.equal(where.userId, 5);
  assert.equal(where.eventType, "AUTH_LOGIN_SUCCESS");
  assert.equal(where.status, "SUCCESS");
  assert.equal(where.severity, "INFO");
  assert.equal(where.ipHash, "hash123");
  assert.equal(where.correlationId, "corr-123");
  assert.equal(where.txHash, "0xabc");
  assert.equal(where.OR.length, 4);
});
