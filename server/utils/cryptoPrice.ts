const PRICE_TTL_MS = 2 * 60 * 1000;
const priceCache = new Map<string, { price: number; timestamp: number }>();
const inflightPriceFetches = new Map<string, Promise<number>>();

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
      console.error(`Error fetching ${cacheKey} price from CoinGecko:`, msg);
    }

    if (cached) {
      console.warn(`Using stale ${cacheKey} price cache.`);
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

export async function getPolUsdPrice(): Promise<number> {
  return getCachedPrice("POL", async () => {
    let price = await fetchCoinGeckoPrice("polygon-ecosystem-token", "polygon-ecosystem-token");
    if (!price) price = await fetchCoinGeckoPrice("matic-network", "matic-network");
    return price;
  });
}

export async function getBtcUsdPrice(): Promise<number> {
  return getCachedPrice("BTC", () => fetchCoinGeckoPrice("bitcoin", "bitcoin"));
}

export async function getEthUsdPrice(): Promise<number> {
  return getCachedPrice("ETH", () => fetchCoinGeckoPrice("ethereum", "ethereum"));
}
