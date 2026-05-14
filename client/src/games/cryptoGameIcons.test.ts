import { describe, it, expect } from "vitest";
import { cryptoSlugFor2048Tile } from "./cryptoGameIcons";

describe("cryptoSlugFor2048Tile", () => {
  it("maps powers of two along the arena ladder", () => {
    expect(cryptoSlugFor2048Tile(2)).toBe("polygon");
    expect(cryptoSlugFor2048Tile(4)).toBe("cardano");
    expect(cryptoSlugFor2048Tile("4")).toBe("cardano");
    expect(cryptoSlugFor2048Tile(8)).toBe("solana");
    expect(cryptoSlugFor2048Tile(16)).toBe("dogecoin");
    expect(cryptoSlugFor2048Tile(32)).toBe("polkadot");
    expect(cryptoSlugFor2048Tile(64)).toBe("binance-coin");
    expect(cryptoSlugFor2048Tile(128)).toBe("ethereum");
    expect(cryptoSlugFor2048Tile(256)).toBe("bitcoin");
    expect(cryptoSlugFor2048Tile(1024)).toBe("cardano");
  });

  it("falls back to polygon for invalid tile values", () => {
    expect(cryptoSlugFor2048Tile(0)).toBe("polygon");
    expect(cryptoSlugFor2048Tile(3)).toBe("polygon");
    expect(cryptoSlugFor2048Tile(Number.NaN)).toBe("polygon");
  });
});
