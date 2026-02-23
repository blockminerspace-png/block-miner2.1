/**
 * Auto Mining GPU - JavaScript
 * Gerencia a auto-reivindicação de GPUs a cada 5 minutos
 */

console.log('[AUTO-MINING] Script loaded. Initializing...');

const AUTO_MINING_INTERVAL = 5 * 60 * 1000; // 5 minutos em ms
const UPDATE_INTERVAL = 1000; // Atualiza timer a cada 1 segundo
let autoMiningActive = false;
let lastClaimTime = 0;
let autoMiningTimeout = null;
let timerInterval = null;
const AUTO_MINING_IMAGE_DEFAULT = "/assets/machines/reward2.png";

// Elementos DOM
const toggleBtn = document.getElementById("autoMiningToggleBtn");
const manualClaimBtn = document.getElementById("manualClaimBtn");
const statusDiv = document.getElementById("autoMiningStatus");
const nextClaimIn = document.getElementById("nextClaimIn");
const availableCount = document.getElementById("availableGPUCount");
const claimedCount = document.getElementById("claimedGPUCount");
const totalEarned = document.getElementById("totalEarnedGHS");
const claimsHistory = document.getElementById("claimsHistory");
const timerProgress = document.getElementById("timerProgress");
const rewardBox = document.getElementById("rewardBox");
const rewardName = document.getElementById("rewardName");
const rewardDescription = document.getElementById("rewardDescription");
const rewardHashrate = document.getElementById("rewardHashrate");
const rewardImage = document.getElementById("rewardImage");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Formata tempo em minutos:segundos
 */
function formatTime(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Carrega e exibe a recompensa ativa
 */
async function loadActiveReward() {
  try {
    const response = await fetch("/api/auto-mining-gpu/active-reward", { credentials: "include" });

    if (!response.ok) throw new Error("Failed to load active reward");

    const data = await response.json();

    if (data.success && data.data) {
      const reward = data.data;
      rewardName.textContent = reward.name || "Mystery GPU";
      rewardDescription.textContent = reward.description || "A powerful GPU reward!";
      rewardHashrate.textContent = `💎 ${reward.gpu_hash_rate} GHS`;
      if (reward.image_url) {
        rewardImage.src = reward.image_url;
      } else {
        rewardImage.src = AUTO_MINING_IMAGE_DEFAULT;
      }
      rewardImage.onerror = () => {
        if (rewardImage.src.endsWith("/assets/machines/reward2.png")) {
          rewardImage.src = "/assets/machines/reward1.png";
          return;
        }
        rewardImage.onerror = null;
      };
      rewardBox.style.display = "block";
    } else {
      rewardBox.style.display = "none";
    }
  } catch (err) {
    console.error("Failed to load active reward:", err);
    rewardBox.style.display = "none";
  }
}

/**
 * Carrega estatísticas do servidor
 */
async function loadStats() {
  try {
    const response = await fetch("/api/auto-mining-gpu/stats", { credentials: "include" });

    if (!response.ok) throw new Error("Failed to load stats");

    const data = await response.json();

    if (data.success) {
      availableCount.textContent = data.data.pending_gpus;
      claimedCount.textContent = data.data.claimed_gpus;
      totalEarned.textContent = (data.data.claimed_hash_rate + data.data.pending_hash_rate) + " GHS";
    }
  } catch (err) {
    console.error("Failed to load stats:", err);
  }
}

/**
 * Carrega histórico de claims
 */
async function loadHistory() {
  try {
    const response = await fetch("/api/auto-mining-gpu/history?limit=10", { credentials: "include" });

    if (!response.ok) throw new Error("Failed to load history");

    const data = await response.json();

    if (data.success && data.data.length > 0) {
      const html = data.data
        .map(
          (log) => `
        <div class="history-item">
          <div class="history-time">${new Date(log.claimed_at).toLocaleString()}</div>
          <div class="history-detail">
            <span class="history-action">${log.action}</span>
            <span class="history-hashrate">${log.gpu_hash_rate} GHS</span>
            ${log.reward_name ? `<span class="history-reward" style="font-size: 11px; opacity: 0.8; margin-left: 5px;">(${escapeHtml(log.reward_name)})</span>` : ''}
          </div>
        </div>
      `
        )
        .join("");

      claimsHistory.innerHTML = html;
    }
  } catch (err) {
    console.error("Failed to load history:", err);
  }
}

/**
 * Carrega lista de rewards ativas e exibe como cards
 */
async function loadRewardsList() {
  console.log('[AUTO-MINING] loadRewardsList() called');
  try {
    console.log('[AUTO-MINING] Loading rewards with cookie session');
    
    const response = await fetch("/api/auto-mining-gpu/rewards", { credentials: "include" });

    console.log('[AUTO-MINING] Rewards API response status:', response.status);
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to load rewards`);

    const data = await response.json();
    console.log('[AUTO-MINING] Rewards data:', data);
    
    const container = document.getElementById("rewardsList");

    if (!data.success || !Array.isArray(data.data) || data.data.length === 0) {
      console.log('[AUTO-MINING] No rewards available');
      container.innerHTML = '<p class="text-muted">No future reward available at the moment.</p>';
      return;
    }

    // Always show the next future reward
    const nextReward = data.data[0];
    // Default slot size: 1 (can be dynamic if backend provides)
    const slotSize = nextReward.slot_size || 1;
    const html = `
      <div class="reward-card future-reward">
        <img class="reward-thumb" src="${nextReward.image_url || AUTO_MINING_IMAGE_DEFAULT}" onerror="if(this.src.endsWith('/assets/machines/reward2.png')){this.src='/assets/machines/reward1.png';}else{this.onerror=null;}" alt="${escapeHtml(nextReward.name)}">
        <div class="reward-info">
          <div class="reward-name">${escapeHtml(nextReward.name)}</div>
          <div class="reward-hr"><b>Power:</b> ${nextReward.gpu_hash_rate} GHS</div>
          <div class="reward-slots"><b>Slots:</b> ${slotSize}</div>
        </div>
      </div>
    `;
    container.innerHTML = html;
    console.log('[AUTO-MINING] Next future reward displayed');
  } catch (err) {
    console.error("[AUTO-MINING] Failed to load rewards:", err);
    const container = document.getElementById("rewardsList");
    if (container) container.innerHTML = `<p class="text-muted">Failed to load rewards: ${escapeHtml(err.message || 'Unknown error')}</p>`;
  }
}

/**
 * Obtém GPUs disponíveis
 */
async function loadAvailableGPUs() {
  try {
    const response = await fetch("/api/auto-mining-gpu/available", { credentials: "include" });

    if (!response.ok) throw new Error("Failed to load GPUs");

    return await response.json();
  } catch (err) {
    console.error("Failed to load GPUs:", err);
    return { success: false, data: [] };
  }
}

/**
 * Reivindica uma GPU automaticamente
 */
async function claimGPUAutomatically() {
  try {
    // First attempt: ask server to auto-release & claim atomically
    const resp = await fetch("/api/auto-mining-gpu/auto-claim", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      }
    });

    if (resp.ok) {
      const payload = await resp.json();
      if (payload.success && payload.data && payload.data.claimed) {
        const claimed = payload.data.claimed;
        lastClaimTime = Date.now();
        statusDiv.innerHTML = `<div class="alert alert-success">✅ GPU ${claimed.id} claimed! +${claimed.gpu_hash_rate} GHS</div>`;
        statusDiv.className = "auto-mining-status-text";
        await loadStats();
        await loadHistory();
        await loadActiveReward();
        return true;
      }
      // If server responded OK but nothing was claimed, fall through to old flow
    }

    // Fallback: load available GPUs and claim first one (older flow)
    const gpuData = await loadAvailableGPUs();

    if (!gpuData.success || gpuData.data.length === 0) {
      statusDiv.innerHTML = `<div class="alert alert-info">⏳ No GPU available yet. Waiting for next release...</div>`;
      statusDiv.className = "auto-mining-status-text";
      return false;
    }

    // Reivindica a primeira GPU disponível
    const gpu = gpuData.data[0];

    const response = await fetch("/api/auto-mining-gpu/claim", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ gpu_id: gpu.id })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "Failed to claim GPU");
    }

    const data = await response.json();

    if (data.success) {
      lastClaimTime = Date.now();
      statusDiv.innerHTML = `<div class="alert alert-success">✅ GPU ${gpu.id} claimed! +${gpu.gpu_hash_rate} GHS</div>`;
      statusDiv.className = "auto-mining-status-text";

      // Recarrega stats e próximas GPUs
      await loadStats();
      await loadHistory();
      await loadActiveReward();

      return true;
    } else {
      throw new Error(data.error || "Failed to claim GPU");
    }
  } catch (err) {
    console.error("Failed to claim GPU:", err);
    statusDiv.innerHTML = `<div class="alert alert-danger">⚠️ ${err.message}</div>`;
    statusDiv.className = "auto-mining-status-text";
    return false;
  }
}

/**
 * Atualiza o timer visual
 */
async function updateTimer() {
  if (!autoMiningActive) return;

  const now = Date.now();
  const timeSinceLastClaim = now - lastClaimTime;
  const timeUntilNextClaim = Math.max(0, AUTO_MINING_INTERVAL - timeSinceLastClaim);

  // Atualiza texto
  nextClaimIn.textContent = formatTime(timeUntilNextClaim);

  // Atualiza progresso circular
  const progressPercent = (timeSinceLastClaim / AUTO_MINING_INTERVAL) * 100;
  const circumference = 2 * Math.PI * 45; // raio = 45
  const offset = circumference - (circumference * progressPercent) / 100;
  timerProgress.style.strokeDashoffset = offset;

  // Faz claim automático se passou do intervalo (>= para evitar precisão de ms)
  if (timeSinceLastClaim >= AUTO_MINING_INTERVAL) {
    // evita claims concorrentes
    if (!window.__autoMiningClaimInProgress) {
      try {
        window.__autoMiningClaimInProgress = true;
        await claimGPUAutomatically();
      } finally {
        window.__autoMiningClaimInProgress = false;
        lastClaimTime = Date.now();
      }
    }
  }
}

/**
 * Inicia o auto mining
 */
function startAutoMining() {
  console.log('[AUTO-MINING] startAutoMining() called');
  if (autoMiningActive) {
    console.log('[AUTO-MINING] Already active, skipping...');
    return;
  }

  autoMiningActive = true;
  lastClaimTime = Date.now();
  console.log('[AUTO-MINING] Auto mining started at', new Date().toLocaleTimeString());

  // Atualiza UI
  if (toggleBtn) {
    toggleBtn.innerHTML = '<i class="bi bi-stop-circle"></i> Stop Auto Mining';
    toggleBtn.classList.remove("success");
    toggleBtn.classList.add("danger");
  }
  if (manualClaimBtn) manualClaimBtn.disabled = false;

  // Começa o timer
  timerInterval = setInterval(updateTimer, UPDATE_INTERVAL);
  updateTimer(); // Atualiza imediatamente

  // esconder botões (modo totalmente automático)
  try { if (toggleBtn) toggleBtn.style.display = 'none'; } catch(e){}
  try { if (manualClaimBtn) manualClaimBtn.style.display = 'none'; } catch(e){}

  if (statusDiv) {
    statusDiv.innerHTML = `<div class="alert alert-success">▶️ Auto Mining active! Receiving a GPU every 5 minutes.</div>`;
    statusDiv.className = "auto-mining-status-text";
  }

  // Carrega dados iniciais
  loadStats();
  loadHistory();
  loadActiveReward();
}

/**
 * Para o auto mining
 */
function stopAutoMining() {
  if (!autoMiningActive) return;

  autoMiningActive = false;

  // Limpa timers
  if (autoMiningTimeout) clearTimeout(autoMiningTimeout);
  if (timerInterval) clearInterval(timerInterval);

  // Atualiza UI
  toggleBtn.innerHTML = '<i class="bi bi-play-circle"></i> Start Auto Mining';
  toggleBtn.classList.remove("danger");
  toggleBtn.classList.add("success");
  manualClaimBtn.disabled = true;

  statusDiv.innerHTML = `<div class="alert alert-warning">⏸️ Auto Mining stopped</div>`;
  statusDiv.className = "auto-mining-status-text";
}

/**
 * Toggle auto mining
 */
function toggleAutoMining() {
  if (autoMiningActive) {
    stopAutoMining();
  } else {
    startAutoMining();
  }
}

/**
 * Reivindica manualmente
 */
async function manualClaim() {
  manualClaimBtn.disabled = true;
  await claimGPUAutomatically();
  manualClaimBtn.disabled = false;
}

// Carrega dados iniciais e inicia auto-mining imediatamente
console.log('[AUTO-MINING] Page initialization starting...');
loadStats();
loadHistory();
loadActiveReward();
loadRewardsList();

// Esconde botões se existirem e inicia automaticamente
try { if (toggleBtn) toggleBtn.style.display = 'none'; } catch(e){}
try { if (manualClaimBtn) manualClaimBtn.style.display = 'none'; } catch(e){}

console.log('[AUTO-MINING] Calling startAutoMining()...');
// Start auto mining as soon as the page loads
startAutoMining();

console.log('[AUTO-MINING] Initialization complete');

// Auto-resume on focus: refresh data
window.addEventListener("focus", () => {
  console.log('[AUTO-MINING] Window focused, refreshing data...');
  loadStats();
  loadHistory();
  loadActiveReward();
  loadRewardsList();
});

// Clean up ao sair
window.addEventListener("beforeunload", () => {
  console.log('[AUTO-MINING] Window unloading, stopping auto-mining...');
  stopAutoMining();
});
