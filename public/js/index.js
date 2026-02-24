(function initExternalNavbar() {
  const includeTarget = document.getElementById("externalNavbarInclude");
  if (!includeTarget) {
    return;
  }

  const loadInclude = (url) =>
    fetch(url, { cache: "no-store" }).then((response) => {
      if (!response.ok) {
        throw new Error(`Include failed: ${response.status}`);
      }
      return response.text();
    });

  loadInclude("/includes/external-navbar.html")
    .catch(() => loadInclude("./includes/external-navbar.html"))
    .then((html) => {
      includeTarget.innerHTML = html;
    })
    .catch((error) => {
      console.error("External navbar include failed", error);
    });
})();

(function loadLandingStats() {
  const usersEl = document.getElementById("statUsers");
  const paidEl = document.getElementById("statPaid");
  const daysEl = document.getElementById("statDays");

  if (!usersEl || !paidEl || !daysEl) {
    return;
  }

  fetch("/api/landing-stats")
    .then((response) => response.json())
    .then((payload) => {
      if (!payload?.ok) {
        return;
      }

      usersEl.textContent = Number(payload.registeredUsers || 0).toLocaleString("en-US");
      paidEl.textContent = `${Number(payload.totalPaid || 0).toLocaleString("en-US")} POL`;
      daysEl.textContent = Number(payload.daysOnline || 0).toLocaleString("en-US");
    })
    .catch(() => undefined);
})();

(function loadRecentPayments() {
  const listEl = document.getElementById("recentPaymentsList");
  if (!listEl) {
    return;
  }

  const formatDate = (timestamp) => {
    const value = Number(timestamp || 0);
    if (!Number.isFinite(value) || value <= 0) {
      return "-";
    }

    return new Date(value).toLocaleString("en-US", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const formatHash = (hash) => {
    if (!hash || typeof hash !== "string") {
      return "-";
    }

    if (hash.length <= 16) {
      return hash;
    }

    return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
  };

  fetch("/api/recent-payments")
    .then((response) => response.json())
    .then((payload) => {
      if (!payload?.ok || !Array.isArray(payload.payments) || payload.payments.length === 0) {
        listEl.innerHTML = '<p class="recent-payments-empty">No recent payments yet.</p>';
        return;
      }

      listEl.innerHTML = payload.payments
        .slice(0, 10)
        .map(
          (payment) => `
            <article class="recent-payment-item">
              <div class="recent-payment-main">
                <strong>${String(payment.username || "Miner")}</strong>
                <span>${formatDate(payment.createdAt)}</span>
              </div>
              <div class="recent-payment-meta">
                <span class="recent-payment-amount">${Number(payment.amountPol || 0).toFixed(8)} POL</span>
                <span class="recent-payment-hash">${formatHash(payment.txHash)}</span>
              </div>
            </article>
          `
        )
        .join("");
    })
    .catch(() => {
      listEl.innerHTML = '<p class="recent-payments-empty">Failed to load recent payments.</p>';
    });
})();

(function guardHeroVideoOnMobile() {
  const featureMedia = document.getElementById("featureMedia");
  if (!featureMedia) {
    return;
  }

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isSmallScreen = window.matchMedia("(max-width: 760px)").matches;

  if (!prefersReducedMotion && !isSmallScreen) {
    return;
  }

  featureMedia.classList.add("is-static");
  const video = featureMedia.querySelector("video");
  if (video) {
    video.pause();
    video.removeAttribute("autoplay");
    video.remove();
  }
})();
