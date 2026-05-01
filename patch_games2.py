import re

with open("client/src/pages/Games.jsx", "r", encoding="utf-8") as f:
    content = f.read()

replacement = """  const drawCart = useCallback((ctx, deltaSeconds) => {
    const state = cartStateRef.current;
    const lanes = Math.max(3, Number(state.lanes) || 3);
    const { roadX, roadY, roadW, roadH, laneH } = getCartTrackLayout(lanes, CART_LOGICAL_WIDTH, CART_LOGICAL_HEIGHT);
    const now = performance.now();
    const hit = state.hit;
    const serverRoadSpeed = Number(state.roadSpeed) || 0.48;
    const roadPixelsPerSecond = 220 + serverRoadSpeed * 230;
    state.roadOffset = ((Number(state.roadOffset) || 0) + roadPixelsPerSecond * deltaSeconds) % CART_LOGICAL_WIDTH;
    const scroll = state.roadOffset;
    const missionProgress = Math.max(0, Math.min(1, (Number(state.score) || 0) / Math.max(1, Number(state.targetScore) || CART_TARGET_SCORE)));

    const CAR_WIDTH = 110;
    const CAR_HEIGHT = 50;
    const BTC_SIZE = 22;

    ctx.save();
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, CART_LOGICAL_WIDTH, CART_LOGICAL_HEIGHT);
    
    ctx.fillStyle = '#2d6a4f';
    ctx.fillRect(0, 0, CART_LOGICAL_WIDTH, 50);
    ctx.fillRect(0, CART_LOGICAL_HEIGHT - 50, CART_LOGICAL_WIDTH, 50);
    
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.setLineDash([60, 40]);
    ctx.lineDashOffset = -scroll;
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let i = 1; i < lanes; i++) {
      const ly = roadY + laneH * i;
      ctx.moveTo(0, ly);
      ctx.lineTo(CART_LOGICAL_WIDTH, ly);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    const drawPlayerCar = (x, y, tilt, alpha = 1) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(tilt);
      ctx.globalAlpha = alpha;

      if (alpha === 1) {
          ctx.save();
          const lightGrad = ctx.createLinearGradient(CAR_WIDTH/2, 0, CAR_WIDTH/2 + 250, 0);
          lightGrad.addColorStop(0, 'rgba(255, 255, 230, 0.15)');
          lightGrad.addColorStop(1, 'rgba(255, 255, 230, 0)');
          ctx.fillStyle = lightGrad;
          ctx.beginPath();
          ctx.moveTo(CAR_WIDTH/2 - 10, -16);
          ctx.lineTo(CAR_WIDTH/2 + 240, -45);
          ctx.lineTo(CAR_WIDTH/2 + 240, 5);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(CAR_WIDTH/2 - 10, 16);
          ctx.lineTo(CAR_WIDTH/2 + 240, 45);
          ctx.lineTo(CAR_WIDTH/2 + 240, -5);
          ctx.fill();
          ctx.restore();
      }

      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.ellipse(2, 6, CAR_WIDTH/2 + 4, CAR_HEIGHT/2 + 4, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#111';
      [[-35, -28], [18, -28], [-35, 18], [18, 18]].forEach(p => {
          ctx.fillRect(p[0], p[1], 24, 12);
      });

      const grad = ctx.createLinearGradient(-CAR_WIDTH/2, 0, CAR_WIDTH/2, 0);
      grad.addColorStop(0, '#d00000');
      grad.addColorStop(1, '#ff1f1f');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(-CAR_WIDTH/2, -CAR_HEIGHT/2, CAR_WIDTH, CAR_HEIGHT, 12);
      ctx.fill();

      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(-CAR_WIDTH/2, -6, CAR_WIDTH, 12);

      ctx.fillStyle = '#1b263b';
      ctx.beginPath();
      ctx.roundRect(0, -18, 25, 36, 5);
      ctx.fill();
      
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(5, -12); ctx.lineTo(20, -10);
      ctx.stroke();

      ctx.restore();
    };

    const drawEnemyCar = (x, y, color) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(-CAR_WIDTH/2 + 4, -CAR_HEIGHT/2 + 4, CAR_WIDTH, CAR_HEIGHT);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(-CAR_WIDTH/2, -CAR_HEIGHT/2, CAR_WIDTH, CAR_HEIGHT, 8);
      ctx.fill();
      ctx.fillStyle = '#222';
      ctx.fillRect(-15, -18, 32, 36);
      ctx.restore();
    };

    const drawBTC = (x, y, rot) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(Math.cos(rot), 1);
      const grad = ctx.createRadialGradient(-4, -4, 2, 0, 0, BTC_SIZE);
      grad.addColorStop(0, '#ffd60a');
      grad.addColorStop(1, '#ff9f1c');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, BTC_SIZE, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 24px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('₿', 0, 1);
      ctx.restore();
    };

    if (!state.localEvents) state.localEvents = [];
    const localMap = new Map(state.localEvents.map(e => [e.id, e]));
    const newLocalEvents = [];
    
    for (const s_evt of state.events || []) {
      if (!s_evt.id) {
        newLocalEvents.push({ ...s_evt });
        continue;
      }
      let l_evt = localMap.get(s_evt.id);
      if (l_evt) {
        const diff = s_evt.progress - l_evt.progress;
        if (Math.abs(diff) > 0.08) {
           l_evt.progress = s_evt.progress;
        } else {
           l_evt.progress += diff * 0.2;
        }
        l_evt.speed = s_evt.speed;
        l_evt.lane = s_evt.lane;
        newLocalEvents.push(l_evt);
      } else {
        newLocalEvents.push({ ...s_evt });
      }
    }
    
    newLocalEvents.forEach(e => {
      e.progress += deltaSeconds * (e.speed || serverRoadSpeed);
    });
    state.localEvents = newLocalEvents;

    const btcRotation = now / 200;

    for (const event of state.localEvents) {
      const lane = clampCartLane(Number(event.lane) || 0, lanes);
      const progress = Math.max(0, Math.min(1.25, event.progress));
      const y = roadY + laneH * lane + laneH / 2;
      const x = roadX + roadW - progress * (roadW + 180) + 60;

      switch (event.kind) {
        case 'coin': drawBTC(x, y, btcRotation); break;
        case 'cone': 
        case 'barrier': 
        case 'pothole': 
        case 'enemy-car':
        default:
          drawEnemyCar(x, y, event.variant?.body || '#457b9d');
          break;
      }
    }

    const carLane = clampCartLane(Number(state.lane) || 0, lanes);
    const renderLane = Number.isFinite(state.renderLane) ? state.renderLane : carLane;
    const nextRenderLane = renderLane + (carLane - renderLane) * 0.22;
    state.renderLane = Math.abs(carLane - nextRenderLane) < 0.001 ? carLane : nextRenderLane;
    const carX = roadX + 160;
    const carY = roadY + laneH * state.renderLane + laneH / 2;
    const tilt = (state.lane - state.renderLane) * 0.18;

    if (hit) {
      ctx.save();
      ctx.translate((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18);
    }

    drawPlayerCar(carX, carY, tilt, hit ? (now % 200 < 100 ? 0.5 : 1) : 1);

    if (hit) ctx.restore();

    const v = ctx.createRadialGradient(CART_LOGICAL_WIDTH/2, CART_LOGICAL_HEIGHT/2, CART_LOGICAL_WIDTH/3, CART_LOGICAL_WIDTH/2, CART_LOGICAL_HEIGHT/2, CART_LOGICAL_WIDTH/1.2);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, CART_LOGICAL_WIDTH, CART_LOGICAL_HEIGHT);

    ctx.restore();

    ctx.save();
    const drawHudBox = (x, y, w, h, label, value, valueColor = '#ffffff') => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 6);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.stroke();
      ctx.fillStyle = '#999';
      ctx.font = '700 10px Roboto, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(label, x + 14, y + 18);
      ctx.fillStyle = valueColor;
      ctx.font = '900 22px Roboto, sans-serif';
      ctx.fillText(value, x + 14, y + h - 14);
    };

    drawHudBox(20, 20, 122, 56, 'TEMPO', `${timeLeft}s`, '#4cc9f0');
    drawHudBox(156, 20, 122, 56, 'PONTOS', `${hudScore}`, '#f72585');
    drawHudBox(CART_LOGICAL_WIDTH - 280, 20, 122, 56, 'VIDAS', '❤️'.repeat(Math.max(0, Number(state.health) || 0)) || '0', '#e63946');
    drawHudBox(CART_LOGICAL_WIDTH - 142, 20, 122, 56, 'DISTÂNCIA', `${Math.floor(Number(state.distance) || 0)}m`, '#ffffff');

    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath();
    ctx.roundRect(CART_LOGICAL_WIDTH / 2 - 150, CART_LOGICAL_HEIGHT - 26, 300, 6, 3);
    ctx.fill();

    const progressGrad = ctx.createLinearGradient(CART_LOGICAL_WIDTH / 2 - 150, 0, CART_LOGICAL_WIDTH / 2 + 150, 0);
    progressGrad.addColorStop(0, '#f72585');
    progressGrad.addColorStop(1, '#4cc9f0');
    ctx.fillStyle = progressGrad;
    ctx.beginPath();
    ctx.roundRect(CART_LOGICAL_WIDTH / 2 - 150, CART_LOGICAL_HEIGHT - 26, 300 * missionProgress, 6, 3);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = '900 24px Roboto, sans-serif';
    ctx.fillText('MISSION: 750', CART_LOGICAL_WIDTH / 2, 54);
    ctx.font = '700 12px Roboto, sans-serif';
    ctx.fillStyle = '#aaaaaa';
    ctx.fillText(`1 BTC = 50 pontos  •  10 metros = 1 ponto  •  Meta ${state.targetScore}`, CART_LOGICAL_WIDTH / 2, 76);
    ctx.restore();
  }, [hudScore, timeLeft]);"""

pattern = re.compile(r'  const drawCart = useCallback\(\(ctx, deltaSeconds\) => \{.*?\n  \}, \[hudScore, timeLeft\]\);', re.DOTALL)
new_content = pattern.sub(replacement, content)

with open("client/src/pages/Games.jsx", "w", encoding="utf-8") as f:
    f.write(new_content)

print("Patch 2 applied.")
