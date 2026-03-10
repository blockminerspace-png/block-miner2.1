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
