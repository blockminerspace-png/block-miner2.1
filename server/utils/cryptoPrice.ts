
import loggerLib from "../utils/logger.js";
const logger = loggerLib.child("cryptoPrice");
const PRICE_TTL_MS = 2 * 60 * 1000;
const priceCache = new Map<string, { price: number; timestamp: number }>();
const inflightPriceFetches = new Map<string, Promise<number>>();
const historicalPriceCache = new Map<string, number>();
const inflightHistoricalFetches = new Map<string, Promise<number>>();

async function fetchCoinGeckoPrice(ids: string, key: string): Promise<number | null> {
  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
    { signal: AbortSignal.timeout(10_000) }
  );
  if (!res.ok) {
    throw new Error(`CoinGecko HTTP ${res.status}`);
  }
  const data = await res.json();
  return data[key]?.usd ?? null;
}

async function fetchBinanceTickerPrice(symbol: string): Promise<number | null> {
  const res = await fetch(
    `https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`,
    { signal: AbortSignal.timeout(8_000) }
  );
  if (!res.ok) throw new Error(`Binance HTTP ${res.status}`);
  const data = await res.json() as { price?: string };
  const price = Number(data?.price);
  return Number.isFinite(price) && price > 0 ? price : null;
}

function toHistoryDateParam(timestampSec: number): string {
  const d = new Date(timestampSec * 1000);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = String(d.getUTCFullYear());
  return `${day}-${month}-${year}`;
}

async function fetchCoinGeckoHistoricalPrice(id: string, timestampSec: number): Promise<number | null> {
  const date = toHistoryDateParam(timestampSec);
  const res = await fetch(
    `https://api.coingecko.com/api/v3/coins/${id}/history?date=${date}&localization=false`,
    { signal: AbortSignal.timeout(12_000) },
  );
  if (!res.ok) {
    throw new Error(`CoinGecko HTTP ${res.status}`);
  }
  const data = await res.json() as {
    market_data?: { current_price?: { usd?: number } };
  };
  return data?.market_data?.current_price?.usd ?? null;
}

async function getCachedPrice(cacheKey: string, fetcher: () => Promise<number | null>): Promise<number> {
  const cached = priceCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < PRICE_TTL_MS) return cached.price;

  const inflight = inflightPriceFetches.get(cacheKey);
  if (inflight) return inflight;

  const fetchPromise = (async () => {
    try {
      const price = await fetcher();
      if (price != null) {
        priceCache.set(cacheKey, { price, timestamp: Date.now() });
        return price;
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Error fetching ${cacheKey} price from CoinGecko:`, { error: String(msg) });
    }

    if (cached) {
      logger.warn(`Using stale ${cacheKey} price cache.`);
      return cached.price;
    }

    throw new Error(`Não foi possível obter o preço atual do ${cacheKey}.`);
  })();

  inflightPriceFetches.set(cacheKey, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    inflightPriceFetches.delete(cacheKey);
  }
}

async function getHistoricalCachedPrice(cacheKey: string, timestampSec: number, fetcher: () => Promise<number | null>): Promise<number> {
  const dateKey = toHistoryDateParam(timestampSec);
  const cacheId = `${cacheKey}:${dateKey}`;
  const cached = historicalPriceCache.get(cacheId);
  if (cached != null) return cached;

  const inflight = inflightHistoricalFetches.get(cacheId);
  if (inflight) return inflight;

  const fetchPromise = (async () => {
    const price = await fetcher();
    if (price != null) {
      historicalPriceCache.set(cacheId, price);
      return price;
    }
    throw new Error(`Não foi possível obter o preço histórico de ${cacheKey} em ${dateKey}.`);
  })();

  inflightHistoricalFetches.set(cacheId, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    inflightHistoricalFetches.delete(cacheId);
  }
}

export async function getPolUsdPrice(): Promise<number> {
  return getCachedPrice("POL", async () => {
    let price = await fetchCoinGeckoPrice("polygon-ecosystem-token", "polygon-ecosystem-token");
    if (!price) price = await fetchCoinGeckoPrice("matic-network", "matic-network");
    if (!price) price = await fetchBinanceTickerPrice("POLUSDT");
    if (!price) price = await fetchBinanceTickerPrice("MATICUSDT");
    return price;
  });
}

export async function getPolUsdPriceAt(timestampSec: number): Promise<number> {
  return getHistoricalCachedPrice("POL", timestampSec, async () => {
    let price = await fetchCoinGeckoHistoricalPrice("polygon-ecosystem-token", timestampSec);
    if (!price) price = await fetchCoinGeckoHistoricalPrice("matic-network", timestampSec);
    return price;
  });
}

export async function getBtcUsdPrice(): Promise<number> {
  return getCachedPrice("BTC", () => fetchCoinGeckoPrice("bitcoin", "bitcoin"));
}

export async function getBtcUsdPriceAt(timestampSec: number): Promise<number> {
  return getHistoricalCachedPrice("BTC", timestampSec, () => fetchCoinGeckoHistoricalPrice("bitcoin", timestampSec));
}

export async function getEthUsdPrice(): Promise<number> {
  return getCachedPrice("ETH", () => fetchCoinGeckoPrice("ethereum", "ethereum"));
}

export async function getEthUsdPriceAt(timestampSec: number): Promise<number> {
  return getHistoricalCachedPrice("ETH", timestampSec, () => fetchCoinGeckoHistoricalPrice("ethereum", timestampSec));
}

export async function getShibUsdPrice(): Promise<number> {
  return getCachedPrice("SHIB", async () => {
    let price = await fetchCoinGeckoPrice("shiba-inu", "shiba-inu");
    if (!price) price = await fetchBinanceTickerPrice("SHIBUSDT");
    return price;
  });
}
