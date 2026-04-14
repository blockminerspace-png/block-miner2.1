// --- Configuration ---
const CRYPTO_DATA = {
  bitcoin: { symbol: "btc", pair: "btcusdt", tvSymbol: "BINANCE:BTCUSDT" },
  ethereum: { symbol: "eth", pair: "ethusdt", tvSymbol: "BINANCE:ETHUSDT" },
  solana: { symbol: "sol", pair: "solusdt", tvSymbol: "BINANCE:SOLUSDT" },
  ripple: { symbol: "xrp", pair: "xrpusdt", tvSymbol: "BINANCE:XRPUSDT" }
};

let tvWidget = null;
let currentActiveSymbol = "bitcoin";

/** User-facing copy (en + pt-BR + es) — static broadcast page, no React i18n. */
const CHROMELESS_I18N = {
  en: {
    line1:
      "In a normal Chrome tab the address bar and tabs always stay visible — websites cannot remove them.",
    line2:
      "Use the button below (or F11 on Windows/Linux). For a window with almost no Chrome UI, install this page as an app, or launch: chrome.exe --kiosk and this URL.",
    btnFs: "Enter fullscreen",
    btnInstall: "Install as app"
  },
  "pt-BR": {
    line1:
      "Num separador normal do Chrome a barra de endereço e os separadores ficam sempre visíveis — o site não consegue tirá-los sozinho.",
    line2:
      "Use o botão abaixo (ou F11 no Windows/Linux). Para quase sem interface, instale esta página como aplicação, ou arranque o Chrome com --kiosk e este URL.",
    btnFs: "Entrar em tela cheia",
    btnInstall: "Instalar como aplicação"
  },
  es: {
    line1:
      "En una pestaña normal de Chrome la barra de direcciones y las pestañas siguen visibles: la página no puede quitarlas sola.",
    line2:
      "Usa el botón (o F11 en Windows/Linux). Para casi sin interfaz, instala esta página como app, o inicia Chrome con --kiosk y esta URL.",
    btnFs: "Pantalla completa",
    btnInstall: "Instalar como app"
  }
};

function pickChromelessLocale() {
  const lang = String(navigator.language || "en").toLowerCase();
  if (lang.startsWith("pt")) return CHROMELESS_I18N["pt-BR"];
  if (lang.startsWith("es")) return CHROMELESS_I18N.es;
  return CHROMELESS_I18N.en;
}

function isStandaloneOrFullscreenDisplayMode() {
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
    if (window.matchMedia("(display-mode: fullscreen)").matches) return true;
    if (window.matchMedia("(display-mode: minimal-ui)").matches) return true;
  } catch {
    /* ignore */
  }
  return Boolean(navigator.standalone);
}

function hideChromelessBar() {
  const bar = document.getElementById("chromeless-bar");
  if (bar) bar.classList.add("hidden");
  document.body.classList.remove("body--chromeless-pad");
}

async function requestDocumentFullscreen() {
  const root = document.documentElement;
  if (document.fullscreenElement) {
    hideChromelessBar();
    return true;
  }
  try {
    if (root.requestFullscreen) {
      try {
        await root.requestFullscreen({ navigationUI: "hide" });
      } catch {
        await root.requestFullscreen();
      }
    } else if (root.webkitRequestFullscreen) {
      root.webkitRequestFullscreen();
    } else if (root.msRequestFullscreen) {
      root.msRequestFullscreen();
    } else {
      return false;
    }
  } catch {
    return false;
  }
  return Boolean(document.fullscreenElement);
}

/**
 * Normal Chrome tabs cannot hide the omnibox without user gesture, fullscreen API, PWA, or --kiosk.
 */
function initChromelessUi() {
  if (isStandaloneOrFullscreenDisplayMode()) {
    hideChromelessBar();
    return;
  }

  document.body.classList.add("body--chromeless-pad");

  const t = pickChromelessLocale();
  const line1 = document.getElementById("chromeless-line1");
  const line2 = document.getElementById("chromeless-line2");
  const btnFs = document.getElementById("btn-enter-fullscreen");
  const btnIn = document.getElementById("btn-install-pwa");
  if (line1) line1.textContent = t.line1;
  if (line2) line2.textContent = t.line2;
  if (btnFs) btnFs.textContent = t.btnFs;
  if (btnIn) btnIn.textContent = t.btnInstall;

  document.addEventListener("fullscreenchange", () => {
    if (document.fullscreenElement) {
      hideChromelessBar();
      return;
    }
    if (!isStandaloneOrFullscreenDisplayMode()) {
      const bar = document.getElementById("chromeless-bar");
      if (bar) bar.classList.remove("hidden");
      document.body.classList.add("body--chromeless-pad");
    }
  });

  btnFs?.addEventListener("click", async () => {
    const ok = await requestDocumentFullscreen();
    if (ok) hideChromelessBar();
  });

  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (btnIn) {
      btnIn.hidden = false;
      btnIn.classList.remove("hidden");
    }
  });

  btnIn?.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try {
      await deferredPrompt.userChoice;
    } catch {
      /* ignore */
    }
    deferredPrompt = null;
    btnIn.classList.add("hidden");
    btnIn.hidden = true;
  });

  window.addEventListener("load", () => {
    void requestDocumentFullscreen();
  });
}

function updateClock() {
  const clockElement = document.getElementById("clock");
  const dateElement = document.getElementById("date");
  const now = new Date();

  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  clockElement.textContent = `${hours}:${minutes}:${seconds}`;

  const options = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
  dateElement.textContent = now.toLocaleDateString("en-US", options);
}

function initWebSockets() {
  const streamNames = Object.values(CRYPTO_DATA)
    .map((d) => `${d.pair}@ticker`)
    .join("/");
  const wsUrl = `wss://stream.binance.com:9443/ws/${streamNames}`;

  const ws = new WebSocket(wsUrl);

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    const pair = data.s.toLowerCase();

    const cryptoKey = Object.keys(CRYPTO_DATA).find((key) => CRYPTO_DATA[key].pair === pair);
    if (cryptoKey) {
      updateCryptoUI(cryptoKey, {
        price: parseFloat(data.c),
        change: parseFloat(data.P)
      });
    }
    updateStatus(true);
  };

  ws.onerror = () => updateStatus(false);
  ws.onclose = () => {
    updateStatus(false);
    setTimeout(initWebSockets, 5000);
  };
}

function updateCryptoUI(id, data) {
  const config = CRYPTO_DATA[id];
  const priceElement = document.getElementById(`${config.symbol}-price`);
  const changeElement = document.getElementById(`${config.symbol}-change`);

  if (!priceElement || !changeElement) return;

  const formattedPrice = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "usd",
    minimumFractionDigits: data.price < 1 ? 4 : 2
  }).format(data.price);

  const oldPrice = priceElement.textContent;
  priceElement.textContent = formattedPrice;

  if (oldPrice !== "$ --,---" && oldPrice !== formattedPrice) {
    priceElement.style.animation = "none";
    priceElement.offsetHeight;
    priceElement.style.animation = data.change >= 0 ? "flashGreen 0.5s" : "flashRed 0.5s";
  }

  changeElement.textContent = `${data.change >= 0 ? "+" : ""}${data.change.toFixed(2)}%`;
  changeElement.className = `crypto-change ${data.change >= 0 ? "up" : "down"}`;
}

function updateStatus(isOnline) {
  const statusText = document.getElementById("status-text");
  const statusDot = document.querySelector(".status-dot");

  if (isOnline) {
    statusText.textContent = "LIVE DATA: BINANCE WEBSOCKET";
    statusDot.style.backgroundColor = "#00ff88";
    statusDot.style.boxShadow = "0 0 10px #00ff88";
  } else {
    statusText.textContent = "RECONNECTING TO STREAM...";
    statusDot.style.backgroundColor = "#ff3e3e";
    statusDot.style.boxShadow = "0 0 10px #ff3e3e";
  }
}

function initTicker() {
  const container = document.getElementById("tv-ticker-container");
  if (!container) return;

  const script = document.createElement("script");
  script.type = "text/javascript";
  script.src = "https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js";
  script.async = true;
  script.text = JSON.stringify({
    symbols: [
      { proName: "FOREXCOM:SPXUSD", title: "S&P 500" },
      { description: "Apple", proName: "NASDAQ:AAPL" },
      { description: "Nvidia", proName: "NASDAQ:NVDA" },
      { description: "Tesla", proName: "NASDAQ:TSLA" },
      { description: "Microsoft", proName: "NASDAQ:MSFT" },
      { description: "Amazon", proName: "NASDAQ:AMZN" }
    ],
    showSymbolLogo: true,
    isTransparent: true,
    displayMode: "adaptive",
    colorTheme: "dark",
    locale: "en"
  });
  container.appendChild(script);
}

function initTradingView(symbol = "BINANCE:BTCUSDT") {
  tvWidget = new TradingView.widget({
    autosize: true,
    symbol,
    interval: "H",
    timezone: "Etc/UTC",
    theme: "dark",
    style: "1",
    locale: "en",
    toolbar_bg: "#f1f3f6",
    enable_publishing: false,
    hide_top_toolbar: true,
    save_image: false,
    container_id: "tradingview_chart",
    backgroundColor: "rgba(0, 0, 0, 0)",
    gridColor: "rgba(255, 255, 255, 0.05)"
  });
}

function switchChart(id) {
  if (currentActiveSymbol === id) return;

  document.querySelectorAll(".crypto-card").forEach((card) => card.classList.remove("active"));
  document.getElementById(`${CRYPTO_DATA[id].symbol}-card`).classList.add("active");

  currentActiveSymbol = id;

  if (tvWidget) {
    document.getElementById("tradingview_chart").innerHTML = "";
    initTradingView(CRYPTO_DATA[id].tvSymbol);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initChromelessUi();

  setInterval(updateClock, 1000);
  updateClock();

  initWebSockets();
  initTradingView();
  initTicker();

  Object.keys(CRYPTO_DATA).forEach((id) => {
    const card = document.getElementById(`${CRYPTO_DATA[id].symbol}-card`);
    if (card) {
      card.style.cursor = "pointer";
      card.addEventListener("click", () => switchChart(id));
    }
  });

  const btcCard = document.getElementById("btc-card");
  if (btcCard) btcCard.classList.add("active");

  fetchGlobalStats();
  fetchFearGreed();
  setInterval(fetchGlobalStats, 300000);
  setInterval(fetchFearGreed, 3600000);
});

async function fetchGlobalStats() {
  try {
    const response = await fetch("https://api.coingecko.com/api/v3/global");
    const data = await response.json();
    const global = data.data;

    document.getElementById("btc-dom").textContent = `${global.market_cap_percentage.btc.toFixed(1)}%`;

    const totalCap = global.total_market_cap.usd / 1e12;
    document.getElementById("total-cap").textContent = `$${totalCap.toFixed(2)}T`;
  } catch (e) {
    console.error("Global stats error:", e);
  }
}

async function fetchFearGreed() {
  try {
    const response = await fetch("https://api.alternative.me/fng/");
    const data = await response.json();
    const fng = data.data[0];

    const fgValue = document.getElementById("fg-value");
    fgValue.textContent = `${fng.value} (${fng.value_classification})`;

    if (fng.value <= 40) fgValue.style.color = "#ff3e3e";
    else if (fng.value >= 60) fgValue.style.color = "#00ff88";
    else fgValue.style.color = "#ffcc00";
  } catch (e) {
    console.error("Fear/Greed error:", e);
  }
}

const style = document.createElement("style");
style.textContent = `
    @keyframes flashGreen {
        0% { color: #00ff88; text-shadow: 0 0 10px #00ff88; transform: scale(1.02); }
        100% { color: inherit; text-shadow: none; transform: scale(1); }
    }
    @keyframes flashRed {
        0% { color: #ff3e3e; text-shadow: 0 0 10px #ff3e3e; transform: scale(0.98); }
        100% { color: inherit; text-shadow: none; transform: scale(1); }
    }
`;
document.head.appendChild(style);
