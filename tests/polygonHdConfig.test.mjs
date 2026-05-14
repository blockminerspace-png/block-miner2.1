import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import {
  getPolygonHdMinDepositPol,
  isPolygonHdDepositEnabled,
  isPolygonHdFeatureFlagged,
  listPolygonHdMissingEnvKeys
} from "#server/services/polygonHdConfig.js";

const ENV_KEYS = [
  "POLYGON_HD_DEPOSIT_ENABLED",
  "POLYGON_HD_MNEMONIC",
  "PHD_SERVICE_URL",
  "PHD_INTERNAL_TOKEN",
  "POLYGON_HD_MIN_DEPOSIT_POL"
];

describe("polygonHdConfig", () => {
  const snapshot = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      snapshot[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (snapshot[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = snapshot[k];
      }
    }
  });

  it("getPolygonHdMinDepositPol defaults to 1", () => {
    assert.equal(getPolygonHdMinDepositPol(), 1);
    process.env.POLYGON_HD_MIN_DEPOSIT_POL = "2.5";
    assert.equal(getPolygonHdMinDepositPol(), 2.5);
  });

  it("listPolygonHdMissingEnvKeys when flagged without secrets", () => {
    process.env.POLYGON_HD_DEPOSIT_ENABLED = "1";
    assert.ok(isPolygonHdFeatureFlagged());
    const m = listPolygonHdMissingEnvKeys();
    assert.ok(m.length > 0);
    assert.ok(!isPolygonHdDepositEnabled());
  });

  it("isPolygonHdDepositEnabled when local mnemonic set", () => {
    process.env.POLYGON_HD_DEPOSIT_ENABLED = "1";
    process.env.POLYGON_HD_MNEMONIC = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    assert.equal(listPolygonHdMissingEnvKeys().length, 0);
    assert.ok(isPolygonHdDepositEnabled());
  });
});
