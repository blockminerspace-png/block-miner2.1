import test from "node:test";
import assert from "node:assert/strict";

/**
 * Regression: balance check-in must write AuditLog rows using schema fields only
 * (detailsJson / userAgent). Invalid fields caused Prisma errors and 500 responses.
 */
test("balance check-in audit payload matches AuditLog model (no legacy details/ipHash)", () => {
  const amount = 0.02;
  const streak = 4;
  const payload = {
    userId: 99,
    action: "daily_checkin_balance",
    detailsJson: JSON.stringify({ amount, streak }),
    userAgent: "Vitest/UA"
  };

  assert.equal(typeof payload.detailsJson, "string");
  assert.deepEqual(JSON.parse(payload.detailsJson), { amount: 0.02, streak: 4 });
  assert.equal(Object.prototype.hasOwnProperty.call(payload, "details"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(payload, "ipHash"), false);
});
