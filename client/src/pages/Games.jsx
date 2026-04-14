import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useLayoutEffect,
  memo,
} from 'react';
import { io } from 'socket.io-client';
import { useTranslation } from 'react-i18next';
import { useAuthStore, api } from '../store/auth';
import { formatHashrate } from '../utils/machine';
import { Link } from 'react-router-dom';
import { Brain, LayoutGrid, Trophy, Clock, Zap, RotateCcw, Play, Grid3X3 } from 'lucide-react';
import { toast } from 'sonner';
import {
  MINER_GAMES_LOGICAL_SIZE,
  getMemoryGridLayout,
  hitTestMemoryCardIndex,
  getMatch3GridLayout,
  hitTestMatch3Cell,
} from '../games/minerGamesLayout.js';
import {
  translateGameSocketError,
  translateGameFinishedFailure,
  translateGameReward,
} from '../games/minerGamesSocketMessages.js';
import { CRYPTO_ICONS, COIN_COLORS, ICON_IMAGES } from '../games/cryptoGameIcons.js';

const SOCKET_URL = '/';
const LOGICAL = MINER_GAMES_LOGICAL_SIZE;

/** Must match server MEMORY_FLIP_OPEN_SETTLE_MS (~client open animation). */
const MEMORY_CARD_OPEN_ANIM_MS = 300;
const MEMORY_CARD_CLOSE_ANIM_MS = 500;

/** Defer React state updates out of the canvas rAF callback stack. */
function scheduleUiUpdate(fn) {
  if (typeof queueMicrotask === 'function') queueMicrotask(fn);
  else Promise.resolve().then(fn);
}

function clearTimeoutList(listRef) {
  listRef.current.forEach((id) => clearTimeout(id));
  listRef.current = [];
}

export default function Games() {
  const { t } = useTranslation();
  const { token } = useAuthStore();
  const [socket, setSocket] = useState(null);
  const [activeGame, setActiveGame] = useState(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [hudScore, setHudScore] = useState(0);
  const [isGameOver, setIsGameOver] = useState(false);
  const [rewardMessage, setRewardMessage] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [memoryCooldown, setMemoryCooldown] = useState(0);
  const [match3Cooldown, setMatch3Cooldown] = useState(0);
  const [chain2048CdSec, setChain2048CdSec] = useState(0);
  const [chain2048AllowStart, setChain2048AllowStart] = useState(true);
  const [gameTimerKey, setGameTimerKey] = useState(0);
  const activeGameRef = useRef(null);

  const memoryLayout = useMemo(() => getMemoryGridLayout(LOGICAL), []);
  const match3Layout = useMemo(() => getMatch3GridLayout(LOGICAL), []);

  const canvasRef = useRef(null);
  const gameLoopRef = useRef(null);
  const particles = useRef([]);
  const visualBoard = useRef([]);
  const pointer = useRef({ x: 250, y: 250, isDown: false });
  const isTouchDevice = useRef(typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0));
  const selectedCell = useRef(null);
  const swapAnim = useRef(null);
  const memoryBoardRef = useRef(null);
  const cardFlipAnims = useRef(new Map());
  const pendingTimeoutsRef = useRef([]);

  const [totalGamePower, setTotalGamePower] = useState(0);
  const [powerLoading, setPowerLoading] = useState(true);
  const [powerError, setPowerError] = useState(null);
  const [powerFlash, setPowerFlash] = useState(false);
  const prevGamePowerRef = useRef(null);

  const fetchActiveGamePowers = useCallback(async (options = {}) => {
    const silent = Boolean(options.silent);
    try {
      if (!silent) setPowerLoading(true);
      setPowerError(null);
      const res = await api.get('/games/active-powers');
      if (res.data?.ok) {
        setTotalGamePower(Number(res.data.totalHashRate) || 0);
      } else {
        setPowerError('load_failed');
      }
    } catch {
      setPowerError('load_failed');
    } finally {
      if (!silent) setPowerLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchActiveGamePowers({ silent: false });
  }, [fetchActiveGamePowers]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') void fetchActiveGamePowers({ silent: true });
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [fetchActiveGamePowers]);

  useEffect(() => {
    const id = setInterval(() => void fetchActiveGamePowers({ silent: true }), 50000);
    return () => clearInterval(id);
  }, [fetchActiveGamePowers]);

  const fetchChain2048Arena = useCallback(async () => {
    try {
      const res = await api.get('/games/2048/status');
      if (res.data?.ok) {
        setChain2048CdSec(Math.max(0, Number(res.data.cooldownSecondsRemaining) || 0));
        setChain2048AllowStart(Boolean(res.data.allowNewStart));
      }
    } catch {
      // Leave previous values; card stays usable.
    }
  }, []);

  useEffect(() => {
    void fetchChain2048Arena();
    const pollMs = activeGame ? 30000 : 8000;
    const id = setInterval(() => void fetchChain2048Arena(), pollMs);
    return () => clearInterval(id);
  }, [fetchChain2048Arena, activeGame]);

  const chain2048CdActive = chain2048CdSec > 0;
  useEffect(() => {
    if (!chain2048CdActive) return undefined;
    const id = setInterval(() => {
      setChain2048CdSec((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [chain2048CdActive]);

  useEffect(() => {
    if (prevGamePowerRef.current !== null && prevGamePowerRef.current !== totalGamePower) {
      setPowerFlash(true);
      const timer = setTimeout(() => setPowerFlash(false), 700);
      return () => clearTimeout(timer);
    }
    prevGamePowerRef.current = totalGamePower;
  }, [totalGamePower]);

  const createExplosion = useCallback((x, y) => {
    if (particles.current.length > 30) return;
    for (let i = 0; i < 8; i += 1) {
      particles.current.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 8,
        life: 1.0,
        color: '#3b82f6',
        size: Math.random() * 4 + 1.5,
      });
    }
  }, []);

  useEffect(() => {
    const newSocket = io(SOCKET_URL, { auth: { token }, withCredentials: true });

    newSocket.on('game:error', (msg) => {
      clearTimeoutList(pendingTimeoutsRef);
      toast.error(translateGameSocketError(t, msg));
      setIsProcessing(false);
      setActiveGame(null);
      setSessionReady(false);
      memoryBoardRef.current = null;
    });

    newSocket.on('game:started', (data) => {
      clearTimeoutList(pendingTimeoutsRef);
      setIsGameOver(false);
      setRewardMessage(null);
      setIsProcessing(false);
      setGameTimerKey((k) => k + 1);
      particles.current = [];
      cardFlipAnims.current.clear();

      if (data.game === 'crypto-memory' && data.board) {
        memoryBoardRef.current = data.board.map((c) => ({ ...c }));
        setHudScore(Number(data.score) || 0);
        setSessionReady(true);
      } else if (data.game === 'crypto-match-3' && data.board) {
        memoryBoardRef.current = null;
        selectedCell.current = null;
        swapAnim.current = null;
        visualBoard.current = data.board.map((row, y) =>
          row.map((s, x) => ({ symbol: s, x, y, visualX: x, visualY: y, scale: 1.0 })),
        );
        setHudScore(Number(data.score) || 0);
        setSessionReady(true);
      } else {
        setSessionReady(false);
      }

      setTimeLeft(data.game === 'crypto-memory' ? 70 : 180);
    });

    newSocket.on('game:card_flipped', (data) => {
      cardFlipAnims.current.set(data.id, {
        startTime: performance.now(),
        duration: MEMORY_CARD_OPEN_ANIM_MS,
        opening: true,
      });
      const board = memoryBoardRef.current;
      if (!board) return;
      const card = board.find((c) => c.id === data.id);
      if (card) {
        card.symbol = data.symbol;
        card.isFlipped = true;
      }
    });

    newSocket.on('game:match', (data) => {
      const board = memoryBoardRef.current;
      if (board) {
        data.ids.forEach((id) => {
          const c = board.find((x) => x.id === id);
          if (c) c.isMatched = true;
        });
      }
      setHudScore(data.score);
      createExplosion(250, 250);
    });

    newSocket.on('game:mismatch', (data) => {
      setIsProcessing(true);
      const now = performance.now();
      data.ids.forEach((id) => {
        cardFlipAnims.current.set(id, {
          startTime: now,
          duration: MEMORY_CARD_CLOSE_ANIM_MS,
          opening: false,
        });
      });
      const t1 = setTimeout(() => {
        const board = memoryBoardRef.current;
        if (!board) return;
        data.ids.forEach((id) => {
          const c = board.find((x) => x.id === id);
          if (c) {
            c.isFlipped = false;
            c.symbol = null;
          }
        });
      }, MEMORY_CARD_CLOSE_ANIM_MS);
      const t2 = setTimeout(() => setIsProcessing(false), MEMORY_CARD_CLOSE_ANIM_MS + 50);
      pendingTimeoutsRef.current.push(t1, t2);
    });

    newSocket.on('game:board_update', (data) => {
      if (!data.board) return;
      swapAnim.current = null;
      selectedCell.current = null;
      if (visualBoard.current.length > 0) {
        visualBoard.current = data.board.map((row, y) =>
          row.map((symbol, x) => {
            const currentVisual = visualBoard.current[y]?.[x];
            if (!currentVisual || currentVisual.symbol !== symbol) {
              return { symbol, x, y, visualX: x, visualY: y - 3, scale: 1.0 };
            }
            return { ...currentVisual, x, y, scale: 1.0 };
          }),
        );
      }
      setHudScore(data.score);
      createExplosion(250, 250);
      setIsProcessing(false);
    });

    newSocket.on('game:invalid_swap', () => {
      if (swapAnim.current) {
        const sa = swapAnim.current;
        swapAnim.current = {
          rx: sa.fx,
          ry: sa.fy,
          rfx: sa.tx,
          rfy: sa.ty,
          startTime: performance.now(),
          duration: 100,
        };
      }
      selectedCell.current = null;
    });

    newSocket.on('game:score_update', (data) => {
      setHudScore(data.score);
    });

    newSocket.on('game:finished', (data) => {
      clearTimeoutList(pendingTimeoutsRef);
      setIsGameOver(true);
      const cd = data.cooldownSeconds || 180;
      if (activeGameRef.current === 'memory') setMemoryCooldown(cd);
      else if (activeGameRef.current === 'match-3') setMatch3Cooldown(cd);
      if (data.success) {
        const rewardText = translateGameReward(t, data);
        setRewardMessage(rewardText);
        toast.success(rewardText);
        void fetchActiveGamePowers({ silent: true });
      } else {
        toast.error(translateGameFinishedFailure(t, data));
      }
    });

    setSocket(newSocket);
    return () => {
      clearTimeoutList(pendingTimeoutsRef);
      newSocket.disconnect();
    };
  }, [token, fetchActiveGamePowers, createExplosion, t]);

  useEffect(() => {
    if (!gameTimerKey || isGameOver) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsGameOver(true);
          if (socket) socket.emit('game:end');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [gameTimerKey, isGameOver, socket]);

  useEffect(() => {
    if (memoryCooldown > 0) {
      const timer = setInterval(() => setMemoryCooldown((c) => Math.max(0, c - 1)), 1000);
      return () => clearInterval(timer);
    }
  }, [memoryCooldown]);

  useEffect(() => {
    if (match3Cooldown > 0) {
      const timer = setInterval(() => setMatch3Cooldown((c) => Math.max(0, c - 1)), 1000);
      return () => clearInterval(timer);
    }
  }, [match3Cooldown]);

  useLayoutEffect(() => {
    if (!activeGame || isGameOver) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const applyDpr = () => {
      const c = canvasRef.current;
      if (!c) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.round(LOGICAL * dpr);
      c.height = Math.round(LOGICAL * dpr);
      const ctx = c.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    applyDpr();
    window.addEventListener('resize', applyDpr);
    return () => window.removeEventListener('resize', applyDpr);
  }, [activeGame, isGameOver, sessionReady]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !activeGame || !sessionReady || isGameOver) return;
    const noDefault = (e) => e.preventDefault();
    canvas.addEventListener('touchstart', noDefault, { passive: false });
    canvas.addEventListener('touchmove', noDefault, { passive: false });
    return () => {
      canvas.removeEventListener('touchstart', noDefault);
      canvas.removeEventListener('touchmove', noDefault);
    };
  }, [activeGame, isGameOver, sessionReady]);

  const drawMemory = useCallback(
    (ctx) => {
      const board = memoryBoardRef.current;
      if (!board?.length) return;
      const cols = 4;
      const { size, sx, sy, stride } = memoryLayout;
      const r = size / 2;
      const now = performance.now();
      board.forEach((card, i) => {
        const x = sx + (i % cols) * stride;
        const y = sy + Math.floor(i / cols) * stride;

        const anim = cardFlipAnims.current.get(card.id);
        let scaleX = 1;
        let showFront = card.isFlipped || card.isMatched;
        if (anim) {
          const t = Math.min(1, (now - anim.startTime) / anim.duration);
          const cosT = Math.cos(t * Math.PI);
          scaleX = Math.abs(cosT);
          showFront = anim.opening ? cosT < 0 : cosT >= 0;
          if (t >= 1) {
            cardFlipAnims.current.delete(card.id);
            scaleX = 1;
            showFront = anim.opening;
          }
        }

        ctx.save();
        ctx.translate(x + size / 2, y + size / 2);
        ctx.scale(scaleX, 1);

        ctx.fillStyle = card.isMatched ? '#0f2d1f' : showFront ? '#0d1f3a' : '#0f172a';
        ctx.beginPath();
        ctx.roundRect(-r, -r, size, size, 16);
        ctx.fill();

        ctx.strokeStyle = card.isMatched
          ? 'rgba(16,185,129,0.5)'
          : showFront
            ? 'rgba(59,130,246,0.5)'
            : 'rgba(51,65,85,0.7)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(-r, -r, size, size, 16);
        ctx.stroke();

        if (showFront && !card.isMatched) {
          const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
          grad.addColorStop(0, 'rgba(59,130,246,0.08)');
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.roundRect(-r, -r, size, size, 16);
          ctx.fill();
        }

        if (showFront || card.isMatched) {
          const img = ICON_IMAGES[card.symbol];
          if (img?.complete && img.naturalWidth > 0) {
            const is = size * 0.68;
            ctx.drawImage(img, -is / 2, -is / 2, is, is);
          }
        } else {
          ctx.strokeStyle = 'rgba(51,65,85,0.4)';
          ctx.lineWidth = 1;
          const hs = r * 0.6;
          for (let d = -hs; d <= hs; d += 14) {
            ctx.beginPath();
            ctx.moveTo(-hs, d);
            ctx.lineTo(hs, d);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(d, -hs);
            ctx.lineTo(d, hs);
            ctx.stroke();
          }
        }
        ctx.restore();
      });
    },
    [memoryLayout],
  );

  const drawMatch3 = useCallback(
    (ctx) => {
      if (!visualBoard.current.length) return;
      const { cellSize: s, sx, sy, stride } = match3Layout;
      const eio = (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

      const sa = swapAnim.current;
      let saOffset = 0;
      if (sa) {
        const elapsed = performance.now() - sa.startTime;
        const t = Math.min(1, elapsed / sa.duration);
        saOffset = eio(t);
        if (t >= 1) {
          swapAnim.current = null;
          scheduleUiUpdate(() => setIsProcessing(false));
        }
      }

      visualBoard.current.forEach((row, y) => {
        row.forEach((piece, x) => {
          piece.visualY += (y - piece.visualY) * 0.18;
          piece.visualX += (x - piece.visualX) * 0.18;
          const isSelected = selectedCell.current?.cx === x && selectedCell.current?.cy === y;
          piece.scale = (piece.scale ?? 1.0) + ((isSelected ? 1.15 : 1.0) - (piece.scale ?? 1.0)) * 0.2;

          let drawX = sx + piece.visualX * stride;
          let drawY = sy + piece.visualY * stride;

          if (sa) {
            if (sa.fx === x && sa.fy === y) {
              drawX += (sa.tx - sa.fx) * saOffset * stride;
              drawY += (sa.ty - sa.fy) * saOffset * stride;
            } else if (sa.tx === x && sa.ty === y) {
              drawX += (sa.fx - sa.tx) * saOffset * stride;
              drawY += (sa.fy - sa.ty) * saOffset * stride;
            } else if (sa.rx !== undefined && sa.rx === x && sa.ry === y) {
              drawX += (sa.rfx - sa.rx) * saOffset * stride;
              drawY += (sa.rfy - sa.ry) * saOffset * stride;
            } else if (sa.rfx !== undefined && sa.rfx === x && sa.rfy === y) {
              drawX += (sa.rx - sa.rfx) * saOffset * stride;
              drawY += (sa.ry - sa.rfy) * saOffset * stride;
            }
          }

          const col = COIN_COLORS[piece.symbol];
          const cx2 = drawX + s / 2;
          const cy2 = drawY + s / 2;
          ctx.save();

          if (isSelected) {
            const pulseT = performance.now() / 700;
            const pulse = 0.5 + 0.5 * Math.sin(pulseT * Math.PI * 2);
            ctx.shadowBlur = 18 + 8 * pulse;
            ctx.shadowColor = col ? col.glow : 'rgba(99,179,237,0.9)';
            ctx.strokeStyle = col ? col.border : 'rgba(99,179,237,0.9)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(drawX - 2, drawY - 2, s + 4, s + 4, 14);
            ctx.stroke();
            ctx.shadowBlur = 0;
          }

          const bgGrad = ctx.createRadialGradient(cx2, cy2, 2, cx2, cy2, s * 0.75);
          if (col) {
            bgGrad.addColorStop(0, col.bg);
            bgGrad.addColorStop(1, 'rgba(15,23,42,0.92)');
          } else {
            bgGrad.addColorStop(0, 'rgba(30,41,59,0.8)');
            bgGrad.addColorStop(1, 'rgba(15,23,42,0.92)');
          }
          ctx.fillStyle = bgGrad;
          ctx.beginPath();
          ctx.roundRect(drawX, drawY, s, s, 12);
          ctx.fill();

          ctx.strokeStyle = col ? col.border.replace('0.5', '0.3') : 'rgba(51,65,85,0.5)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(drawX, drawY, s, s, 12);
          ctx.stroke();

          const img = ICON_IMAGES[piece.symbol];
          if (img?.complete && img.naturalWidth > 0) {
            const sc = piece.scale ?? 1.0;
            ctx.translate(cx2, cy2);
            ctx.scale(sc, sc);
            if (isSelected && col) {
              ctx.shadowBlur = 14;
              ctx.shadowColor = col.glow;
            }
            const is = s * 0.64;
            ctx.drawImage(img, -is / 2, -is / 2, is, is);
            ctx.shadowBlur = 0;
          }
          ctx.restore();
        });
      });
    },
    [match3Layout],
  );

  useEffect(() => {
    if (!activeGame || !sessionReady || isGameOver) return;
    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        gameLoopRef.current = requestAnimationFrame(render);
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        gameLoopRef.current = requestAnimationFrame(render);
        return;
      }

      ctx.clearRect(0, 0, LOGICAL, LOGICAL);

      const bgGrad = ctx.createRadialGradient(250, 250, 60, 250, 250, 360);
      bgGrad.addColorStop(0, '#0d1526');
      bgGrad.addColorStop(1, '#020617');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, LOGICAL, LOGICAL);

      ctx.strokeStyle = 'rgba(30,58,138,0.18)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= LOGICAL; i += 50) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, LOGICAL);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(LOGICAL, i);
        ctx.stroke();
      }

      if (activeGame === 'memory') drawMemory(ctx);
      if (activeGame === 'match-3') drawMatch3(ctx);

      particles.current = particles.current.filter((p) => p.life > 0);
      particles.current.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.92;
        p.vy *= 0.92;
        p.life -= 0.06;
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1.0;

      if (!isTouchDevice.current) {
        const mx = pointer.current.x;
        const my = pointer.current.y;
        ctx.strokeStyle = pointer.current.isDown ? '#ef4444' : '#3b82f6';
        ctx.lineWidth = 2;
        ctx.shadowBlur = 10;
        ctx.shadowColor = ctx.strokeStyle;
        ctx.beginPath();
        ctx.arc(mx, my, 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(mx - 18, my);
        ctx.lineTo(mx + 18, my);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(mx, my - 18);
        ctx.lineTo(mx, my + 18);
        ctx.stroke();
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.arc(mx, my, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      gameLoopRef.current = requestAnimationFrame(render);
    };
    gameLoopRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(gameLoopRef.current);
  }, [activeGame, sessionReady, isGameOver, drawMemory, drawMatch3]);

  const syncMouse = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX ?? e.touches?.[0]?.clientX;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY;
    if (clientX === undefined || clientY === undefined) return { x: pointer.current.x, y: pointer.current.y };
    const x = ((clientX - rect.left) / rect.width) * LOGICAL;
    const y = ((clientY - rect.top) / rect.height) * LOGICAL;
    pointer.current.x = x;
    pointer.current.y = y;
    return { x, y };
  }, []);

  const handleMouseDown = useCallback(
    (e) => {
      if (e.type === 'mousedown' && isTouchDevice.current) return;
      if (isGameOver || isProcessing) return;
      pointer.current.isDown = true;
      const { x, y } = syncMouse(e);
      if (!socket) return;

      if (activeGame === 'memory') {
        const cardId = hitTestMemoryCardIndex(x, y, memoryLayout);
        if (cardId !== null) socket.emit('game:action', { type: 'flip', cardId });
      } else if (activeGame === 'match-3') {
        const cell = hitTestMatch3Cell(x, y, match3Layout);
        if (!cell) return;
        const { cx, cy } = cell;
        const sel = selectedCell.current;
        if (!sel) {
          selectedCell.current = { cx, cy };
        } else if (sel.cx === cx && sel.cy === cy) {
          selectedCell.current = null;
        } else {
          const dx = Math.abs(cx - sel.cx);
          const dy = Math.abs(cy - sel.cy);
          if ((dx === 1 && dy === 0) || (dx === 0 && dy === 1)) {
            if (!swapAnim.current) {
              swapAnim.current = {
                fx: sel.cx,
                fy: sel.cy,
                tx: cx,
                ty: cy,
                startTime: performance.now(),
                duration: 120,
              };
              socket.emit('game:action', {
                type: 'swap',
                from: { x: sel.cx, y: sel.cy },
                to: { x: cx, y: cy },
              });
              selectedCell.current = null;
              setIsProcessing(true);
            }
          } else {
            selectedCell.current = { cx, cy };
          }
        }
      }
    },
    [activeGame, isGameOver, isProcessing, socket, syncMouse, memoryLayout, match3Layout],
  );

  const handleMouseMove = useCallback(
    (e) => {
      syncMouse(e);
    },
    [syncMouse],
  );

  const handleMouseUp = useCallback(
    (e) => {
      pointer.current.isDown = false;
      syncMouse(e);
    },
    [syncMouse],
  );

  const exitSession = useCallback(() => {
    clearTimeoutList(pendingTimeoutsRef);
    if (socket) socket.emit('game:end');
    setActiveGame(null);
    setSessionReady(false);
    memoryBoardRef.current = null;
  }, [socket]);

  const startMemory = useCallback(() => {
    if (!socket) return;
    clearTimeoutList(pendingTimeoutsRef);
    setActiveGame('memory');
    activeGameRef.current = 'memory';
    setSessionReady(false);
    memoryBoardRef.current = null;
    socket.emit('game:start', 'crypto-memory');
  }, [socket]);

  const startMatch3 = useCallback(() => {
    if (!socket) return;
    clearTimeoutList(pendingTimeoutsRef);
    setActiveGame('match-3');
    activeGameRef.current = 'match-3';
    setSessionReady(false);
    memoryBoardRef.current = null;
    socket.emit('game:start', 'crypto-match-3');
  }, [socket]);

  return (
    <>
      {activeGame && sessionReady && !isGameOver && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-[#020617]" style={{ direction: 'ltr' }}>
          <div className="flex shrink-0 items-center justify-between border-b border-slate-800 bg-black/70 px-4 py-2">
            <div className="flex flex-col">
              <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">
                {t('minerGames.hash_score_label')}
              </span>
              <span className="text-xl font-black leading-none text-white">{hudScore}</span>
            </div>
            <h1 className="text-sm font-black uppercase italic tracking-tight text-white">
              {t('minerGames.brand_prefix')}
              <span className="text-primary">{t('minerGames.brand_suffix')}</span>
            </h1>
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-end">
                <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">
                  {t('minerGames.time_sync_label')}
                </span>
                <div className="flex items-center gap-1 text-xl font-black leading-none text-primary">
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  <span>{t('minerGames.time_value_seconds', { seconds: timeLeft })}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={exitSession}
                aria-label={t('minerGames.exit_session_aria')}
                className="rounded-lg border border-red-500/30 bg-red-500/20 p-2 text-red-400 transition-all hover:bg-red-500/40"
              >
                <RotateCcw className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
          <div className="flex flex-1 items-center justify-center overflow-hidden">
            <div
              className="overflow-hidden rounded-2xl"
              style={{ width: 'min(100vw, 100dvh - 52px)', height: 'min(100vw, 100dvh - 52px)' }}
            >
              <canvas
                ref={canvasRef}
                width={LOGICAL}
                height={LOGICAL}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onTouchStart={handleMouseDown}
                onTouchMove={handleMouseMove}
                onTouchEnd={handleMouseUp}
                className="block h-full w-full"
                style={{ cursor: isTouchDevice.current ? 'default' : 'none', touchAction: 'none' }}
              />
            </div>
          </div>
        </div>
      )}

      <div className="animate-in fade-in space-y-8 duration-1000" style={{ direction: 'ltr' }}>
        <div className="flex flex-col gap-4 rounded-[2rem] border border-slate-800 bg-slate-900/50 p-6 shadow-xl lg:flex-row lg:items-stretch lg:justify-between">
          <h1 className="shrink-0 text-4xl font-black uppercase italic leading-none tracking-tighter text-white">
            {t('minerGames.brand_prefix')}
            <span className="text-primary">{t('minerGames.brand_suffix')}</span>
          </h1>
          <TemporaryPowerSummary
            t={t}
            totalGamePower={totalGamePower}
            loading={powerLoading}
            errorKey={powerError}
            flash={powerFlash}
            onRetry={() => void fetchActiveGamePowers({ silent: false })}
          />
        </div>

        {!activeGame ? (
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-3">
            <GameCard
              title={t('minerGames.memory_sync_title')}
              description={t('minerGames.memory_sync_desc')}
              icon={Brain}
              color="from-blue-600 to-indigo-700"
              onClick={startMemory}
              disabled={memoryCooldown > 0}
              ctaStart={t('minerGames.cta_start')}
              cooldownLabel={t('minerGames.cooldown_label', { seconds: memoryCooldown })}
            />
            <GameCard
              title={t('minerGames.power_match_title')}
              description={t('minerGames.power_match_desc')}
              icon={LayoutGrid}
              color="from-primary to-orange-700"
              onClick={startMatch3}
              disabled={match3Cooldown > 0}
              ctaStart={t('minerGames.cta_start')}
              cooldownLabel={t('minerGames.cooldown_label', { seconds: match3Cooldown })}
            />
            <GameCardLink
              to="/games/2048"
              title={t('game2048.title')}
              description={t('game2048.card_desc')}
              icon={Grid3X3}
              color="from-emerald-600 to-teal-800"
              ctaLabel={t('game2048.open_game')}
              disabled={chain2048CdSec > 0 || !chain2048AllowStart}
              cooldownMinutes={
                chain2048CdSec > 0 ? Math.max(1, Math.ceil(chain2048CdSec / 60)) : 0
              }
            />
          </div>
        ) : (
          <div className="relative">
            <div className="relative flex flex-col items-center overflow-hidden rounded-[3rem] border border-slate-800 bg-slate-900 p-4 shadow-2xl">
              {isGameOver ? (
                <div className="relative z-10 mx-auto flex min-h-[380px] w-full max-w-[500px] flex-col items-center justify-center space-y-10 py-10 text-center animate-in zoom-in duration-500">
                  <Trophy className="h-24 w-24 animate-bounce text-primary" aria-hidden />
                  <h2 className="text-7xl font-black uppercase italic leading-none tracking-tighter text-white">
                    {t('minerGames.final_report_title')}
                  </h2>
                  {rewardMessage ? (
                    <div className="rounded-[3rem] border border-emerald-500/20 bg-emerald-500/10 p-12 shadow-2xl backdrop-blur-md">
                      <p className="text-4xl font-black uppercase text-emerald-400">
                        {t('minerGames.bonus_granted_title')}
                      </p>
                      <p className="mt-2 text-xl font-bold uppercase text-emerald-400/70">{rewardMessage}</p>
                    </div>
                  ) : (
                    <div className="rounded-[2rem] border border-red-500/20 bg-red-500/10 p-10">
                      <p className="text-2xl font-black uppercase tracking-widest text-red-400">
                        {t('minerGames.mission_failed_title')}
                      </p>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const slug = activeGame === 'memory' ? 'crypto-memory' : 'crypto-match-3';
                      clearTimeoutList(pendingTimeoutsRef);
                      setIsGameOver(false);
                      setSessionReady(false);
                      memoryBoardRef.current = null;
                      socket?.emit('game:start', slug);
                    }}
                    disabled={(activeGame === 'memory' ? memoryCooldown : match3Cooldown) > 0}
                    className={`rounded-[2rem] bg-primary px-20 py-7 text-xl font-black uppercase italic tracking-widest text-white shadow-glow transition-all hover:scale-105 ${
                      (activeGame === 'memory' ? memoryCooldown : match3Cooldown) > 0
                        ? 'cursor-not-allowed opacity-50'
                        : ''
                    }`}
                  >
                    {(activeGame === 'memory' ? memoryCooldown : match3Cooldown) > 0
                      ? t('minerGames.wait_seconds', {
                          seconds: activeGame === 'memory' ? memoryCooldown : match3Cooldown,
                        })
                      : t('minerGames.restart_link')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      clearTimeoutList(pendingTimeoutsRef);
                      setActiveGame(null);
                      setSessionReady(false);
                      memoryBoardRef.current = null;
                    }}
                    className="text-xs font-bold uppercase tracking-[0.3em] text-slate-500 transition-colors hover:text-white"
                  >
                    {t('minerGames.back_to_terminal')}
                  </button>
                </div>
              ) : (
                <div className="flex min-h-[380px] w-full flex-col items-center justify-center gap-6">
                  <div className="h-24 w-24 animate-spin rounded-full border-8 border-primary border-t-transparent shadow-glow" />
                  <p className="animate-pulse font-black uppercase tracking-[0.6em] text-white">
                    {t('minerGames.syncing')}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function TemporaryPowerSummary({ t, totalGamePower, loading, errorKey, flash, onRetry }) {
  const tooltip = t('minerGames.temporary_power_tooltip');
  return (
    <div
      className={`min-w-0 flex-1 overflow-hidden rounded-2xl border border-amber-500/35 bg-gradient-to-br from-amber-500/15 via-amber-600/5 to-slate-900/40 px-4 py-3 shadow-lg transition-all duration-300 sm:max-w-md lg:max-w-lg ${flash ? 'ring-2 ring-amber-400/70 sm:scale-[1.01]' : ''}`}
      title={tooltip}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-400/25 bg-amber-500/25 text-amber-300 shadow-inner"
          aria-hidden
        >
          <Zap className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-200/90">
            {t('games.temporary_power_label')}
          </p>
          {errorKey ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-sm text-red-400">{t('minerGames.power_error')}</span>
              <button
                type="button"
                onClick={onRetry}
                className="touch-manipulation rounded px-1 text-xs font-bold uppercase tracking-wider text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                {t('minerGames.retry')}
              </button>
            </div>
          ) : (
            <>
              <p
                className="mt-0.5 text-xl font-black tabular-nums tracking-tight text-white sm:text-2xl"
                aria-live="polite"
                aria-label={`${t('games.temporary_power_label')}: ${loading ? t('minerGames.loading_power') : formatHashrate(totalGamePower)}`}
              >
                {loading ? t('minerGames.loading_power') : formatHashrate(totalGamePower)}
              </p>
              {!loading && totalGamePower <= 0 && (
                <p className="text-[10px] font-medium text-slate-500">{t('minerGames.no_active_bonus')}</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const GameCardLink = memo(function GameCardLink({
  to,
  title,
  description,
  icon,
  color,
  ctaLabel,
  disabled = false,
  cooldownMinutes = 0,
}) {
  const { t } = useTranslation();
  const base =
    'group relative block overflow-hidden rounded-[4rem] border p-12 text-left shadow-2xl transition-all duration-500';
  const activeCls = `${base} border-slate-800 bg-slate-900 hover:-translate-y-4 hover:border-primary`;
  const disabledCls = `${base} cursor-not-allowed border-slate-800/80 bg-slate-950 opacity-[0.42] grayscale`;

  const inner = (
    <>
      <div
        className={`absolute -right-12 -top-12 h-72 w-72 bg-gradient-to-br ${color} blur-[90px] transition-all duration-700 ${disabled ? 'opacity-5' : 'opacity-10 group-hover:opacity-30'}`}
      />
      <div
        className={`mb-12 flex h-28 w-28 items-center justify-center rounded-[3rem] border border-white/10 bg-gradient-to-br ${color} shadow-2xl transition-transform duration-500 ${disabled ? '' : 'group-hover:rotate-12'}`}
      >
        {React.createElement(icon, { className: 'h-14 w-14 text-white', 'aria-hidden': true })}
      </div>
      <h3 className="mb-6 text-4xl font-black uppercase italic leading-none tracking-tighter text-white">{title}</h3>
      <p className="mb-6 text-sm font-medium leading-relaxed text-slate-400 transition-colors group-hover:text-slate-200">
        {description}
      </p>
      {disabled && cooldownMinutes > 0 ? (
        <p className="mb-6 text-sm font-black uppercase tracking-wide text-amber-400/90">
          {t('game2048.arena_cooldown_minutes', { minutes: cooldownMinutes })}
        </p>
      ) : null}
      {disabled ? (
        <div className="text-xs font-black uppercase tracking-[0.35em] text-slate-500">
          {t('game2048.arena_unavailable')}
        </div>
      ) : (
        <div className="flex translate-y-6 items-center gap-5 text-xs font-black uppercase tracking-[0.4em] text-primary opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100">
          {ctaLabel} <Play className="h-4 w-4 fill-current" aria-hidden />
        </div>
      )}
    </>
  );

  if (disabled) {
    return (
      <div className={disabledCls} aria-disabled="true">
        {inner}
      </div>
    );
  }
  return (
    <Link to={to} className={activeCls}>
      {inner}
    </Link>
  );
});

const GameCard = memo(function GameCard({
  title,
  description,
  icon,
  color,
  onClick,
  disabled,
  ctaStart,
  cooldownLabel,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group relative overflow-hidden rounded-[4rem] border border-slate-800 bg-slate-900 p-12 text-left shadow-2xl transition-all duration-500 ${disabled ? 'cursor-not-allowed opacity-50' : 'hover:-translate-y-4 hover:border-primary'}`}
    >
      <div
        className={`absolute -right-12 -top-12 h-72 w-72 bg-gradient-to-br ${color} blur-[90px] transition-all duration-700 ${disabled ? 'opacity-10' : 'opacity-10 group-hover:opacity-30'}`}
      />
      <div
        className={`mb-12 flex h-28 w-28 items-center justify-center rounded-[3rem] border border-white/10 bg-gradient-to-br ${color} shadow-2xl transition-transform duration-500 ${!disabled && 'group-hover:rotate-12'}`}
      >
        {React.createElement(icon, { className: 'h-14 w-14 text-white', 'aria-hidden': true })}
      </div>
      <h3 className="mb-6 text-4xl font-black uppercase italic leading-none tracking-tighter text-white">{title}</h3>
      <p className="mb-12 text-sm font-medium leading-relaxed text-slate-400 transition-colors group-hover:text-slate-200">
        {description}
      </p>
      <div className="flex translate-y-6 items-center gap-5 text-xs font-black uppercase tracking-[0.4em] text-primary opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100">
        {disabled ? cooldownLabel : (
          <>
            {ctaStart} <Play className="h-4 w-4 fill-current" aria-hidden />
          </>
        )}
      </div>
    </button>
  );
});
