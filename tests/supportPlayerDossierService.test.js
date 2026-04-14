import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getSupportTicketPlayerDossier,
  isPrismaMissingRelationError,
  parseDossierPagination,
  toNumberOrNull,
} from "../server/services/supportPlayerDossierService.js";

describe("isPrismaMissingRelationError", () => {
  it("detects Prisma missing-table message", () => {
    assert.equal(
      isPrismaMissingRelationError({
        code: "P2021",
        message: "The table `public.ccpayment_deposit_events` does not exist in the current database."
      }),
      true
    );
  });

  it("detects Postgres undefined_table code", () => {
    assert.equal(isPrismaMissingRelationError({ code: "42P01", message: "relation missing" }), true);
  });

  it("detects missing column (P2022)", () => {
    assert.equal(
      isPrismaMissingRelationError({
        code: "P2022",
        message: 'The column `user_vault.foo` does not exist in the current database.'
      }),
      true
    );
  });

  it("returns false for unrelated errors", () => {
    assert.equal(isPrismaMissingRelationError({ code: "P2002", message: "Unique constraint" }), false);
  });
});

describe("toNumberOrNull", () => {
  it("maps decimals and null", () => {
    assert.equal(toNumberOrNull(null), null);
    assert.equal(toNumberOrNull("12.5"), 12.5);
    assert.equal(toNumberOrNull(3), 3);
  });
});

describe("parseDossierPagination", () => {
  it("clamps limit and normalizes pages", () => {
    const p = parseDossierPagination({ limit: "200", depositsPage: "-1", withdrawalsPage: "2" });
    assert.equal(p.limit, 80);
    assert.equal(p.depositsPage, 1);
    assert.equal(p.withdrawalsPage, 2);
  });

  it("parses inventory and vault pages", () => {
    const p = parseDossierPagination({ inventoryPage: "3", vaultPage: "1" });
    assert.equal(p.inventoryPage, 3);
    assert.equal(p.vaultPage, 1);
  });
});

describe("getSupportTicketPlayerDossier", () => {
  it("returns NOT_FOUND when ticket missing", async () => {
    const prisma = {
      supportMessage: { findUnique: async () => null },
    };
    const r = await getSupportTicketPlayerDossier(prisma, 99, {});
    assert.equal(r.ok, false);
    assert.equal(r.code, "NOT_FOUND");
  });

  it("returns linked false when ticket has no userId", async () => {
    const prisma = {
      supportMessage: {
        findUnique: async () => ({
          id: 5,
          userId: null,
          name: "Guest",
          email: "g@example.com",
        }),
      },
    };
    const r = await getSupportTicketPlayerDossier(prisma, 5, {});
    assert.equal(r.ok, true);
    assert.equal(r.linked, false);
    assert.equal(r.dossier, null);
    assert.equal(r.ticket.email, "g@example.com");
  });

  it("returns dossier with empty ccpayment when ccpayment table is missing", async () => {
    const userRow = {
      id: 10,
      name: "A",
      username: "a",
      email: "a@b.c",
      walletAddress: "0xabc",
      isBanned: false,
      createdAt: new Date(),
      lastLoginAt: null,
      polBalance: 1,
      blkBalance: 2
    };
    const prisma = {
      supportMessage: {
        findUnique: async () => ({
          id: 2,
          userId: 10,
          name: "X",
          email: "x@y.z"
        })
      },
      user: { findUnique: async () => userRow },
      transaction: {
        count: async () => 0,
        findMany: async () => []
      },
      ccpaymentDepositEvent: {
        count: async () => {
          const err = new Error(
            "The table `public.ccpayment_deposit_events` does not exist in the current database."
          );
          /** @type {any} */ (err).code = "P2021";
          throw err;
        },
        findMany: async () => []
      },
      depositTicket: { count: async () => 0, findMany: async () => [] },
      payout: { count: async () => 0, findMany: async () => [] },
      userMiner: { count: async () => 0, findMany: async () => [] },
      userInventory: { count: async () => 0, findMany: async () => [] },
      userVault: { count: async () => 0, findMany: async () => [] }
    };
    const r = await getSupportTicketPlayerDossier(prisma, 2, {});
    assert.equal(r.ok, true);
    assert.equal(r.linked, true);
    assert.ok(r.dossier);
    assert.equal(r.dossier.ccpaymentDeposits.total, 0);
    assert.deepEqual(r.dossier.ccpaymentDeposits.rows, []);
  });

  it("returns dossier when vault slice throws", async () => {
    const userRow = {
      id: 10,
      name: "A",
      username: "a",
      email: "a@b.c",
      walletAddress: "0xabc",
      isBanned: false,
      createdAt: new Date(),
      lastLoginAt: null,
      polBalance: 1,
      blkBalance: 2
    };
    const prisma = {
      supportMessage: {
        findUnique: async () => ({
          id: 2,
          userId: 10,
          name: "X",
          email: "x@y.z"
        })
      },
      user: { findUnique: async () => userRow },
      transaction: {
        count: async () => 0,
        findMany: async () => []
      },
      ccpaymentDepositEvent: { count: async () => 0, findMany: async () => [] },
      depositTicket: { count: async () => 0, findMany: async () => [] },
      payout: { count: async () => 0, findMany: async () => [] },
      userMiner: { count: async () => 0, findMany: async () => [] },
      userInventory: { count: async () => 0, findMany: async () => [] },
      userVault: {
        count: async () => {
          throw new Error("unexpected vault failure");
        },
        findMany: async () => []
      }
    };
    const r = await getSupportTicketPlayerDossier(prisma, 2, {});
    assert.equal(r.ok, true);
    assert.ok(r.dossier);
    assert.equal(r.dossier.vault.total, 0);
    assert.deepEqual(r.dossier.vault.rows, []);
    assert.equal(r.dossier.depositTransactions.total, 0);
  });

  it("returns orphanTicket when user row missing", async () => {
    const prisma = {
      supportMessage: {
        findUnique: async () => ({
          id: 2,
          userId: 404,
          name: "X",
          email: "x@y.z",
        }),
      },
      user: { findUnique: async () => null },
    };
    const r = await getSupportTicketPlayerDossier(prisma, 2, {});
    assert.equal(r.ok, true);
    assert.equal(r.linked, true);
    assert.equal(r.orphanTicket, true);
    assert.equal(r.dossier, null);
  });
});
