const PRICE_TTL_MS = 2 * 60 * 1000;
const priceCache = new Map();

export async function getPolUsdPrice() {
  const cached = priceCache.get("POL");
  if (cached && Date.now() - cached.timestamp < PRICE_TTL_MS) return cached.price;

  try {
    // Try primary name
    let res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=polygon-ecosystem-token&vs_currencies=usd`);
    let data = await res.json();
    let price = data['polygon-ecosystem-token']?.usd;

    if (!price) {
      // Fallback to matic-network
      res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=matic-network&vs_currencies=usd`);
      data = await res.json();
      price = data['matic-network']?.usd;
    }

    if (price) {
      priceCache.set("POL", { price, timestamp: Date.now() });
      return price;
    }
  } catch (error) {
    console.error("Error fetching POL price from CoinGecko:", error.message);
  }

  if (cached) {
    console.warn("Using stale POL price cache.");
    return cached.price; // Allow stale cache if network fails
  }

  throw new Error("Não foi possível obter o preço atual do POL. Tente novamente mais tarde.");
}
