import test from "node:test";
import assert from "node:assert/strict";
import walletModel from "../server/models/walletModel.js";
import * as walletController from "../server/controllers/walletController.js";

// Mocking the environment
process.env.NODE_ENV = "test";

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

test("withdraw returns 409 when there is pending withdrawal", async () => {
  const oldCreate = walletModel.createWithdrawal;

  walletModel.createWithdrawal = async () => {
    throw new Error("Pending withdrawal exists");
  };

  const req = {
    user: { id: 1 },
    body: { amount: "15", address: "0x000000000000000000000000000000000000dead" },
    get: () => "",
    headers: {}
  };
  const res = createRes();

  try {
    await walletController.requestWithdrawal(req, res);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body?.ok, false);
    assert.equal(res.body?.message, "Pending withdrawal exists");
  } finally {
    walletModel.createWithdrawal = oldCreate;
  }
});

test("withdraw creates pending transaction when request is valid", async () => {
  const oldCreate = walletModel.createWithdrawal;

  const mockTransaction = {
    id: 999,
    userId: 5,
    amount: "12.5",
    address: "0x000000000000000000000000000000000000dEaD",
    status: "pending"
  };

  walletModel.createWithdrawal = async () => mockTransaction;

  const req = {
    user: { id: 5 },
    body: { amount: "12.5", address: "0x000000000000000000000000000000000000dEaD" },
    get: () => "test-agent",
    headers: {}
  };
  const res = createRes();

  try {
    await walletController.requestWithdrawal(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body?.ok, true);
    assert.deepEqual(res.body?.transaction, mockTransaction);
  } finally {
    walletModel.createWithdrawal = oldCreate;
  }
});

test("withdraw returns 400 when amount is below minimum (10 POL)", async () => {
  const req = {
    user: { id: 1 },
    body: { amount: "5", address: "0x000000000000000000000000000000000000dead" },
    get: () => "",
    headers: {}
  };
  const res = createRes();

  await walletController.requestWithdrawal(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body?.ok, false);
  assert.match(res.body?.message, /Minimum withdrawal is 10 POL/);
});

test("withdraw returns 400 when wallet address format is invalid", async () => {
  const req = {
    user: { id: 1 },
    body: { amount: "15", address: "not-a-valid-address" },
    get: () => "",
    headers: {}
  };
  const res = createRes();

  await walletController.requestWithdrawal(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body?.ok, false);
  assert.match(res.body?.message, /Invalid wallet address format/);
});

test("withdraw returns 400 when amount is missing", async () => {
  const req = {
    user: { id: 1 },
    body: { address: "0x000000000000000000000000000000000000dead" },
    get: () => "",
    headers: {}
  };
  const res = createRes();

  await walletController.requestWithdrawal(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body?.ok, false);
  assert.match(res.body?.message, /Amount and address are required/);
});

test("withdraw returns 400 when address is missing", async () => {
  const req = {
    user: { id: 1 },
    body: { amount: "15" },
    get: () => "",
    headers: {}
  };
  const res = createRes();

  await walletController.requestWithdrawal(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body?.ok, false);
  assert.match(res.body?.message, /Amount and address are required/);
});
