/**
 * Shared crypto artwork for miner games (canvas memory/match-3) and Chain 2048 tiles.
 * Paths are served from `client/public/icons/`.
 */
export const CRYPTO_ICONS = Object.freeze({
  bitcoin: "/icons/bitcoin.png",
  ethereum: "/icons/ethereum.png",
  solana: "/icons/solana.png",
  "binance-coin": "/icons/binance-coin.png",
  cardano: "/icons/cardano.png",
  polkadot: "/icons/polkadot.png",
  dogecoin: "/icons/dogecoin.png",
  polygon: "/icons/polygon.png",
});

export const COIN_COLORS = Object.freeze({
  bitcoin: { bg: "rgba(247,147,26,0.25)", glow: "rgba(247,147,26,0.8)", border: "rgba(247,147,26,0.5)" },
  ethereum: { bg: "rgba(98,126,234,0.25)", glow: "rgba(98,126,234,0.8)", border: "rgba(98,126,234,0.5)" },
  solana: { bg: "rgba(20,241,149,0.20)", glow: "rgba(20,241,149,0.8)", border: "rgba(20,241,149,0.5)" },
  "binance-coin": { bg: "rgba(243,186,47,0.25)", glow: "rgba(243,186,47,0.8)", border: "rgba(243,186,47,0.5)" },
  cardano: { bg: "rgba(0,51,173,0.30)", glow: "rgba(70,130,255,0.8)", border: "rgba(70,130,255,0.5)" },
  polkadot: { bg: "rgba(230,0,122,0.22)", glow: "rgba(230,0,122,0.8)", border: "rgba(230,0,122,0.5)" },
  dogecoin: { bg: "rgba(194,166,80,0.25)", glow: "rgba(194,166,80,0.8)", border: "rgba(194,166,80,0.5)" },
  polygon: { bg: "rgba(130,71,229,0.25)", glow: "rgba(130,71,229,0.8)", border: "rgba(130,71,229,0.5)" },
});

/** Preloaded images for canvas games (same pattern as legacy Games.jsx). */
export const ICON_IMAGES = {};
for (const [k, v] of Object.entries(CRYPTO_ICONS)) {
  const img = new Image();
  img.src = v;
  ICON_IMAGES[k] = img;
}

const TILE_CRYPTO_ORDER = Object.freeze([
  "polygon",
  "dogecoin",
  "polkadot",
  "cardano",
  "binance-coin",
  "solana",
  "ethereum",
  "bitcoin",
]);

/**
 * Maps a 2048 tile value (power of two) to a crypto slug for consistent visuals with other games.
 * High values (1024+) lean on Bitcoin for a "jackpot" feel.
 * @param {number} value
 * @returns {keyof typeof CRYPTO_ICONS}
 */
export function cryptoSlugFor2048Tile(value) {
  if (!Number.isFinite(value) || value < 2) return "polygon";
  const log = Math.log2(value);
  if (!Number.isInteger(log) || log < 1) return "polygon";
  if (value >= 1024) return "bitcoin";
  return TILE_CRYPTO_ORDER[(log - 1) % TILE_CRYPTO_ORDER.length];
}
