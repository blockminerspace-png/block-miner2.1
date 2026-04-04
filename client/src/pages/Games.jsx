import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuthStore } from '../store/auth';
import { Brain, LayoutGrid, Trophy, Clock, Zap, RotateCcw, Play, Fingerprint, MousePointer2 } from 'lucide-react';
import { toast } from 'sonner';

const SOCKET_URL = '/';
const CRYPTO_ICONS = {
  'bitcoin':      '/icons/bitcoin.png',
  'ethereum':     '/icons/ethereum.png',
  'solana':       '/icons/solana.png',
  'binance-coin': '/icons/binance-coin.png',
  'cardano':      '/icons/cardano.png',
  'polkadot':     '/icons/polkadot.png',
  'dogecoin':     '/icons/dogecoin.png',
  'polygon':      '/icons/polygon.png',
};

const COIN_COLORS = {
  'bitcoin':      { bg: 'rgba(247,147,26,0.25)',  glow: 'rgba(247,147,26,0.8)',  border: 'rgba(247,147,26,0.5)'  },
  'ethereum':     { bg: 'rgba(98,126,234,0.25)',   glow: 'rgba(98,126,234,0.8)',   border: 'rgba(98,126,234,0.5)'  },
  'solana':       { bg: 'rgba(20,241,149,0.20)',   glow: 'rgba(20,241,149,0.8)',   border: 'rgba(20,241,149,0.5)'  },
  'binance-coin': { bg: 'rgba(243,186,47,0.25)',   glow: 'rgba(243,186,47,0.8)',   border: 'rgba(243,186,47,0.5)'  },
  'cardano':      { bg: 'rgba(0,51,173,0.30)',     glow: 'rgba(70,130,255,0.8)',   border: 'rgba(70,130,255,0.5)'  },
  'polkadot':     { bg: 'rgba(230,0,122,0.22)',    glow: 'rgba(230,0,122,0.8)',    border: 'rgba(230,0,122,0.5)'   },
  'dogecoin':     { bg: 'rgba(194,166,80,0.25)',   glow: 'rgba(194,166,80,0.8)',   border: 'rgba(194,166,80,0.5)'  },
  'polygon':      { bg: 'rgba(130,71,229,0.25)',   glow: 'rgba(130,71,229,0.8)',   border: 'rgba(130,71,229,0.5)'  },
};

const ICON_IMAGES = {};
Object.entries(CRYPTO_ICONS).forEach(([k, v]) => { const img = new Image(); img.src = v; ICON_IMAGES[k] = img; });

export default function Games() {
  const { token } = useAuthStore();
  const [socket, setSocket] = useState(null);
  const [activeGame, setActiveGame] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [isGameOver, setIsGameOver] = useState(false);
  const [rewardMessage, setRewardMessage] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [memoryCooldown, setMemoryCooldown] = useState(0);
  const [match3Cooldown, setMatch3Cooldown] = useState(0);
  const [gameTimerKey, setGameTimerKey] = useState(0);
  const activeGameRef = useRef(null);

  // High Precision Engine States
  const canvasRef = useRef(null);
  const gameLoopRef = useRef(null);
  const particles = useRef([]);
  const visualBoard = useRef([]);
  const pointer = useRef({ x: 250, y: 250, isDown: false });
  const isTouchDevice = useRef('ontouchstart' in window || navigator.maxTouchPoints > 0);
  const selectedCell = useRef(null);
  const swapAnim = useRef(null);
  const processingClearRef = useRef(false);

  useEffect(() => {
    const newSocket = io(SOCKET_URL, { auth: { token }, withCredentials: true });

    newSocket.on('game:error', (msg) => {
      toast.error(msg);
      setIsProcessing(false);
      setActiveGame(null);
      setGameState(null);
    });

    newSocket.on('game:started', (data) => {
      setGameState(data); setIsGameOver(false); setRewardMessage(null); setIsProcessing(false);
      setGameTimerKey(k => k + 1);
      particles.current = [];
      if (data.game === 'crypto-match-3' && data.board) {
        selectedCell.current = null; swapAnim.current = null;
        visualBoard.current = data.board.map((row, y) => row.map((s, x) => ({ symbol: s, x, y, visualX: x, visualY: y, scale: 1.0 })));
      }
      setTimeLeft(data.game === 'crypto-memory' ? 60 : 180);
    });

    newSocket.on('game:card_flipped', (data) => {
      setGameState(prev => { if (!prev || !prev.board) return prev; return { ...prev, board: prev.board.map(c => c.id === data.id ? { ...c, symbol: data.symbol, isFlipped: true, flipStart: performance.now(), flipDir: 1 } : c) }; });
    });

    newSocket.on('game:match', (data) => {
      setGameState(prev => { if (!prev || !prev.board) return prev; return { ...prev, score: data.score, board: prev.board.map(c => data.ids.includes(c.id) ? { ...c, isMatched: true } : c) }; });
      createExplosion(250, 250);
    });

    newSocket.on('game:mismatch', (data) => {
      setIsProcessing(true);
      // Mostra as moedas por 300ms depois fecha imediatamente
      setTimeout(() => {
        setGameState(prev => { if (!prev || !prev.board) return prev; return { ...prev, board: prev.board.map(c => data.ids.includes(c.id) ? { ...c, isFlipped: false, flipStart: performance.now(), flipDir: -1 } : c) }; });
        setIsProcessing(false);
      }, 300);
    });

    newSocket.on('game:board_update', (data) => {
      if (!data.board) return;
      swapAnim.current = null; selectedCell.current = null;
      if (visualBoard.current.length > 0) {
        visualBoard.current = data.board.map((row, y) => row.map((symbol, x) => {
          const currentVisual = visualBoard.current[y]?.[x];
          if (!currentVisual || currentVisual.symbol !== symbol) return { symbol, x, y, visualX: x, visualY: y - 3, scale: 1.0 };
          return { ...currentVisual, x, y, scale: 1.0 };
        }));
      }
      setGameState(prev => ({ ...prev, score: data.score, board: data.board }));
      createExplosion(250, 250);
      setIsProcessing(false);
    });

    newSocket.on('game:invalid_swap', () => {
      // Snap-back instantâneo: anima de volta na posição original rapidamente
      if (swapAnim.current) {
        const sa = swapAnim.current;
        swapAnim.current = { rx: sa.fx, ry: sa.fy, rfx: sa.tx, rfy: sa.ty, startTime: performance.now(), duration: 100 };
      }
      selectedCell.current = null;
    });

    newSocket.on('game:score_update', (data) => { setGameState(prev => prev ? ({ ...prev, score: data.score }) : prev); });
    newSocket.on('game:finished', (data) => {
      setIsGameOver(true);
      const cd = data.cooldownSeconds || 180;
      if (activeGameRef.current === 'memory') setMemoryCooldown(cd);
      else if (activeGameRef.current === 'match-3') setMatch3Cooldown(cd);
      if (data.success) {
        setRewardMessage(data.reward);
        toast.success(data.reward);
      } else toast.error(data.message);
    });

    setSocket(newSocket);
    return () => newSocket.disconnect();
  }, [token]);

  useEffect(() => {
    if (!gameTimerKey || isGameOver) return;
    const timer = setInterval(() => { setTimeLeft(prev => { 
      if (prev <= 1) { 
        clearInterval(timer); 
        setIsGameOver(true); 
        if (socket) socket.emit('game:end');
        return 0; 
      } return prev - 1; 
    }); }, 1000);
    return () => clearInterval(timer);
  }, [gameTimerKey, isGameOver, socket]);

  useEffect(() => {
    if (memoryCooldown > 0) {
      const timer = setInterval(() => setMemoryCooldown(c => Math.max(0, c - 1)), 1000);
      return () => clearInterval(timer);
    }
  }, [memoryCooldown]);

  useEffect(() => {
    if (match3Cooldown > 0) {
      const timer = setInterval(() => setMatch3Cooldown(c => Math.max(0, c - 1)), 1000);
      return () => clearInterval(timer);
    }
  }, [match3Cooldown]);

  // Listener não-passivo para eliminar delay de 300ms no touch e prevenir scroll durante o jogo
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !activeGame || !gameState || isGameOver) return;
    const noDefault = (e) => e.preventDefault();
    canvas.addEventListener('touchstart', noDefault, { passive: false });
    canvas.addEventListener('touchmove', noDefault, { passive: false });
    return () => {
      canvas.removeEventListener('touchstart', noDefault);
      canvas.removeEventListener('touchmove', noDefault);
    };
  }, [activeGame, gameState, isGameOver]);

  const createExplosion = (x, y) => {
    if (particles.current.length > 30) return; // evita acúmulo em cascatas
    for (let i = 0; i < 8; i++) {
      particles.current.push({ x, y, vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8, life: 1.0, color: '#3b82f6', size: Math.random() * 4 + 1.5 });
    }
  };

  useEffect(() => {
    if (!activeGame || !gameState || isGameOver) return;
    const render = () => {
      const canvas = canvasRef.current; if (!canvas) return;
      if (processingClearRef.current) { processingClearRef.current = false; setIsProcessing(false); }
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, 500, 500);

      // BG gradiente espacial
      const bgGrad = ctx.createRadialGradient(250, 250, 60, 250, 250, 360);
      bgGrad.addColorStop(0, '#0d1526'); bgGrad.addColorStop(1, '#020617');
      ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, 500, 500);
      // Grid sutil
      ctx.strokeStyle = 'rgba(30,58,138,0.18)'; ctx.lineWidth = 1;
      for (let i = 0; i <= 500; i += 50) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 500); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(500, i); ctx.stroke();
      }

      if (activeGame === 'memory') drawMemory(ctx, gameState);
      if (activeGame === 'match-3') drawMatch3(ctx);

      // Update Particles
      particles.current = particles.current.filter(p => p.life > 0);
      particles.current.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.vx *= 0.92; p.vy *= 0.92; p.life -= 0.06;
        ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1.0;

      // --- CUSTOM VIRTUAL CURSOR (desktop only) ---
      if (!isTouchDevice.current) {
        const mx = pointer.current.x;
        const my = pointer.current.y;
        ctx.strokeStyle = pointer.current.isDown ? '#ef4444' : '#3b82f6';
        ctx.lineWidth = 2;
        ctx.shadowBlur = 10; ctx.shadowColor = ctx.strokeStyle;
        ctx.beginPath(); ctx.arc(mx, my, 12, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(mx - 18, my); ctx.lineTo(mx + 18, my); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(mx, my - 18); ctx.lineTo(mx, my + 18); ctx.stroke();
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath(); ctx.arc(mx, my, 2, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      }

      gameLoopRef.current = requestAnimationFrame(render);
    };
    gameLoopRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(gameLoopRef.current);
  }, [activeGame, gameState, isGameOver]);

  const drawMemory = (ctx, state) => {
    if (!state.board) return;
    const cols = 4, padding = 10, size = 110;
    const sx = (500 - (cols * (size + padding))) / 2, sy = (500 - (4 * (size + padding))) / 2;
    state.board.forEach((card, i) => {
      const x = sx + (i % cols) * (size + padding), y = sy + Math.floor(i / cols) * (size + padding);
      ctx.save(); ctx.translate(x + size / 2, y + size / 2);
      let sX = 1.0;
      if (card.isFlipped || card.isMatched) {
        const elapsed = performance.now() - (card.flipStart || 0);
        const t = Math.min(1, elapsed / 160);
        sX = Math.cos(t * Math.PI / 2);
        if (t > 0.5) sX = -Math.sin(t * Math.PI / 2);
      } else if (card.flipDir === -1) {
        // Fechando: anima de volta
        const elapsed = performance.now() - (card.flipStart || 0);
        const t = Math.min(1, elapsed / 160);
        const tp = 1 - t;
        sX = Math.cos(tp * Math.PI / 2);
        if (tp > 0.5) sX = -Math.sin(tp * Math.PI / 2);
        if (t >= 1) { card.flipDir = 0; card.symbol = null; }
      } else {
        sX = 1.0;
      }
      ctx.scale(sX, 1);
      const r = size / 2;
      // Fundo do card: escuro neutro sempre
      ctx.fillStyle = card.isMatched ? '#0f2d1f' : '#0f172a';
      ctx.beginPath(); ctx.roundRect(-r, -r, size, size, 16); ctx.fill();

      // Borda: verde se matched, slate se fechado/virado
      ctx.strokeStyle = card.isMatched ? 'rgba(16,185,129,0.5)' : 'rgba(51,65,85,0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(-r, -r, size, size, 16); ctx.stroke();

      // Imagem da moeda (frente) — só a imagem, sem efeito
      if (Math.abs(sX) > 0.15 && (card.isFlipped || card.isMatched || card.flipDir === -1)) {
        const img = ICON_IMAGES[card.symbol];
        if (img && img.complete && img.naturalWidth > 0) {
          ctx.scale(-1, 1);
          const is = size * 0.68;
          ctx.drawImage(img, -is / 2, -is / 2, is, is);
        }
      }
      ctx.restore();
    });
  };

  const drawMatch3 = (ctx) => {
    if (!visualBoard.current.length) return;
    const s = 55, p = 7;
    const sx = (500 - (8 * (s + p))) / 2, sy = (500 - (8 * (s + p))) / 2;
    const eio = t => t < 0.5 ? 2*t*t : -1+(4-2*t)*t;

    const sa = swapAnim.current;
    let saOffset = 0;
    if (sa) {
      const elapsed = performance.now() - sa.startTime;
      const t = Math.min(1, elapsed / sa.duration);
      saOffset = eio(t);
      if (t >= 1) { swapAnim.current = null; processingClearRef.current = true; }
    }

    visualBoard.current.forEach((row, y) => {
      row.forEach((piece, x) => {
        piece.visualY += (y - piece.visualY) * 0.18;
        piece.visualX += (x - piece.visualX) * 0.18;
        const isSelected = selectedCell.current?.cx === x && selectedCell.current?.cy === y;
        piece.scale = (piece.scale ?? 1.0) + ((isSelected ? 1.15 : 1.0) - (piece.scale ?? 1.0)) * 0.2;

        let drawX = sx + piece.visualX * (s + p);
        let drawY = sy + piece.visualY * (s + p);

        if (sa) {
          if (sa.fx === x && sa.fy === y) { drawX += (sa.tx - sa.fx) * saOffset * (s + p); drawY += (sa.ty - sa.fy) * saOffset * (s + p); }
          else if (sa.tx === x && sa.ty === y) { drawX += (sa.fx - sa.tx) * saOffset * (s + p); drawY += (sa.fy - sa.ty) * saOffset * (s + p); }
          else if (sa.rx !== undefined && sa.rx === x && sa.ry === y) { drawX += (sa.rfx - sa.rx) * saOffset * (s + p); drawY += (sa.rfy - sa.ry) * saOffset * (s + p); }
          else if (sa.rfx !== undefined && sa.rfx === x && sa.rfy === y) { drawX += (sa.rx - sa.rfx) * saOffset * (s + p); drawY += (sa.ry - sa.rfy) * saOffset * (s + p); }
        }

        const col = COIN_COLORS[piece.symbol];
        const cx2 = drawX + s / 2, cy2 = drawY + s / 2;
        ctx.save();

        if (isSelected) {
          const t = Date.now() / 700;
          const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
          // Glow externo da cor da moeda
          ctx.shadowBlur = 18 + 8 * pulse;
          ctx.shadowColor = col ? col.glow : 'rgba(99,179,237,0.9)';
          ctx.strokeStyle = col ? col.border : 'rgba(99,179,237,0.9)';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.roundRect(drawX - 2, drawY - 2, s + 4, s + 4, 14); ctx.stroke();
          ctx.shadowBlur = 0;
        }

        // Card background com gradiente da cor da moeda
        const bgGrad = ctx.createRadialGradient(cx2, cy2, 2, cx2, cy2, s * 0.75);
        if (col) {
          bgGrad.addColorStop(0, col.bg);
          bgGrad.addColorStop(1, 'rgba(15,23,42,0.92)');
        } else {
          bgGrad.addColorStop(0, 'rgba(30,41,59,0.8)');
          bgGrad.addColorStop(1, 'rgba(15,23,42,0.92)');
        }
        ctx.fillStyle = bgGrad;
        ctx.beginPath(); ctx.roundRect(drawX, drawY, s, s, 12); ctx.fill();

        // Borda fina
        ctx.strokeStyle = col ? col.border.replace('0.5', '0.3') : 'rgba(51,65,85,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(drawX, drawY, s, s, 12); ctx.stroke();

        // Ícone da moeda
        const img = ICON_IMAGES[piece.symbol];
        if (img && img.complete && img.naturalWidth > 0) {
          const sc = piece.scale ?? 1.0;
          ctx.translate(cx2, cy2);
          ctx.scale(sc, sc);
          if (isSelected && col) { ctx.shadowBlur = 14; ctx.shadowColor = col.glow; }
          const is = s * 0.64;
          ctx.drawImage(img, -is / 2, -is / 2, is, is);
          ctx.shadowBlur = 0;
        }
        ctx.restore();
      });
    });
  };

  const syncMouse = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    // POSIÇÃO 100% RELATIVA AO ELEMENTO (Imune a DPI/Zoom)
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);

    const x = ((clientX - rect.left) / rect.width) * 500;
    const y = ((clientY - rect.top) / rect.height) * 500;

    pointer.current.x = x;
    pointer.current.y = y;
    return { x, y };
  };

  const handleMouseDown = (e) => {
    if (isGameOver || isProcessing) return;
    pointer.current.isDown = true;
    const { x, y } = syncMouse(e);
    if (activeGame === 'memory') {
      const p = 10, s = 110, sx = (500 - (4 * (s + p))) / 2, sy = (500 - (4 * (s + p))) / 2;
      const col = Math.floor((x - sx) / (s + p)), row = Math.floor((y - sy) / (s + p));
      if (col >= 0 && col < 4 && row >= 0 && row < 4) {
        const lx = (x - sx) % (s + p), ly = (y - sy) % (s + p);
        if (lx < s && ly < s) socket.emit('game:action', { type: 'flip', cardId: row * 4 + col });
      }
    } else if (activeGame === 'match-3') {
      const s = 55, p = 7, sx = (500 - (8 * (s + p))) / 2, sy = (500 - (8 * (s + p))) / 2;
      const cx = Math.floor((x - sx) / (s + p)), cy = Math.floor((y - sy) / (s + p));
      if (cx < 0 || cx >= 8 || cy < 0 || cy >= 8) return;
      const sel = selectedCell.current;
      if (!sel) {
        selectedCell.current = { cx, cy };
      } else if (sel.cx === cx && sel.cy === cy) {
        selectedCell.current = null;
      } else {
        const dx = Math.abs(cx - sel.cx), dy = Math.abs(cy - sel.cy);
        if ((dx === 1 && dy === 0) || (dx === 0 && dy === 1)) {
          if (!swapAnim.current) {
            swapAnim.current = { fx: sel.cx, fy: sel.cy, tx: cx, ty: cy, startTime: performance.now(), duration: 120 };
            socket.emit('game:action', { type: 'swap', from: { x: sel.cx, y: sel.cy }, to: { x: cx, y: cy } });
            selectedCell.current = null;
            setIsProcessing(true);
          }
        } else {
          selectedCell.current = { cx, cy };
        }
      }
    }
  };

  const handleMouseMove = (e) => { syncMouse(e); };

  const handleMouseUp = (e) => {
    pointer.current.isDown = false;
    syncMouse(e);
  };

  return (
    <>
      {/* Overlay fullscreen durante o jogo */}
      {activeGame && gameState && !isGameOver && (
        <div className="fixed inset-0 z-[100] bg-[#020617] flex flex-col" style={{ direction: 'ltr' }}>
          {/* Barra fina de status */}
          <div className="flex items-center justify-between px-4 py-2 bg-black/70 border-b border-slate-800 shrink-0">
            <div className="flex flex-col">
              <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest">Hash Score</span>
              <span className="text-white font-black text-xl leading-none">{gameState?.score || 0}</span>
            </div>
            <h1 className="text-sm font-black text-white italic tracking-tight uppercase">Miner<span className="text-primary">Games</span></h1>
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-end">
                <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest">Time Sync</span>
                <div className="flex items-center gap-1 text-primary font-black text-xl leading-none"><Clock className="w-3.5 h-3.5" /><span>{timeLeft}s</span></div>
              </div>
              <button onClick={() => { if (socket) socket.emit('game:end'); setActiveGame(null); setGameState(null); }} className="bg-red-500/20 hover:bg-red-500/40 text-red-400 p-2 rounded-lg border border-red-500/30 transition-all">
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>
          {/* Canvas ocupa todo o espaço restante */}
          <div className="flex-1 flex items-center justify-center overflow-hidden">
            <div
              className="rounded-2xl overflow-hidden"
              style={{ width: 'min(100vw, 100dvh - 52px)', height: 'min(100vw, 100dvh - 52px)' }}
            >
              <canvas
                ref={canvasRef}
                width={500}
                height={500}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onTouchStart={handleMouseDown}
                onTouchMove={handleMouseMove}
                onTouchEnd={handleMouseUp}
                className="w-full h-full block"
                style={{ cursor: isTouchDevice.current ? 'default' : 'none', touchAction: 'none' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Fluxo normal da página */}
      <div className="space-y-8 animate-in fade-in duration-1000" style={{ direction: 'ltr' }}>
        <div className="flex justify-between items-center bg-slate-900/50 p-6 rounded-[2rem] border border-slate-800 shadow-xl">
          <h1 className="text-4xl font-black text-white italic tracking-tighter uppercase leading-none">Miner<span className="text-primary">Games</span></h1>
        </div>

        {!activeGame ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <GameCard title="Memory Sync" description="Combine pares de moedas em alta velocidade." icon={Brain} color="from-blue-600 to-indigo-700" onClick={() => { setActiveGame('memory'); activeGameRef.current = 'memory'; socket.emit('game:start', 'crypto-memory'); }} disabled={memoryCooldown > 0} cooldown={memoryCooldown} />
            <GameCard title="Power Match" description="Gere cascatas de energia minerando ativos." icon={LayoutGrid} color="from-primary to-orange-700" onClick={() => { setActiveGame('match-3'); activeGameRef.current = 'match-3'; socket.emit('game:start', 'crypto-match-3'); }} disabled={match3Cooldown > 0} cooldown={match3Cooldown} />
          </div>
        ) : (
          <div className="relative">
            <div className="bg-slate-900 border border-slate-800 rounded-[3rem] p-4 shadow-2xl relative overflow-hidden flex flex-col items-center">
              {isGameOver ? (
                <div className="w-full min-h-[380px] max-w-[500px] mx-auto flex flex-col items-center justify-center text-center space-y-10 z-10 relative animate-in zoom-in duration-500 py-10">
                  <Trophy className="w-24 h-24 text-primary animate-bounce" />
                  <h2 className="text-7xl font-black text-white italic tracking-tighter uppercase leading-none">Relatório Final</h2>
                  {rewardMessage ? <div className="p-12 bg-emerald-500/10 border border-emerald-500/20 rounded-[3rem] shadow-2xl backdrop-blur-md"><p className="text-emerald-400 font-black text-4xl uppercase">Bônus Concedido!</p><p className="text-emerald-400/70 font-bold mt-2 text-xl uppercase">{rewardMessage}</p></div> : <div className="p-10 bg-red-500/10 border border-red-500/20 rounded-[2rem]"><p className="text-red-400 font-black text-2xl uppercase tracking-widest">Missão Falhou</p></div>}
                  <button
                    onClick={() => { const slug = activeGame === 'memory' ? 'crypto-memory' : 'crypto-match-3'; setIsGameOver(false); setGameState(null); socket.emit('game:start', slug); }}
                    disabled={(activeGame === 'memory' ? memoryCooldown : match3Cooldown) > 0}
                    className={`px-20 py-7 bg-primary text-white font-black rounded-[2rem] hover:scale-105 transition-all uppercase italic tracking-widest shadow-glow text-xl ${(activeGame === 'memory' ? memoryCooldown : match3Cooldown) > 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {(activeGame === 'memory' ? memoryCooldown : match3Cooldown) > 0 ? `AGUARDE ${activeGame === 'memory' ? memoryCooldown : match3Cooldown}s` : 'REINICIAR LINK'}
                  </button>
                  <button onClick={() => { setActiveGame(null); setGameState(null); }} className="text-slate-500 font-bold uppercase text-xs tracking-[0.3em] hover:text-white transition-colors">Voltar ao Terminal</button>
                </div>
              ) : (
                <div className="w-full min-h-[380px] flex flex-col items-center justify-center gap-6">
                  <div className="w-24 h-24 border-8 border-primary border-t-transparent rounded-full animate-spin shadow-glow" />
                  <p className="text-white font-black uppercase tracking-[0.6em] animate-pulse">Sincronizando...</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function GameCard({ title, description, icon: Icon, color, onClick, disabled, cooldown }) {
  return (
    <button 
      onClick={onClick} 
      disabled={disabled}
      className={`group relative p-12 bg-slate-900 border border-slate-800 rounded-[4rem] text-left transition-all duration-500 overflow-hidden shadow-2xl ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary hover:-translate-y-4'}`}
    >
      <div className={`absolute -top-12 -right-12 w-72 h-72 bg-gradient-to-br ${color} opacity-10 blur-[90px] ${!disabled && 'group-hover:opacity-30'} transition-all duration-700`} />
      <div className={`w-28 h-28 rounded-[3rem] bg-gradient-to-br ${color} flex items-center justify-center mb-12 border border-white/10 shadow-2xl ${!disabled && 'group-hover:rotate-12'} transition-transform duration-500`}><Icon className="w-14 h-14 text-white" /></div>
      <h3 className="text-4xl font-black text-white mb-6 italic tracking-tighter uppercase leading-none">{title}</h3>
      <p className="text-slate-400 text-sm mb-12 leading-relaxed font-medium group-hover:text-slate-200 transition-colors">{description}</p>
      <div className="flex items-center gap-5 text-primary font-black text-xs uppercase tracking-[0.4em] transition-all duration-500 translate-y-6 group-hover:translate-y-0 opacity-0 group-hover:opacity-100">
        {disabled ? `COOLDOWN: ${cooldown}s` : <>LINK START <Play className="w-4 h-4 fill-current" /></>}
      </div>
    </button>
  );
}
