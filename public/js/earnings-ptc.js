const OFFERWALLS = [
  {
    key: "zerads",
    name: "ZerAds",
    type: "PTC",
    logoPath: "/assets/logos/offerwall/zerads.png"
  }
];

function setFeedback(message, isError = false) {
  const feedback = document.getElementById("zeradsPtcFeedback");
  if (!feedback) return;
  feedback.textContent = message || "";
  feedback.style.color = isError ? "#ff6b81" : "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderOfferwallCards(ptcUrl = "") {
  const grid = document.getElementById("offerwallGrid");
  if (!grid) return;

  const hasUrl = Boolean(String(ptcUrl || "").trim());

  grid.innerHTML = OFFERWALLS.map((item) => {
    const safeName = escapeHtml(item.name);
    const safeType = escapeHtml(item.type);
    const safeLogoPath = escapeHtml(item.logoPath);

    return `
      <article class="offerwall-item">
        <div class="offerwall-item-logo-wrap">
          <img
            class="offerwall-item-logo"
            src="${safeLogoPath}"
            alt="${safeName} logo"
            loading="lazy"
            onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
          />
          <div class="offerwall-item-logo-fallback" style="display:none;">${safeName.slice(0, 1)}</div>
        </div>
        <div class="offerwall-item-meta">
          <h3>${safeName}</h3>
          <p>${safeType} Network</p>
        </div>
        <a
          class="btn primary offerwall-open-btn${hasUrl ? "" : " is-disabled"}"
          href="${hasUrl ? escapeHtml(ptcUrl) : "#"}"
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled="${hasUrl ? "false" : "true"}"
        >
          Start PTC
        </a>
      </article>
    `;
  }).join("");
}

async function loadPtcLink() {
  const startBtn = document.getElementById("startZeradsPtcBtn");

  try {
    const response = await fetch("/api/zerads/ptc-link", {
      method: "GET",
      credentials: "include"
    });
    const data = await response.json();

    if (!data.ok || !data.ptcUrl) {
      if (startBtn) {
        startBtn.href = "#";
        startBtn.setAttribute("aria-disabled", "true");
        startBtn.style.pointerEvents = "none";
        startBtn.style.opacity = "0.7";
      }
      renderOfferwallCards("");
      setFeedback(data.message || "Unable to load ZerAds link.", true);
      return;
    }

    if (startBtn) {
      startBtn.href = data.ptcUrl;
      startBtn.setAttribute("aria-disabled", "false");
      startBtn.style.pointerEvents = "auto";
      startBtn.style.opacity = "1";
    }

    renderOfferwallCards(data.ptcUrl);

    setFeedback("PTC button ready. Click to start.");
  } catch (error) {
    if (startBtn) {
      startBtn.href = "#";
      startBtn.setAttribute("aria-disabled", "true");
      startBtn.style.pointerEvents = "none";
      startBtn.style.opacity = "0.7";
    }
    renderOfferwallCards("");
    setFeedback("Connection error while loading ZerAds link.", true);
    console.error(error);
  }
}

async function loadStats() {
  const totals = document.getElementById("zeradsTotals");
  const lastCallback = document.getElementById("zeradsLastCallback");

  try {
    const response = await fetch("/api/zerads/stats", {
      method: "GET",
      credentials: "include"
    });
    const data = await response.json();

    if (!data.ok) {
      if (totals) {
        totals.textContent = data.message || "Unable to load earnings.";
      }
      if (lastCallback) {
        lastCallback.textContent = "Last callback: -";
      }
      return;
    }

    if (totals) {
      totals.textContent = `Total rewards: ${Number(data.totalRewards || 0).toFixed(8)} USDC | Clicks: ${Number(data.totalClicks || 0)} | Callbacks: ${Number(data.callbackCount || 0)}`;
    }

    if (lastCallback) {
      const first = Array.isArray(data.recentCallbacks) && data.recentCallbacks.length > 0 ? data.recentCallbacks[0] : null;
      if (!first?.callback_at) {
        lastCallback.textContent = "Last callback: -";
      } else {
        const when = new Date(Number(first.callback_at));
        lastCallback.textContent = `Last callback: ${when.toLocaleString()}`;
      }
    }
  } catch (error) {
    if (totals) {
      totals.textContent = "Connection error while loading earnings.";
    }
    if (lastCallback) {
      lastCallback.textContent = "Last callback: -";
    }
    console.error(error);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  renderOfferwallCards("");
  loadPtcLink();
  loadStats();

  setInterval(() => {
    loadStats();
  }, 30000);
});
