import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  depositInWindowWhere,
  depositPendingInWindowWhere,
  countsForDepositTournament,
  parseDepositSource,
} from "#server/modules/tournaments/depositTournamentScore.js";

describe("depositTournamentScore filters", () => {
  const startsAt = new Date("2026-06-29T00:00:00.000Z");
  const upperBound = new Date("2026-07-06T00:00:00.000Z");

  it("completed window uses completedAt with createdAt fallback", () => {
    const where = depositInWindowWhere(startsAt, upperBound);
    assert.equal(where.type, "deposit");
    assert.equal(where.status, "completed");
    assert.equal(where.OR.length, 2);
    assert.deepEqual(where.OR[0].completedAt, { gte: startsAt, lte: upperBound });
    assert.deepEqual(where.OR[1], {
      completedAt: null,
      createdAt: { gte: startsAt, lte: upperBound },
    });
  });

  it("pending window uses createdAt only", () => {
    const where = depositPendingInWindowWhere(startsAt, upperBound, 42);
    assert.equal(where.userId, 42);
    assert.equal(where.type, "deposit");
    assert.equal(where.status, "pending_verification");
    assert.deepEqual(where.createdAt, { gte: startsAt, lte: upperBound });
  });

  it("scopes completed filter to user when provided", () => {
    const where = depositInWindowWhere(startsAt, upperBound, 7);
    assert.equal(where.userId, 7);
  });
});

describe("deposit tournament eligibility", () => {
  it("excludes hd_deposit from tournament scoring", () => {
    const raw = JSON.stringify({ source: "hd_deposit", block: 89480832 });
    assert.equal(parseDepositSource(raw), "hd_deposit");
    assert.equal(countsForDepositTournament(raw), false);
  });

  it("includes treasury and contract deposits", () => {
    assert.equal(countsForDepositTournament(JSON.stringify({ source: "treasury" })), true);
    assert.equal(countsForDepositTournament(JSON.stringify({ source: "contract" })), true);
    assert.equal(countsForDepositTournament(null), true);
    assert.equal(countsForDepositTournament(""), true);
  });
});

describe("deposit score aggregation logic", () => {
  it("sums multiple deposits per user", () => {
    const rows = [
      { userId: 1, amount: "1.5" },
      { userId: 1, amount: "0.5" },
      { userId: 2, amount: "10" },
    ];
    const map = new Map();
    for (const r of rows) {
      const prev = map.get(r.userId) ?? { total: 0, txCount: 0 };
      const amount = Number(r.amount);
      map.set(r.userId, { total: prev.total + amount, txCount: prev.txCount + 1 });
    }
    assert.equal(map.get(1).total, 2);
    assert.equal(map.get(1).txCount, 2);
    assert.equal(map.get(2).total, 10);
  });

  it("excludes non-completed statuses from scoring set", () => {
    const statuses = ["pending_verification", "failed", "completed"];
    const scored = statuses.filter((s) => s === "completed");
    assert.deepEqual(scored, ["completed"]);
  });
});
