import test from "node:test";
import assert from "node:assert/strict";

// VariÃ¡veis de ambiente â€” precisam ser definidas ANTES dos imports
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@localhost:5432/test";
process.env.ROOM_PRICES = "0,100,500,750";
process.env.ROOM_MAX = "4";
process.env.RACKS_PER_ROOM = "4"; // reduzido para testes
process.env.JWT_SECRET = process.env.JWT_SECRET || "testsecret";

import * as roomsController from "../server/controllers/roomsController.js";
import prisma from "../server/src/db/prisma.js";
import * as miningRuntime from "../server/src/runtime/miningRuntime.js";
import * as minerProfileModel from "../server/models/minerProfileModel.js";

// â”€â”€ Helpers de req/res â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Testes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// 1. listRooms â€” retorna salas desbloqueadas + stubs bloqueados
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
    assert.equal(res.body.rooms.length, 4); // 1 desbloqueada + 3 bloqueadas
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

// 2. buyRoom â€” sucesso quando saldo suficiente
test("buyRoom compra sala 2 com saldo suficiente", async () => {
  const origFindMany = prisma.userRoom.findMany;
  const origFindUnique = prisma.user.findUnique;
  const origTransaction = prisma.$transaction;

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

  }
});

// 3. buyRoom â€” falha com saldo insuficiente
test("buyRoom retorna 400 quando saldo insuficiente", async () => {
  const origFindMany = prisma.userRoom.findMany;
  const origFindUnique = prisma.user.findUnique;

  prisma.userRoom.findMany = async () => [{ id: 1, roomNumber: 1 }];
  prisma.user.findUnique = async () => ({ polBalance: 1 }); // < 100 (preÃ§o sala 2)

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

// 4. buyRoom â€” falha quando jÃ¡ atingiu o mÃ¡ximo de salas
test("buyRoom retorna 400 quando todas as salas jÃ¡ foram desbloqueadas", async () => {
  const origFindMany = prisma.userRoom.findMany;

  prisma.userRoom.findMany = async () =>
    [1, 2, 3, 4].map((n) => ({ id: n, roomNumber: n }));

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

// 5. installMiner â€” instala com sucesso
test("installMiner instala mÃ¡quina do inventÃ¡rio no rack vazio", async () => {
  const origFindFirst = prisma.userRack.findFirst;
  const origFindFirst2 = prisma.userInventory.findFirst;
  const origTransaction = prisma.$transaction;
  // syncUserBaseHashRate é read-only ESM binding; mockar prisma internamente
  const origMinerFindMany = prisma.userMiner.findMany;
  const origPowerGame = prisma.userPowerGame?.findMany;
  const origYtPower = prisma.youtubeWatchPower?.findMany;
  const origGpuPower = prisma.autoMiningGpu?.findMany;

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
  prisma.userMiner.findMany = async () => [];
  if (prisma.userPowerGame) prisma.userPowerGame.findMany = async () => [];
  if (prisma.youtubeWatchPower) prisma.youtubeWatchPower.findMany = async () => [];
  if (prisma.autoMiningGpu) prisma.autoMiningGpu.findMany = async () => [];

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
    prisma.userMiner.findMany = origMinerFindMany;
    if (prisma.userPowerGame && origPowerGame) prisma.userPowerGame.findMany = origPowerGame;
    if (prisma.youtubeWatchPower && origYtPower) prisma.youtubeWatchPower.findMany = origYtPower;
    if (prisma.autoMiningGpu && origGpuPower) prisma.autoMiningGpu.findMany = origGpuPower;
  }
});

// 6. installMiner â€” falha quando rack jÃ¡ ocupado
test("installMiner retorna 400 quando rack jÃ¡ estÃ¡ ocupado", async () => {
  const origFindFirst = prisma.userRack.findFirst;

  prisma.userRack.findFirst = async () => ({
    id: 10,
    userId: 1,
    position: 0,
    userMinerId: 7, // jÃ¡ tem miner
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

// 7. uninstallMiner â€” remove com sucesso e devolve ao inventÃ¡rio
test("uninstallMiner remove mÃ¡quina do rack e devolve ao inventÃ¡rio", async () => {
  const origFindFirst = prisma.userRack.findFirst;
  const origTransaction = prisma.$transaction;
  const origMinerFindMany = prisma.userMiner.findMany;
  const origPowerGame = prisma.userPowerGame?.findMany;
  const origYtPower = prisma.youtubeWatchPower?.findMany;
  const origGpuPower = prisma.autoMiningGpu?.findMany;

  const mockMiner = { id: 55, minerId: 3, level: 1, hashRate: 500, slotSize: 1, imageUrl: null };
  prisma.userRack.findFirst = async () => ({ id: 10, userId: 1, userMiner: mockMiner });
  prisma.$transaction = async (fn) => {
    const fakeTx = {
      userRack: { update: async () => {} },
      userInventory: { create: async () => {} },
      userMiner: { delete: async () => {} },
    };
    return fn(fakeTx);
  };
  prisma.userMiner.findMany = async () => [];
  if (prisma.userPowerGame) prisma.userPowerGame.findMany = async () => [];
  if (prisma.youtubeWatchPower) prisma.youtubeWatchPower.findMany = async () => [];
  if (prisma.autoMiningGpu) prisma.autoMiningGpu.findMany = async () => [];

  try {
    const req = createReq({ id: 1 }, { rackId: 10 });
    const res = createRes();
    await roomsController.uninstallMiner(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
  } finally {
    prisma.userRack.findFirst = origFindFirst;
    prisma.$transaction = origTransaction;
    prisma.userMiner.findMany = origMinerFindMany;
    if (prisma.userPowerGame && origPowerGame) prisma.userPowerGame.findMany = origPowerGame;
    if (prisma.youtubeWatchPower && origYtPower) prisma.youtubeWatchPower.findMany = origYtPower;
    if (prisma.autoMiningGpu && origGpuPower) prisma.autoMiningGpu.findMany = origGpuPower;
  }
});

// 8. uninstallMiner â€” rack sem mÃ¡quina
test("uninstallMiner retorna 400 RACK_EMPTY quando rack estÃ¡ vazio", async () => {
  const origFindFirst = prisma.userRack.findFirst;
  prisma.userRack.findFirst = async () => ({ id: 10, userId: 1, userMiner: null });

  try {
    const req = createReq({ id: 1 }, { rackId: 10 });
    const res = createRes();
    await roomsController.uninstallMiner(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.code, "RACK_EMPTY");
  } finally {
    prisma.userRack.findFirst = origFindFirst;
  }
});

// 9. uninstallMiner â€” rack nÃ£o encontrado
test("uninstallMiner retorna 404 quando rack nÃ£o pertence ao usuÃ¡rio", async () => {
  const origFindFirst = prisma.userRack.findFirst;
  prisma.userRack.findFirst = async () => null;

  try {
    const req = createReq({ id: 1 }, { rackId: 999 });
    const res = createRes();
    await roomsController.uninstallMiner(req, res);

    assert.equal(res.statusCode, 404);
    assert.equal(res.body.ok, false);
  } finally {
    prisma.userRack.findFirst = origFindFirst;
  }
});

// 10. installMiner â€” rackId invÃ¡lido (string)
test("installMiner retorna 400 para rackId invÃ¡lido", async () => {
  const req = createReq({ id: 1 }, { rackId: "abc", inventoryId: 1 });
  const res = createRes();
  await roomsController.installMiner(req, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /rackId/i);
});

// 11. installMiner â€” inventoryId invÃ¡lido (zero)
test("installMiner retorna 400 para inventoryId = 0", async () => {
  const req = createReq({ id: 1 }, { rackId: 1, inventoryId: 0 });
  const res = createRes();
  await roomsController.installMiner(req, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /inventoryId/i);
});

// 12. installMiner â€” item de inventÃ¡rio nÃ£o existe
test("installMiner retorna 404 quando item de inventÃ¡rio nÃ£o existe", async () => {
  const origRack = prisma.userRack.findFirst;
  const origInv = prisma.userInventory.findFirst;

  prisma.userRack.findFirst = async () => ({
    id: 1, userId: 1, userMinerId: null, position: 0,
    room: { id: 1, roomNumber: 1 },
  });
  prisma.userInventory.findFirst = async () => null;

  try {
    const req = createReq({ id: 1 }, { rackId: 1, inventoryId: 999 });
    const res = createRes();
    await roomsController.installMiner(req, res);
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.ok, false);
  } finally {
    prisma.userRack.findFirst = origRack;
    prisma.userInventory.findFirst = origInv;
  }
});

// 13. uninstallMiner â€” rackId invÃ¡lido (negativo)
test("uninstallMiner retorna 400 para rackId invÃ¡lido", async () => {
  const req = createReq({ id: 1 }, { rackId: -5 });
  const res = createRes();
  await roomsController.uninstallMiner(req, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /rackId/i);
});

// 14. listRooms â€” retorna 500 em erro de banco
test("listRooms retorna 500 em erro de banco", async () => {
  const origFindMany = prisma.userRoom.findMany;
  prisma.userRoom.findMany = async () => { throw new Error("DB crash"); };

  try {
    const res = createRes();
    await roomsController.listRooms(createReq({ id: 1 }), res);
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.ok, false);
  } finally {
    prisma.userRoom.findMany = origFindMany;
  }
});

// 15. buyRoom â€” usuÃ¡rio nÃ£o encontrado no banco
test("buyRoom retorna 404 quando usuÃ¡rio nÃ£o existe", async () => {
  const origFindMany = prisma.userRoom.findMany;
  const origFindUnique = prisma.user.findUnique;

  prisma.userRoom.findMany = async () => [{ id: 1, roomNumber: 1 }]; // nextRoom = 2, price = 100
  prisma.user.findUnique = async () => null;

  try {
    const req = createReq({ id: 1 });
    const res = createRes();
    await roomsController.buyRoom(req, res);
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.ok, false);
  } finally {
    prisma.userRoom.findMany = origFindMany;
    prisma.user.findUnique = origFindUnique;
  }
});

// 16. buyRoom â€” sala 1 grÃ¡tis (sem deduÃ§Ã£o de saldo)
test("buyRoom desbloqueia sala 1 gratuitamente sem deduzir saldo", async () => {
  const origFindMany = prisma.userRoom.findMany;
  const origTransaction = prisma.$transaction;
  // applyUserBalanceDelta é ESM read-only; é no-op quando sem engine (miningEngine = null)

  let userUpdateCalled = false;
  prisma.userRoom.findMany = async () => []; // nenhuma sala → nextRoom=1, price=0
  prisma.$transaction = async (fn) => {
    const fakeTx = {
      user: { update: async () => { userUpdateCalled = true; } },
      userRoom: { create: async () => ({ id: 1, roomNumber: 1 }) },
      userRack: { createMany: async () => {} },
    };
    return fn(fakeTx);
  };

  try {
    const req = createReq({ id: 1 });
    const res = createRes();
    await roomsController.buyRoom(req, res);

    assert.equal(res.body.ok, true);
    assert.equal(res.body.roomNumber, 1);
    // saldo nÃ£o deve ser deduzido quando price = 0
    assert.equal(userUpdateCalled, false);
  } finally {
    prisma.userRoom.findMany = origFindMany;
    prisma.$transaction = origTransaction;
  }
});

// 17. getSlotsSummary â€” retorna totais corretos
test("getSlotsSummary retorna summary de racks e inventÃ¡rio", async () => {
  const origCount = prisma.userRack.count;
  const origInvCount = prisma.userInventory.count;

  prisma.userRack.count = async ({ where } = {}) =>
    where?.userMinerId ? 3 : 10;
  prisma.userInventory.count = async () => 5;

  try {
    const req = createReq({ id: 1 });
    const res = createRes();
    await roomsController.getSlotsSummary(req, res);

    assert.equal(res.body.ok, true);
    assert.equal(res.body.totalRacks, 10);
    assert.equal(res.body.occupiedRacks, 3);
    assert.equal(res.body.freeRacks, 7);
    assert.equal(res.body.inventoryCount, 5);
  } finally {
    prisma.userRack.count = origCount;
    prisma.userInventory.count = origInvCount;
  }
});

// 18. getSlotsSummary â€” retorna 500 em erro de banco
test("getSlotsSummary retorna 500 em erro de banco", async () => {
  const origCount = prisma.userRack.count;
  prisma.userRack.count = async () => { throw new Error("DB fail"); };

  try {
    const req = createReq({ id: 1 });
    const res = createRes();
    await roomsController.getSlotsSummary(req, res);
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.ok, false);
  } finally {
    prisma.userRack.count = origCount;
  }
});


