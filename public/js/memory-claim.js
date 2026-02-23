const claimBtn = document.getElementById("claimBtn");
const statusEl = document.getElementById("claimStatus");
const rewardMoves = document.getElementById("rewardMoves");
const rewardTime = document.getElementById("rewardTime");
const rewardValue = document.getElementById("rewardValue");

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.classList.remove("error", "success");
  if (type) {
    statusEl.classList.add(type);
  }
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function loadLastStats() {
  try {
    const raw = localStorage.getItem("memory_game_last");
    if (!raw) {
      return;
    }
    const data = JSON.parse(raw);
    if (Number.isFinite(data?.moves)) {
      rewardMoves.textContent = String(data.moves);
    }
    if (Number.isFinite(data?.time)) {
      rewardTime.textContent = formatTime(data.time);
    }
  } catch {
    // ignore parsing errors
  }
}

async function claimReward() {
  claimBtn.disabled = true;
  setStatus("Submitting reward...", "");

  try {
    const response = await fetch("/api/games/memory/claim", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ rewardGh: 5 })
    });

    const raw = await response.text();
    let payload = null;
    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch {
        payload = { message: raw.trim() };
      }
    }

    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.message || `Unable to claim reward (HTTP ${response.status}).`);
    }

    rewardValue.textContent = `${payload.rewardGh} GH/s`;
    setStatus(
      payload.boosted
        ? "Reward claimed! Boosted for 7 days."
        : "Reward claimed! Duration: 24 hours.",
      "success"
    );
  } catch (error) {
    setStatus(error.message || "Unable to claim reward.", "error");
    claimBtn.disabled = false;
  }
}

claimBtn.addEventListener("click", claimReward);
loadLastStats();
