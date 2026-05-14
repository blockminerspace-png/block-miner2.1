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
  cardano: { bg: "rgba(28,32,40,0.96)", glow: "rgba(140,145,160,0.55)", border: "rgba(72,78,92,0.75)" },
  polkadot: { bg: "rgba(230,0,122,0.22)", glow: "rgba(230,0,122,0.8)", border: "rgba(230,0,122,0.5)" },
  dogecoin: { bg: "rgba(194,166,80,0.25)", glow: "rgba(194,166,80,0.8)", border: "rgba(194,166,80,0.5)" },
  polygon: { bg: "rgba(130,71,229,0.25)", glow: "rgba(130,71,229,0.8)", border: "rgba(130,71,229,0.5)" },
});

type CryptoSlug = keyof typeof CRYPTO_ICONS;

/** Preloaded images for canvas games (same pattern as legacy Games.jsx). */
export const ICON_IMAGES: Partial<Record<CryptoSlug, HTMLImageElement>> = {};
for (const k of Object.keys(CRYPTO_ICONS) as CryptoSlug[]) {
  const v = CRYPTO_ICONS[k];
  const img = new Image();
  img.src = v;
  ICON_IMAGES[k] = img;
}

/**
 * Low → high merge ladder (one entry per power-of-two tier: 2,4,8,…).
 * Reuses known icons in a fixed order so the sidebar matches merge progression.
 */
const TILE_CRYPTO_ORDER = [
  'polygon',
  'cardano',
  'solana',
  'dogecoin',
  'polkadot',
  'binance-coin',
  'ethereum',
  'bitcoin',
  'polygon',
  'cardano',
  'solana',
] as const satisfies readonly CryptoSlug[];

/**
 * Tile values from 2 up to `winTile` for merge-path sidebar (cap length for UI).
 * @param {number} winTile
 * @param {number} [maxSteps=14]
 * @returns {number[]}
 */
export function mergePathValues(winTile: number, maxSteps = 14): number[] {
  const cap = winTile > 0 ? winTile : 2048;
  const out: number[] = [];
  let v = 2;
  while (v <= cap && out.length < maxSteps) {
    out.push(v);
    v *= 2;
  }
  return out;
}

/**
 * Maps a 2048 tile value (power of two) to a crypto slug for consistent visuals with other games.
 * @param {number} value
 * @returns {keyof typeof CRYPTO_ICONS}
 */
export function cryptoSlugFor2048Tile(value: number | string): CryptoSlug {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 2) return "polygon";
  const log = Math.log2(n);
  if (!Number.isInteger(log) || log < 1) return "polygon";
  const idx = log - 1;
  if (idx < 0) return "polygon";
  if (idx < TILE_CRYPTO_ORDER.length) return TILE_CRYPTO_ORDER[idx]!;
  return "bitcoin";
}
