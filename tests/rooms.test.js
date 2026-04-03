import test from "node:test";
import assert from "node:assert/strict";

// Variáveis de ambiente necessárias
process.env.NODE_ENV = "test";
process.env.ROOM_PRICES = "0,500,1200,2500,4500,7500";
process.env.ROOM_MAX = "6";
process.env.RACKS_PER_ROOM = "24";
process.env.JWT_SECRET = process.env.JWT_SECRET || "testsecret";

import * as roomsController from "../server/controllers/roomsController.js";
import prisma from "../server/src/db/prisma.js";
import * as miningRuntime from "../server/src/runtime/miningRuntime.js";
import * as minerProfileModel from "../server/models/minerProfileModel.js";

// ── Helpers de req/res ───────────────────────────────────────────
function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

function createReq(user, body = {}, query = {}) {
  return { user, body, query };
}

// ── Testes ──────────────────────────────────────────────────────

// 1. listRooms — retorna salas desbloqueadas + stubs bloqueados
test("listRooms retorna salas desbloqueadas e stubs bloqueados", async () => {
  const origFindMany = prisma.userRoom.findMany;

  prisma.userRoom.findMany = async () => [
    {
      id: 1,
      roomNumber: 1,
      pricePaid: 0,
      unlockedAt: new Date(),
      racks: [
        { id: 10, position: 0, installedAt: null, userMinerId: null, userMiner: null },
        { id: 11, position: 1, installedAt: new Date(), userMinerId: 5, userMiner: { id: 5, minerId: 2, hashRate: 100, imageUrl: null, level: 1, slotSize: 1 } },
      ],
    }
  ];

  try {
    const req = createReq({ id: 42 });
    const res = createRes();
    await roomsController.listRooms(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.rooms.length, 6); // 1 desbloqueada + 5 bloqueadas
    assert.equal(res.body.rooms[0].unlocked, true);
    assert.equal(res.body.rooms[0].racks.length, 2);
    assert.equal(res.body.rooms[1].unlocked, false);
    assert.ok(res.body.rooms[1].price >= 0);
    assert.equal(res.body.totalRacks, 2);
    assert.equal(res.body.occupiedRacks, 1);
    assert.equal(res.body.freeRacks, 1);
  } finally {
    prisma.userRoom.findMany = origFindMany;
  }
});

// 2. buyRoom — sucesso quando saldo suficiente
test("buyRoom compra sala 2 com saldo suficiente", async () => {
  const origFindMany = prisma.userRoom.findMany;
  const origFindUnique = prisma.user.findUnique;
  const origTransaction = prisma.$transaction;
  const origApplyDelta = miningRuntime.applyUserBalanceDelta;

  prisma.userRoom.findMany = async () => [
    { id: 1, roomNumber: 1 }
  ];
  prisma.user.findUnique = async () => ({ polBalance: 1000 });
  prisma.$transaction = async (fn) => {
    const fakeTx = {
      user: { update: async () => {} },
      userRoom: { create: async () => ({ id: 2, roomNumber: 2 }) },
      userRack: { createMany: async () => {} },
    };
    return fn(fakeTx);
  };
  miningRuntime.applyUserBalanceDelta = () => {};

  try {
    const req = createReq({ id: 1 });
    const res = createRes();
    await roomsController.buyRoom(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.roomNumber, 2);
  } finally {
    prisma.userRoom.findMany = origFindMany;
    prisma.user.findUnique = origFindUnique;
    prisma.$transaction = origTransaction;
    miningRuntime.applyUserBalanceDelta = origApplyDelta;
  }
});

// 3. buyRoom — falha com saldo insuficiente
test("buyRoom retorna 400 quando saldo insuficiente", async () => {
  const origFindMany = prisma.userRoom.findMany;
  const origFindUnique = prisma.user.findUnique;

  prisma.userRoom.findMany = async () => [{ id: 1, roomNumber: 1 }];
  prisma.user.findUnique = async () => ({ polBalance: 1 }); // < 500 (preço sala 2)

  try {
    const req = createReq({ id: 1 });
    const res = createRes();
    await roomsController.buyRoom(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.code, "INSUFFICIENT_BALANCE");
  } finally {
    prisma.userRoom.findMany = origFindMany;
    prisma.user.findUnique = origFindUnique;
  }
});

// 4. buyRoom — falha quando já atingiu o máximo de salas
test("buyRoom retorna 400 quando todas as salas já foram desbloqueadas", async () => {
  const origFindMany = prisma.userRoom.findMany;

  prisma.userRoom.findMany = async () =>
    [1, 2, 3, 4, 5, 6].map((n) => ({ id: n, roomNumber: n }));

  try {
    const req = createReq({ id: 1 });
    const res = createRes();
    await roomsController.buyRoom(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.code, "MAX_ROOMS_REACHED");
  } finally {
    prisma.userRoom.findMany = origFindMany;
  }
});

// 5. installMiner — instala com sucesso
test("installMiner instala máquina do inventário no rack vazio", async () => {
  const origFindFirst = prisma.userRack.findFirst;
  const origFindFirst2 = prisma.userInventory.findFirst;
  const origTransaction = prisma.$transaction;
  const origSync = minerProfileModel.syncUserBaseHashRate;

  prisma.userRack.findFirst = async () => ({
    id: 10,
    userId: 1,
    position: 0,
    userMinerId: null,
    room: { id: 1, roomNumber: 1 },
  });
  prisma.userInventory.findFirst = async () => ({
    id: 99,
    userId: 1,
    minerName: "GPU-X",
    minerId: 3,
    hashRate: 500,
    slotSize: 1,
    imageUrl: null,
    level: 1,
  });
  prisma.$transaction = async (fn) => {
    const fakeTx = {
      userMiner: { create: async () => ({ id: 55 }) },
      userRack: { update: async () => {} },
      userInventory: { delete: async () => {} },
    };
    return fn(fakeTx);
  };
  minerProfileModel.syncUserBaseHashRate = async () => {};

  try {
    const req = createReq({ id: 1 }, { rackId: 10, inventoryId: 99 });
    const res = createRes();
    await roomsController.installMiner(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
  } finally {
    prisma.userRack.findFirst = origFindFirst;
    prisma.userInventory.findFirst = origFindFirst2;
    prisma.$transaction = origTransaction;
    minerProfileModel.syncUserBaseHashRate = origSync;
  }
});

// 6. installMiner — falha quando rack já ocupado
test("installMiner retorna 400 quando rack já está ocupado", async () => {
  const origFindFirst = prisma.userRack.findFirst;

  prisma.userRack.findFirst = async () => ({
    id: 10,
    userId: 1,
    position: 0,
    userMinerId: 7, // já tem miner
    room: { id: 1, roomNumber: 1 },
  });

  try {
    const req = createReq({ id: 1 }, { rackId: 10, inventoryId: 99 });
    const res = createRes();
    await roomsController.installMiner(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.code, "RACK_OCCUPIED");
  } finally {
    prisma.userRack.findFirst = origFindFirst;
  }
});

// 7. uninstallMiner — remove com sucesso e devolve ao inventário
test("uninstallMiner remove máquina do rack e devolve ao inventário", async () => {
  const origFindFirst = prisma.userRack.findFirst;
  const origTransaction = prisma.$transaction;
  const origSync = minerProfileModel.syncUserBaseHashRate;

  prisma.userRack.findFirst = async () => ({
    id: 10,
    userId: 1,
    position: 0,
    userMinerId: 7,
    userMiner: { id: 7, minerId: 3, hashRate: 500, slotSize: 1, imageUrl: null, level: 1 },
  });
  prisma.$transaction = async (fn) => {
    const fakeTx = {
      userRack: { update: async () => {} },
      userInventory: { create: async () => {} },
      userMiner: { delete: async () => {} },
    };
    return fn(fakeTx);
  };
  minerProfileModel.syncUserBaseHashRate = async () => {};

  try {
    const req = createReq({ id: 1 }, { rackId: 10 });
    const res = createRes();
    await roomsController.uninstallMiner(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
  } finally {
    prisma.userRack.findFirst = origFindFirst;
    prisma.$transaction = origTransaction;
    minerProfileModel.syncUserBaseHashRate = origSync;
  }
});
