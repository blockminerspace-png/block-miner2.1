/* script.js */

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomFloat = (min, max, decimals = 1) => (Math.random() * (max - min) + min).toFixed(decimals);

const formatTime = (date) => {
    return date.toLocaleTimeString('pt-BR', { hour12: false });
};

const userNames = ["CryptoRei", "MinerBR", "SatoshiFan", "BlockMaster", "GPU_Hog", "RigBuilder_99", "HashRateGod", "NeonNinja", "CyberMiner", "ElonMuskBR", "WhaleWatcher", "DiamondHands"];
const networkEventsPool = [
    "Lote de compartilhamentos validado pela pool principal.",
    "Ajuste de dificuldade detectado na ultima janela.",
    "Novo minerador entrou na faixa Top 10 de hashrate.",
    "Latencia media da rede estabilizada abaixo de 120 ms.",
    "Checkpoint de sincronizacao de blocos concluido.",
    "Distribuicao de recompensa executada com sucesso."
];

let globalHashrate = 452.8;
let viewerCount = 1245;
let lastBlockHeight = 845012;
const DISTRIBUTION_INTERVAL_MS = 600000;
const REWARD_PER_DISTRIBUTION = 0.15;

const domIds = {
    viewers: document.getElementById('viewer-count'),
    uptime: document.getElementById('uptime'),
    activeNodes: document.getElementById('active-nodes'),
    avgLatency: document.getElementById('avg-latency'),
    blockInterval: document.getElementById('block-interval'),
    rewardHourly: document.getElementById('reward-hourly'),
    recentBlocks: document.getElementById('recent-blocks'),
    hashrate: document.getElementById('global-hashrate'),
    difficulty: document.getElementById('network-difficulty'),
    currentReward: document.getElementById('current-reward'),
    rewardFrequency: document.getElementById('reward-frequency'),
    events: document.getElementById('network-events'),
};

function initDashboard() {
    initQuickIndicators();
    initRecentBlocks();
    initNetworkPanel();
    updateNetworkPanelMetrics();
    startUptimeCounter();
    
    setInterval(updateCoreStats, 3000);
    setInterval(updateQuickIndicators, 4000);
    setInterval(addNetworkEvent, randomInt(2500, 5000));
    setInterval(addNewBlock, DISTRIBUTION_INTERVAL_MS);
    setInterval(updateViewers, 5000);
}

function initNetworkPanel() {
    if (!domIds.events) return;

    domIds.events.innerHTML = '';
    appendNetworkEvent('Painel de monitoramento iniciado.');
    appendNetworkEvent('Fluxo de distribuicao: 0.15 POL a cada 10 min.');
}

function initQuickIndicators() {
    updateQuickIndicators();
}

function updateQuickIndicators() {
    if (domIds.activeNodes) {
        const baseNodes = 1284;
        const nodes = baseNodes + randomInt(-22, 31);
        domIds.activeNodes.innerText = nodes.toLocaleString('pt-BR');
    }

    if (domIds.avgLatency) {
        const latency = Math.max(75, 118 + randomInt(-14, 18));
        domIds.avgLatency.innerText = `${latency} ms`;
    }

    if (domIds.blockInterval) {
        const seconds = Math.max(520, 600 + randomInt(-40, 40));
        const mm = Math.floor(seconds / 60).toString().padStart(2, '0');
        const ss = (seconds % 60).toString().padStart(2, '0');
        domIds.blockInterval.innerText = `${mm}:${ss}`;
    }

    if (domIds.rewardHourly) {
        const rewardPerHour = REWARD_PER_DISTRIBUTION * (3600000 / DISTRIBUTION_INTERVAL_MS);
        domIds.rewardHourly.innerText = `${rewardPerHour.toFixed(2)} POL`;
    }
}

function initRecentBlocks() {
    domIds.recentBlocks.innerHTML = '';
    for(let i=0; i<4; i++) {
        simulatePastBlock(lastBlockHeight - i);
    }
}

function simulatePastBlock(height) {
    const time = new Date(Date.now() - randomInt(DISTRIBUTION_INTERVAL_MS, DISTRIBUTION_INTERVAL_MS * 4)); // Past 10-40 mins
    createBlockDOM(height, time, userNames[randomInt(0, userNames.length-1)]);
}

function addNewBlock() {
    lastBlockHeight++;
    createBlockDOM(lastBlockHeight, new Date(), userNames[randomInt(0, userNames.length-1)], true);
    
    globalHashrate += parseFloat(randomFloat(5, 10));
    updateDifficulty();
    updateCoreStatsDOM();
}

function createBlockDOM(height, time, miner, isNew = false) {
    const block = document.createElement('div');
    block.className = 'block-card';
    block.innerHTML = `
        <div class="block-header">
            <span class="block-id">#${height}</span>
            <span class="block-time">${formatTime(time)}</span>
        </div>
        <div>
            <span class="block-miner-label">Minerado por: </span>
            <span class="block-miner">${miner}</span>
        </div>
        <div class="block-reward">+${REWARD_PER_DISTRIBUTION.toFixed(2)} POL</div>
    `;
    
    domIds.recentBlocks.insertBefore(block, domIds.recentBlocks.firstChild);
    
    if (domIds.recentBlocks.children.length > 8) {
        domIds.recentBlocks.removeChild(domIds.recentBlocks.lastChild);
    }
    
    if(isNew) {
        appendNetworkEvent(`Bloco #${height} minerado por ${miner}. Recompensa: ${REWARD_PER_DISTRIBUTION.toFixed(2)} POL.`);
    }
}

function addNetworkEvent() {
    const eventText = networkEventsPool[randomInt(0, networkEventsPool.length - 1)];
    appendNetworkEvent(eventText);
}

function appendNetworkEvent(text) {
    if (!domIds.events) return;

    const div = document.createElement('div');
    div.className = 'event-item';
    
    div.innerHTML = `
        <span class="event-time">${formatTime(new Date())}</span>
        <span>${text}</span>
    `;
    
    domIds.events.appendChild(div);
    
    domIds.events.scrollTop = domIds.events.scrollHeight;
    
    if (domIds.events.children.length > 24) {
        domIds.events.removeChild(domIds.events.firstChild);
    }
}

function updateCoreStats() {
    let delta = randomFloat(-2, 2.5);
    globalHashrate = Math.max(300, globalHashrate + parseFloat(delta));
    
    updateNetworkPanelMetrics();
}

function updateCoreStatsDOM() {
    if (domIds.hashrate) {
        domIds.hashrate.innerText = `${globalHashrate.toFixed(1)} TH/s`;
    }
}

function updateDifficulty() {
    if (!domIds.difficulty) return;

    const currentDifficulty = parseFloat(domIds.difficulty.innerText) || 84.2;
    const delta = parseFloat(randomFloat(-0.4, 0.6));
    const nextDifficulty = Math.max(70, currentDifficulty + delta);
    domIds.difficulty.innerText = `${nextDifficulty.toFixed(1)} T`;
}

function updateNetworkPanelMetrics() {
    updateCoreStatsDOM();
    updateDifficulty();

    if (domIds.currentReward) {
        domIds.currentReward.innerText = `${REWARD_PER_DISTRIBUTION.toFixed(2)} POL`;
    }

    if (domIds.rewardFrequency) {
        domIds.rewardFrequency.innerText = 'A cada 10 min';
    }
}

function updateViewers() {
    let delta = randomInt(-5, 8);
    viewerCount = Math.max(10, viewerCount + delta);
    domIds.viewers.innerText = viewerCount.toLocaleString('pt-BR');
}

let uptimeSeconds = 8070; 

function startUptimeCounter() {
    setInterval(() => {
        uptimeSeconds++;
        const h = Math.floor(uptimeSeconds / 3600).toString().padStart(2, '0');
        const m = Math.floor((uptimeSeconds % 3600) / 60).toString().padStart(2, '0');
        const s = (uptimeSeconds % 60).toString().padStart(2, '0');
        domIds.uptime.innerText = `${h}:${m}:${s}`;
    }, 1000);
}

window.onload = initDashboard;
