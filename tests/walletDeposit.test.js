import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.DB_PATH = process.env.DB_PATH || "./data/blockminer.db";
process.env.DEPOSIT_WALLET_ADDRESS = "0xTestDepositAddress";

// Mocking the database interactions
import walletModel from "../server/models/walletModel.js";
import * as walletController from "../server/controllers/walletController.js";
import prisma from "../server/src/db/prisma.js";

function createRes() {
    return {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        }
    };
}

test("deposit returns 400 when missing txHash or amount", async (t) => {
    const req = {
        user: { id: 1 },
        body: { amount: "15" } // Missing txHash
    };
    const res = createRes();

    await walletController.requestDeposit(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body?.ok, false);
});

test("deposit returns 400 when amount is missing (only txHash provided)", async () => {
    const req = {
        user: { id: 1 },
        body: { txHash: "somehash" } // Missing amount
    };
    const res = createRes();

    await walletController.requestDeposit(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body?.ok, false);
});

test("deposit returns 400 when amount is below minimum (1 POL)", async () => {
    const req = {
        user: { id: 1 },
        body: { amount: "0.5", txHash: "abc123" }
    };
    const res = createRes();

    await walletController.requestDeposit(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body?.ok, false);
    assert.match(res.body?.message, /Minimum deposit is 1 POL/);
});

test("deposit successfully creates a deposit when valid (mock mode)", async (t) => {
    // We'll mock the walletModel.createDepositRequest since it does DB calls we might want to avoid full integration on.
    const originalCreateDepositRequest = walletModel.createDepositRequest;

    walletModel.createDepositRequest = async (userId, amount, txHash) => {
        return {
            id: 1,
            userId,
            amount,
            txHash,
            status: "completed"
        };
    };

    const req = {
        user: { id: 1 },
        body: { amount: "100.5", txHash: "0xMockedTxHashValid" }
    };
    const res = createRes();

    try {
        await walletController.requestDeposit(req, res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body?.ok, true);
        assert.match(res.body?.message, /Deposit completed and confirmed/);
    } finally {
        walletModel.createDepositRequest = originalCreateDepositRequest;
    }
});

// ── submitDeposit ────────────────────────────────────────────────────────────

test("submitDeposit returns 400 when txHash is missing", async () => {
    const req = {
        user: { id: 1 },
        body: { claimedAmount: "5" }
    };
    const res = createRes();

    await walletController.submitDeposit(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body?.ok, false);
    assert.match(res.body?.message, /Hash da transação obrigatório/);
});

test("submitDeposit returns 400 when txHash format is invalid", async () => {
    const req = {
        user: { id: 1 },
        body: { txHash: "notahash", claimedAmount: "5" }
    };
    const res = createRes();

    await walletController.submitDeposit(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body?.ok, false);
    assert.match(res.body?.message, /Hash inválido/);
});

test("submitDeposit returns 400 when claimedAmount is below 1 POL", async () => {
    const req = {
        user: { id: 1 },
        body: {
            txHash: "0x" + "a".repeat(64),
            claimedAmount: "0.3"
        }
    };
    const res = createRes();

    await walletController.submitDeposit(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body?.ok, false);
    assert.match(res.body?.message, /Depósito mínimo é 1 POL/);
});

test("submitDeposit returns 409 ALREADY_CREDITED when hash was already processed", async () => {
    const originalFindFirst = prisma.transaction.findFirst;

    prisma.transaction.findFirst = async ({ where }) => {
        if (where?.userId && where?.txHash) {
            return { id: 10, status: "completed", txHash: where.txHash };
        }
        return null;
    };

    const req = {
        user: { id: 1 },
        body: {
            txHash: "0x" + "b".repeat(64),
            claimedAmount: "5"
        }
    };
    const res = createRes();

    try {
        await walletController.submitDeposit(req, res);
        assert.equal(res.statusCode, 409);
        assert.equal(res.body?.ok, false);
        assert.equal(res.body?.code, "ALREADY_CREDITED");
    } finally {
        prisma.transaction.findFirst = originalFindFirst;
    }
});

test("submitDeposit returns 200 and queues verification for valid new hash", async () => {
    const originalFindFirst = prisma.transaction.findFirst;
    const originalCreate = prisma.transaction.create;
    const originalUpdate = prisma.user?.update;

    // No existing transaction found
    prisma.transaction.findFirst = async () => null;
    prisma.transaction.create = async ({ data }) => ({
        id: 99,
        ...data,
        status: "pending_verification"
    });

    const req = {
        user: { id: 1 },
        body: {
            txHash: "0x" + "c".repeat(64),
            claimedAmount: "2"
        }
    };
    const res = createRes();

    try {
        await walletController.submitDeposit(req, res);
        assert.equal(res.body?.ok, true);
    } finally {
        prisma.transaction.findFirst = originalFindFirst;
        prisma.transaction.create = originalCreate;
        if (originalUpdate) prisma.user.update = originalUpdate;
    }
});
