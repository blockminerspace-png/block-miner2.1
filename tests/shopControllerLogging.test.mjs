import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const shopController = readFileSync(
  new URL("../server/modules/shop/shop.controller.ts", import.meta.url),
  "utf8",
);

test("shop controller registra tentativa, rejeicoes e sucesso com logs estruturados", () => {
  assert.match(shopController, /logger\.info\("purchaseMiner attempt"/);
  assert.match(shopController, /logger\.warn\("purchaseMiner invalid minerId"/);
  assert.match(shopController, /logger\.warn\("purchaseMiner invalid quantity"/);
  assert.match(shopController, /logger\.warn\("purchaseMiner rejected"/);
  assert.match(shopController, /logger\.warn\("purchaseMiner insufficient balance"/);
  assert.match(shopController, /logger\.info\(\s*"purchaseMiner success"/);
  assert.match(shopController, /logUserActivity\("FIN_SHOP_PURCHASE"/);
});

test("shop controller registra eventos de seguranca para idempotencia e conflitos", () => {
  assert.match(shopController, /logSecurityWarn\("SHOP_IDEMPOTENCY_MISMATCH"/);
  assert.match(shopController, /logSecurityWarn\("SHOP_IDEMPOTENCY_BUSY"/);
  assert.match(shopController, /logSecurityEvent\("SHOP_IDEMPOTENCY_REPLAY"/);
  assert.match(shopController, /logSecurityWarn\("SHOP_PURCHASE_TX_CONFLICT"/);
  assert.match(shopController, /logSecurityWarn\("SHOP_PURCHASE_LOCK_BUSY"/);
});

test("shop controller preserva detalhes financeiros uteis no log de compra", () => {
  assert.match(shopController, /balanceBefore/);
  assert.match(shopController, /unitPrice/);
  assert.match(shopController, /totalPrice/);
  assert.match(shopController, /newBalance/);
});
