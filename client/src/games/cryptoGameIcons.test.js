import { describe, it, expect } from "vitest";
import { cryptoSlugFor2048Tile } from "./cryptoGameIcons.js";

describe("cryptoSlugFor2048Tile", () => {
  it("maps powers of two along the arena ladder", () => {
    expect(cryptoSlugFor2048Tile(2)).toBe("cardano");
    expect(cryptoSlugFor2048Tile(4)).toBe("solana");
    expect(cryptoSlugFor2048Tile(8)).toBe("binance-coin");
    expect(cryptoSlugFor2048Tile(16)).toBe("ethereum");
    expect(cryptoSlugFor2048Tile(32)).toBe("bitcoin");
    expect(cryptoSlugFor2048Tile(1024)).toBe("bitcoin");
  });
});
