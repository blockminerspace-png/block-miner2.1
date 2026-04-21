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
import { Brain, LayoutGrid, Trophy, Clock, Zap, RotateCcw, Play, Grid3X3, Car } from 'lucide-react';
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
const CART_LOGICAL_WIDTH = 960;
const CART_LOGICAL_HEIGHT = 420;
const CART_TOUCH_SWIPE_THRESHOLD = 26;

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

function clampCartLane(value, lanes) {
  return Math.max(0, Math.min(lanes - 1, value));
}

function getCanvasLogicalSize(activeGame) {
  return activeGame === 'cart'
    ? { width: CART_LOGICAL_WIDTH, height: CART_LOGICAL_HEIGHT }
    : { width: LOGICAL, height: LOGICAL };
}

function getCanvasViewportStyle(activeGame) {
  if (activeGame === 'cart') {
    return {
      width: 'min(96vw, 1600px)',
      aspectRatio: `${CART_LOGICAL_WIDTH} / ${CART_LOGICAL_HEIGHT}`,
      maxWidth: '1600px',
      maxHeight: 'calc(100dvh - 220px)',
    };
  }

  return {
    width: 'min(calc(100vw - 16px), calc(100dvh - 52px), 500px)',
    aspectRatio: '1 / 1',
    maxWidth: '500px',
    maxHeight: 'calc(100dvh - 52px)',
  };
}

function getCartTrackLayout(lanes, logicalWidth = CART_LOGICAL_WIDTH, logicalHeight = CART_LOGICAL_HEIGHT) {
  const roadX = Math.round(logicalWidth * 0.04);
  const roadY = Math.round(logicalHeight * 0.41);
  const roadW = logicalWidth - roadX * 2;
  const roadH = Math.round(logicalHeight * 0.41);
  const laneH = roadH / lanes;
  return { roadX, roadY, roadW, roadH, laneH };
}

function getCartLaneFromPointer(y, lanes, logicalWidth = CART_LOGICAL_WIDTH, logicalHeight = CART_LOGICAL_HEIGHT) {
  const { roadY, roadH, laneH } = getCartTrackLayout(lanes, logicalWidth, logicalHeight);
  const boundedY = Math.max(roadY, Math.min(roadY + roadH - 1, y));
  return clampCartLane(Math.floor((boundedY - roadY) / laneH), lanes);
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
  const [cartCooldown, setCartCooldown] = useState(0);
  const [chain2048CdSec, setChain2048CdSec] = useState(0);
  const [chain2048AllowStart, setChain2048AllowStart] = useState(true);
  /** Server sets allowNewStart=false when a round is ACTIVE (continue), not only on cooldown. */
  const [chain2048HasActiveSession, setChain2048HasActiveSession] = useState(false);
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
  const cartStateRef = useRef({
    lane: 1,
    renderLane: 1,
    steer: 0,
    lanes: 3,
    health: 3,
    events: [],
    targetScore: 1500,
    hit: null,
    roadSpeed: 0.48,
    roadOffset: 0,
    lastServerUpdateAt: 0,
    lastFrameAt: 0,
    difficulty: 0,
  });
  const cartTouchRef = useRef({ active: false, y: 0 });
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
        setChain2048HasActiveSession(Boolean(res.data.activeSession));
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

  const chain2048CardBlocked =
    chain2048CdSec > 0 || (!chain2048AllowStart && !chain2048HasActiveSession);

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
      } else if (data.game === 'cart-rush') {
        const serverNow = performance.now();
        memoryBoardRef.current = null;
        selectedCell.current = null;
        cartStateRef.current = {
          lane: Number(data.lane) || 1,
          renderLane: Number(data.lane) || 1,
          steer: 0,
          lanes: Number(data.lanes) || 3,
          health: Number(data.health) || 3,
          events: [],
          targetScore: Number(data.targetScore) || 1500,
          hit: null,
          roadSpeed: Number(data.roadSpeed) || 0.48,
          roadOffset: 0,
          lastServerUpdateAt: serverNow,
          lastFrameAt: serverNow,
          difficulty: 0,
        };
        setHudScore(Number(data.score) || 0);
        setSessionReady(true);
      } else {
        setSessionReady(false);
      }

      setTimeLeft(data.game === 'crypto-memory' ? 70 : data.game === 'cart-rush' ? 90 : 180);
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

    newSocket.on('game:cart_lane', (data) => {
      const nextLane = Number(data.lane) || 0;
      cartStateRef.current = {
        ...cartStateRef.current,
        lane: nextLane,
        renderLane: Number.isFinite(cartStateRef.current.renderLane) ? cartStateRef.current.renderLane : nextLane,
      };
    });

    newSocket.on('game:cart_update', (data) => {
      const nextLane = Number(data.lane) || 0;
      const serverNow = performance.now();
      cartStateRef.current = {
        ...cartStateRef.current,
        lane: nextLane,
        renderLane: Number.isFinite(cartStateRef.current.renderLane) ? cartStateRef.current.renderLane : nextLane,
        health: Number(data.health) || 0,
        targetScore: Number(data.targetScore) || cartStateRef.current.targetScore,
        events: Array.isArray(data.events)
          ? data.events.map((event) => ({
              ...event,
              progress: Number(event.progress) || 0,
              speed: Number(event.speed) || Number(data.roadSpeed) || cartStateRef.current.roadSpeed || 0.48,
            }))
          : [],
        hit: data.hit || null,
        roadSpeed: Number(data.roadSpeed) || cartStateRef.current.roadSpeed || 0.48,
        difficulty: Number(data.difficulty) || 0,
        lastServerUpdateAt: serverNow,
      };
      setHudScore(Number(data.score) || 0);
      if (data.hit?.kind === 'enemy-car') {
        const lanes = Math.max(3, Number(cartStateRef.current.lanes) || 3);
        const { roadX, roadY, roadW, roadH, laneH } = getCartTrackLayout(lanes, CART_LOGICAL_WIDTH, CART_LOGICAL_HEIGHT);
        createExplosion(
          roadX + Math.min(roadW * 0.26, 172),
          roadY + laneH * cartStateRef.current.lane + laneH / 2,
        );
      }
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
      else if (activeGameRef.current === 'cart') setCartCooldown(cd);
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

  useEffect(() => {
    if (cartCooldown > 0) {
      const timer = setInterval(() => setCartCooldown((c) => Math.max(0, c - 1)), 1000);
      return () => clearInterval(timer);
    }
  }, [cartCooldown]);

  useLayoutEffect(() => {
    if (!activeGame || isGameOver) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const applyDpr = () => {
      const c = canvasRef.current;
      if (!c) return;
      const { width: logicalWidth, height: logicalHeight } = getCanvasLogicalSize(activeGame);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.round(logicalWidth * dpr);
      c.height = Math.round(logicalHeight * dpr);
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

  const drawCart = useCallback((ctx, deltaSeconds) => {
    const state = cartStateRef.current;
    const lanes = Math.max(3, Number(state.lanes) || 3);
    const { roadX, roadY, roadW, roadH, laneH } = getCartTrackLayout(lanes, CART_LOGICAL_WIDTH, CART_LOGICAL_HEIGHT);
    const now = performance.now();
    const hit = state.hit;
    const serverRoadSpeed = Number(state.roadSpeed) || 0.48;
    const roadPixelsPerSecond = 300 + serverRoadSpeed * 180;
    state.roadOffset = ((Number(state.roadOffset) || 0) + roadPixelsPerSecond * deltaSeconds) % 88;
    const scroll = state.roadOffset;
    const interpolateSeconds = Math.max(0, Math.min(0.45, (now - (Number(state.lastServerUpdateAt) || now)) / 1000));

    // Sky & Atmosphere
    const skyGrad = ctx.createLinearGradient(0, 0, 0, roadY);
    skyGrad.addColorStop(0, '#020617'); // Space blue
    skyGrad.addColorStop(0.6, '#1e1b4b'); // Deep indigo
    skyGrad.addColorStop(1, '#312e81'); // Indigo
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, CART_LOGICAL_WIDTH, roadY);

    // Stars
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 40; i++) {
      const starX = (i * 12345) % CART_LOGICAL_WIDTH;
      const starY = (i * 6789) % (roadY - 40);
      const size = (i % 3 === 0) ? 1.5 : 1;
      const alpha = 0.4 + 0.4 * Math.sin(now / 1000 + i);
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(starX, starY, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    // Distant Mountains
    ctx.fillStyle = '#111827';
    for (let i = -1; i < 3; i++) {
      const mountX = i * 600 - (scroll * 0.1) % 600;
      ctx.beginPath();
      ctx.moveTo(mountX, roadY);
      ctx.lineTo(mountX + 200, roadY - 80);
      ctx.lineTo(mountX + 400, roadY - 120);
      ctx.lineTo(mountX + 600, roadY - 50);
      ctx.lineTo(mountX + 800, roadY);
      ctx.fill();
    }

    // City Layer 1 (Far)
    const farScroll = (scroll * 0.22) % 240;
    ctx.fillStyle = '#1f2937';
    for (let i = -2; i < 12; i += 1) {
      const x = i * 80 - farScroll;
      const towerW = 50 + (i % 3) * 20;
      const towerH = 100 + ((i + 2) % 4) * 30;
      const y = roadY - towerH;
      ctx.fillRect(x, y, towerW, towerH);
      // Windows
      ctx.fillStyle = 'rgba(251, 191, 36, 0.2)';
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 2; col++) {
          if ((i + row + col) % 5 !== 0) {
            ctx.fillRect(x + 8 + col * 18, y + 15 + row * 20, 6, 8);
          }
        }
      }
      ctx.fillStyle = '#1f2937';
    }

    // City Layer 2 (Mid)
    const midScroll = (scroll * 0.45) % 320;
    ctx.fillStyle = '#374151';
    for (let i = -1; i < 8; i += 1) {
      const x = i * 140 - midScroll;
      const buildingW = 100 + (i % 2) * 30;
      const buildingH = 60 + ((i + 1) % 3) * 40;
      const y = roadY - buildingH;
      ctx.fillRect(x, y, buildingW, buildingH);
      // Windows
      ctx.fillStyle = 'rgba(251, 191, 36, 0.4)';
      for (let col = 0; col < 3; col += 1) {
        for (let row = 0; row < 2; row += 1) {
          if ((i * 2 + col + row) % 3 !== 0) {
            ctx.fillRect(x + 15 + col * 28, y + 12 + row * 24, 18, 10);
          }
        }
      }
      ctx.fillStyle = '#374151';
    }

    // Side grass/dirt
    ctx.fillStyle = '#064e3b'; // Deep forest green
    ctx.fillRect(0, roadY - 15, CART_LOGICAL_WIDTH, 15);
    ctx.fillStyle = '#065f46';
    ctx.fillRect(0, roadY + roadH, CART_LOGICAL_WIDTH, 20);


    ctx.fillStyle = '#485264';
    for (let x = -24; x < CART_LOGICAL_WIDTH + 40; x += 38) {
      const postX = x - (scroll * 0.75) % 38;
      ctx.fillRect(postX, roadY - 32, 6, 24);
      ctx.fillRect(postX - 8, roadY - 17, 24, 4);
      ctx.fillRect(postX - 8, roadY - 26, 24, 3);
    }

    ctx.fillStyle = '#565f6f';
    ctx.fillRect(0, roadY + roadH - 2, CART_LOGICAL_WIDTH, 14);
    ctx.fillStyle = '#d1d5db';
    ctx.fillRect(0, roadY + roadH + 12, CART_LOGICAL_WIDTH, 20);
    ctx.fillStyle = '#7ccf90';
    ctx.fillRect(0, roadY + roadH + 32, CART_LOGICAL_WIDTH, 24);

    // Road Surface
    const roadGrad = ctx.createLinearGradient(0, roadY, 0, roadY + roadH);
    roadGrad.addColorStop(0, '#2c3440');
    roadGrad.addColorStop(0.1, '#3a4452');
    roadGrad.addColorStop(0.5, '#4a5568');
    roadGrad.addColorStop(0.9, '#3a4452');
    roadGrad.addColorStop(1, '#2c3440');
    ctx.fillStyle = roadGrad;
    ctx.fillRect(0, roadY, CART_LOGICAL_WIDTH, roadH);

    // Subtle Road Texture/Grit
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    for (let i = 0; i < 15; i++) {
      const gritX = (scroll * 1.5 + i * 150) % CART_LOGICAL_WIDTH;
      ctx.fillRect(gritX, roadY + (i * 37) % roadH, 2, 2);
    }


    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(roadX, roadY + 16, roadW, 6);
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(roadX, roadY + roadH - 12, roadW, 8);

    ctx.fillStyle = '#f8e89a';
    for (let x = -40; x < roadW + 60; x += 92) {
      const markerX = roadX + x - (scroll * 1.25) % 92;
      ctx.fillRect(markerX, roadY + roadH + 16, 42, 4);
      ctx.fillRect(markerX, roadY - 16, 42, 4);
    }

    for (let i = 1; i < lanes; i += 1) {
      const y = roadY + laneH * i;
      ctx.setLineDash([40, 30]);
      ctx.lineDashOffset = -scroll;
      ctx.strokeStyle = 'rgba(255,255,255,0.36)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(roadX + 26, y);
      ctx.lineTo(roadX + roadW - 26, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    }

    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    for (let i = 0; i < 7; i += 1) {
      const streakX = ((i * 132) - scroll * 1.45) % (CART_LOGICAL_WIDTH + 180);
      ctx.fillRect(streakX - 120, roadY + 18 + (i % lanes) * laneH, 96, 3);
    }

    if (hit) {
      ctx.fillStyle = 'rgba(239,68,68,0.2)';
      ctx.fillRect(roadX, roadY, roadW, roadH);
    }

    const drawSideCar = (cx, cy, width, height, variant, facingRight, glowColor, isPlayer = false) => {
      const dir = facingRight ? 1 : -1;
      const steerTilt = isPlayer ? state.steer * 0.12 : 0;
      const bounce = Math.sin(now / 150) * (isPlayer ? 1.5 : 0.8);
      
      ctx.save();
      ctx.translate(cx, cy + bounce);
      ctx.scale(dir, 1);
      ctx.rotate(steerTilt);

      // Shadow
      ctx.fillStyle = 'rgba(2,6,23,0.4)';
      ctx.beginPath();
      ctx.ellipse(-2, height * 0.42, width * 0.45, height * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();

      // Car Body
      const bodyGrad = ctx.createLinearGradient(-width * 0.5, -height * 0.3, width * 0.5, height * 0.3);
      bodyGrad.addColorStop(0, variant.accent);
      bodyGrad.addColorStop(0.5, variant.body);
      bodyGrad.addColorStop(1, variant.deep || '#000000');
      
      ctx.shadowBlur = isPlayer ? 25 : 15;
      ctx.shadowColor = glowColor;
      ctx.fillStyle = bodyGrad;
      
      // Main Chassis
      ctx.beginPath();
      ctx.roundRect(-width * 0.5, -height * 0.2, width, height * 0.45, 12);
      ctx.fill();
      
      // Top Cabin
      ctx.fillStyle = variant.body;
      ctx.beginPath();
      ctx.roundRect(-width * 0.25, -height * 0.4, width * 0.55, height * 0.3, 15);
      ctx.fill();

      // Windows
      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.roundRect(-width * 0.15, -height * 0.35, width * 0.4, height * 0.2, 8);
      ctx.fill();

      // Wheels
      const wheelRotation = (now / 100) % (Math.PI * 2);
      const drawWheel = (wx, wy) => {
        ctx.save();
        ctx.translate(wx, wy);
        ctx.rotate(wheelRotation);
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.arc(0, 0, height * 0.18, 0, Math.PI * 2);
        ctx.fill();
        // Rim detail
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-height * 0.12, 0);
        ctx.lineTo(height * 0.12, 0);
        ctx.stroke();
        ctx.restore();
      };
      drawWheel(-width * 0.3, height * 0.25);
      drawWheel(width * 0.3, height * 0.25);

      if (isPlayer) {
        // Headlights
        const beam = ctx.createLinearGradient(width * 0.4, 0, width * 1.2, 0);
        beam.addColorStop(0, 'rgba(255,255,255,0.4)');
        beam.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = beam;
        ctx.beginPath();
        ctx.moveTo(width * 0.4, -height * 0.1);
        ctx.lineTo(width * 1.2, -height * 0.3);
        ctx.lineTo(width * 1.2, height * 0.2);
        ctx.lineTo(width * 0.4, height * 0.05);
        ctx.fill();
      } else {
        // Tail lights for enemies
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(-width * 0.5, -height * 0.05, 5, 10);
      }
      
      ctx.restore();
    };


    for (const event of state.events || []) {
      const lane = clampCartLane(Number(event.lane) || 0, lanes);
      const progress = Math.max(
        0,
        Math.min(1.24, (Number(event.progress) || 0) + interpolateSeconds * (Number(event.speed) || serverRoadSpeed)),
      );
      const y = roadY + laneH * lane + laneH / 2 + 4;
      const x = roadX + roadW - progress * (roadW + 140) + 50;
      const variant = event.variant || { body: '#ef4444', accent: '#fca5a5', deep: '#7f1d1d', glow: 'rgba(239,68,68,0.45)' };
      drawSideCar(
        x,
        y,
        88,
        Math.max(34, laneH * 0.62),
        { ...variant, deep: variant.deep || '#7f1d1d' },
        false,
        variant.glow,
      );
    }

    const carLane = clampCartLane(Number(state.lane) || 0, lanes);
    const renderLane = Number.isFinite(state.renderLane) ? state.renderLane : carLane;
    const nextRenderLane = renderLane + (carLane - renderLane) * 0.18;
    state.renderLane = Math.abs(carLane - nextRenderLane) < 0.002 ? carLane : nextRenderLane;
    state.steer = (state.steer ?? 0) + (((carLane - state.renderLane) * 1.25) - (state.steer ?? 0)) * 0.2;
    const carX = roadX + Math.min(roadW * 0.2, 144);
    const carY = roadY + laneH * state.renderLane + laneH / 2 + 4;

    drawSideCar(
      carX,
      carY,
      98,
      Math.max(40, laneH * 0.66),
      { body: '#2563eb', accent: '#7dd3fc', deep: '#1d4ed8' },
      true,
      'rgba(59,130,246,0.75)',
      true,
    );

    // Speed Lines (Motion Streaks)
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const lineX = (now * 2 + i * 300) % CART_LOGICAL_WIDTH;
      const lineY = (i * 87) % CART_LOGICAL_HEIGHT;
      ctx.beginPath();
      ctx.moveTo(lineX, lineY);
      ctx.lineTo(lineX + 100, lineY);
      ctx.stroke();
    }

    // Screen Shake
    if (hit) {
      const shakeX = (Math.random() - 0.5) * 15;
      const shakeY = (Math.random() - 0.5) * 15;
      ctx.translate(shakeX, shakeY);
      ctx.fillStyle = 'rgba(239,68,68,0.2)';
      ctx.fillRect(-20, -20, CART_LOGICAL_WIDTH + 40, CART_LOGICAL_HEIGHT + 40);
    }

    // HUD Redesign
    const hudX = 20;
    const hudY = 20;
    const hudW = 200;
    const hudH = 60;
    
    // Glassmorphism background
    ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
    ctx.beginPath();
    ctx.roundRect(hudX, hudY, hudW, hudH, 15);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // HP Bar
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.fillText('STABILITY', hudX + 15, hudY + 22);
    
    const hpPercent = Math.max(0, state.health / 3);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.roundRect(hudX + 15, hudY + 30, 170, 8, 4);
    ctx.fill();
    
    const hpGrad = ctx.createLinearGradient(hudX + 15, 0, hudX + 185, 0);
    hpGrad.addColorStop(0, '#ef4444');
    hpGrad.addColorStop(1, '#22c55e');
    ctx.fillStyle = hpGrad;
    ctx.beginPath();
    ctx.roundRect(hudX + 15, hudY + 30, 170 * hpPercent, 8, 4);
    ctx.fill();

    // Score
    ctx.textAlign = 'right';
    ctx.fillStyle = '#38bdf8';
    ctx.font = '900 18px Inter, sans-serif';
    ctx.fillText(`${hudScore}`, hudX + hudW - 15, hudY + 22);
    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText(`TARGET: ${state.targetScore}`, hudX + hudW - 15, hudY + 50);
    ctx.textAlign = 'left';

  }, [hudScore]);

  useEffect(() => {
    if (!activeGame || !sessionReady || isGameOver) return;
    const logicalSize = getCanvasLogicalSize(activeGame);
    const render = (frameTime) => {
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
      const cartState = cartStateRef.current;
      let deltaSeconds = 1 / 60;
      if (activeGame === 'cart') {
        const lastFrameAt = Number(cartState.lastFrameAt) || frameTime;
        deltaSeconds = Math.max(0.001, Math.min(0.05, (frameTime - lastFrameAt) / 1000 || 1 / 60));
        cartState.lastFrameAt = frameTime;
      }

      ctx.clearRect(0, 0, logicalSize.width, logicalSize.height);

      const bgGrad = ctx.createRadialGradient(
        logicalSize.width / 2,
        logicalSize.height / 2,
        60,
        logicalSize.width / 2,
        logicalSize.height / 2,
        Math.max(logicalSize.width, logicalSize.height) * 0.72,
      );
      bgGrad.addColorStop(0, '#0d1526');
      bgGrad.addColorStop(1, '#020617');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, logicalSize.width, logicalSize.height);

      if (activeGame !== 'cart') {
        ctx.strokeStyle = 'rgba(30,58,138,0.18)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= Math.max(logicalSize.width, logicalSize.height); i += 50) {
          ctx.beginPath();
          ctx.moveTo(i, 0);
          ctx.lineTo(i, logicalSize.height);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(0, i);
          ctx.lineTo(logicalSize.width, i);
          ctx.stroke();
        }
      }

      if (activeGame === 'memory') drawMemory(ctx);
      if (activeGame === 'match-3') drawMatch3(ctx);
      if (activeGame === 'cart') drawCart(ctx, deltaSeconds);

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

      if (!isTouchDevice.current && activeGame !== 'cart') {
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
  }, [activeGame, sessionReady, isGameOver, drawMemory, drawMatch3, drawCart]);

  const syncMouse = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const logicalSize = getCanvasLogicalSize(activeGame);
    const clientX = e.clientX ?? e.touches?.[0]?.clientX;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY;
    if (clientX === undefined || clientY === undefined) return { x: pointer.current.x, y: pointer.current.y };
    const x = ((clientX - rect.left) / rect.width) * logicalSize.width;
    const y = ((clientY - rect.top) / rect.height) * logicalSize.height;
    pointer.current.x = x;
    pointer.current.y = y;
    return { x, y };
  }, [activeGame]);

  const moveCartToPointerLane = useCallback(
    (y) => {
      if (!socket) return;
      const current = cartStateRef.current;
      const lanes = Math.max(3, Number(current.lanes) || 3);
      const nextLane = getCartLaneFromPointer(y, lanes, CART_LOGICAL_WIDTH, CART_LOGICAL_HEIGHT);
      if (nextLane === current.lane) return;
      cartStateRef.current = {
        ...current,
        lane: nextLane,
        renderLane: Number.isFinite(current.renderLane) ? current.renderLane : current.lane,
      };
      socket.emit('game:action', { type: 'lane', lane: nextLane });
    },
    [socket],
  );

  const moveCartByStep = useCallback(
    (step) => {
      if (!socket) return;
      const current = cartStateRef.current;
      const lanes = Math.max(3, Number(current.lanes) || 3);
      const nextLane = clampCartLane(current.lane + step, lanes);
      if (nextLane === current.lane) return;
      cartStateRef.current = {
        ...current,
        lane: nextLane,
        renderLane: Number.isFinite(current.renderLane) ? current.renderLane : current.lane,
      };
      socket.emit('game:action', { type: 'lane', lane: nextLane });
    },
    [socket],
  );

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
      } else if (activeGame === 'cart') {
        if (e.touches?.length) {
          cartTouchRef.current = { active: true, y };
          return;
        }
        moveCartToPointerLane(y);
      }
    },
    [activeGame, isGameOver, isProcessing, socket, syncMouse, memoryLayout, match3Layout, moveCartToPointerLane],
  );

  const handleMouseMove = useCallback(
    (e) => {
      const { y } = syncMouse(e);
      if (activeGame === 'cart' && pointer.current.isDown && !isGameOver && !isProcessing) {
        if (e.touches?.length && cartTouchRef.current.active) {
          const delta = y - cartTouchRef.current.y;
          if (Math.abs(delta) >= CART_TOUCH_SWIPE_THRESHOLD) {
            moveCartByStep(delta > 0 ? 1 : -1);
            cartTouchRef.current.y = y;
          }
          return;
        }
        moveCartToPointerLane(y);
      }
    },
    [activeGame, isGameOver, isProcessing, syncMouse, moveCartToPointerLane, moveCartByStep],
  );

  const handleMouseUp = useCallback(
    (e) => {
      pointer.current.isDown = false;
      cartTouchRef.current.active = false;
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

  const startCart = useCallback(() => {
    if (!socket) return;
    clearTimeoutList(pendingTimeoutsRef);
    setActiveGame('cart');
    activeGameRef.current = 'cart';
    setSessionReady(false);
    memoryBoardRef.current = null;
    cartStateRef.current = {
      lane: 1,
      renderLane: 1,
      steer: 0,
      lanes: 3,
      health: 3,
      events: [],
      targetScore: 1500,
      hit: null,
      roadSpeed: 0.48,
      roadOffset: 0,
      lastServerUpdateAt: performance.now(),
      lastFrameAt: performance.now(),
      difficulty: 0,
    };
    socket.emit('game:start', 'cart-rush');
  }, [socket]);

  useEffect(() => {
    if (activeGame !== 'cart' || isGameOver || !socket) return undefined;
    const onKey = (e) => {
      const key = String(e.key || '').toLowerCase();
      const moveUp = e.key === 'ArrowUp' || key === 'w' || e.key === 'ArrowLeft' || key === 'a';
      const moveDown = e.key === 'ArrowDown' || key === 's' || e.key === 'ArrowRight' || key === 'd';
      if (!moveUp && !moveDown) return;
      e.preventDefault();
      moveCartByStep(moveUp ? -1 : 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeGame, isGameOver, socket, moveCartByStep]);

  return (
    <>
      {activeGame && sessionReady && !isGameOver && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-[#020617]" style={{ direction: 'ltr' }}>
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-800 bg-black/70 px-2 py-2 sm:px-4">
            <div className="flex min-w-0 flex-col">
              <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">
                {t('minerGames.hash_score_label')}
              </span>
              <span className="max-w-[6rem] truncate text-lg font-black leading-none text-white sm:max-w-none sm:text-xl">{hudScore}</span>
            </div>
            <h1 className="min-w-0 flex-1 text-center text-xs font-black uppercase italic tracking-tight text-white sm:text-sm">
              {t('minerGames.brand_prefix')}
              <span className="text-primary">{t('minerGames.brand_suffix')}</span>
            </h1>
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <div className="flex flex-col items-end">
                <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">
                  {t('minerGames.time_sync_label')}
                </span>
                <div className="flex items-center gap-1 text-lg font-black leading-none text-primary sm:text-xl">
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
          <div className="flex flex-1 items-center justify-center overflow-hidden p-2 sm:p-4">
            <div
              className="relative overflow-hidden rounded-2xl border-2 border-slate-700 bg-black shadow-[0_0_50px_rgba(0,0,0,0.5)]"
              style={getCanvasViewportStyle(activeGame)}
            >
              {/* Scanline Effect */}
              <div className="pointer-events-none absolute inset-0 z-50 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.03),rgba(0,255,0,0.01),rgba(0,0,255,0.03))] bg-[length:100%_4px,3px_100%] opacity-20" />
              
              <canvas
                ref={canvasRef}
                width={getCanvasLogicalSize(activeGame).width}
                height={getCanvasLogicalSize(activeGame).height}
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

          {activeGame === 'cart' ? (
            <div className="pointer-events-none flex shrink-0 justify-center px-3 pb-3">
              <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-sky-500/20 bg-slate-950/78 px-3 py-2 shadow-[0_0_24px_rgba(14,165,233,0.14)] backdrop-blur">
                <button
                  type="button"
                  aria-label="Move up"
                  onTouchStart={(e) => {
                    e.preventDefault();
                    moveCartByStep(-1);
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    moveCartByStep(-1);
                  }}
                  className="min-h-14 min-w-14 rounded-2xl border border-sky-400/30 bg-sky-500/15 px-5 text-2xl font-black text-sky-200 transition hover:bg-sky-500/25 active:scale-95"
                >
                  ▲
                </button>
                <div className="text-center text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                  {t('minerGames.cart_rush_title')}
                </div>
                <button
                  type="button"
                  aria-label="Move down"
                  onTouchStart={(e) => {
                    e.preventDefault();
                    moveCartByStep(1);
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    moveCartByStep(1);
                  }}
                  className="min-h-14 min-w-14 rounded-2xl border border-sky-400/30 bg-sky-500/15 px-5 text-2xl font-black text-sky-200 transition hover:bg-sky-500/25 active:scale-95"
                >
                  ▼
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      <div className="animate-in fade-in space-y-8 duration-1000" style={{ direction: 'ltr' }}>
        <div className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-900/50 p-4 shadow-xl sm:p-6 lg:flex-row lg:items-stretch lg:justify-between">
          <h1 className="min-w-0 shrink-0 text-3xl font-black uppercase italic leading-none tracking-tight text-white sm:text-4xl">
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
          <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 xl:grid-cols-3">
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
            <GameCard
              title={t('minerGames.cart_rush_title')}
              description={t('minerGames.cart_rush_desc')}
              icon={Car}
              color="from-sky-500 to-blue-700"
              onClick={startCart}
              disabled={cartCooldown > 0}
              ctaStart={t('minerGames.cta_start')}
              cooldownLabel={t('minerGames.cooldown_label', { seconds: cartCooldown })}
            />
            <GameCardLink
              to="/games/2048"
              title={t('game2048.title')}
              description={t('game2048.card_desc')}
              icon={Grid3X3}
              color="from-emerald-600 to-teal-800"
              ctaLabel={t('game2048.open_game')}
              disabled={chain2048CardBlocked}
              cooldownMinutes={
                chain2048CdSec > 0 ? Math.max(1, Math.ceil(chain2048CdSec / 60)) : 0
              }
            />
          </div>
        ) : (
          <div className="relative">
            <div className="relative flex flex-col items-center overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 p-4 shadow-2xl sm:rounded-[3rem]">
              {isGameOver ? (
                <div className="relative z-10 mx-auto flex min-h-[360px] w-full max-w-[500px] flex-col items-center justify-center space-y-6 py-8 text-center animate-in zoom-in duration-500 sm:space-y-10 sm:py-10">
                  <Trophy className="h-16 w-16 animate-bounce text-primary sm:h-24 sm:w-24" aria-hidden />
                  <h2 className="text-4xl font-black uppercase italic leading-none tracking-tight text-white sm:text-6xl lg:text-7xl">
                    {t('minerGames.final_report_title')}
                  </h2>
                  {rewardMessage ? (
                    <div className="w-full rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-5 shadow-2xl backdrop-blur-md sm:rounded-[3rem] sm:p-10 lg:p-12">
                      <p className="text-2xl font-black uppercase text-emerald-400 sm:text-4xl">
                        {t('minerGames.bonus_granted_title')}
                      </p>
                      <p className="mt-2 break-words text-base font-bold uppercase text-emerald-400/70 sm:text-xl">{rewardMessage}</p>
                    </div>
                  ) : (
                    <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-6 sm:p-10">
                      <p className="text-xl font-black uppercase tracking-wide text-red-400 sm:text-2xl sm:tracking-widest">
                        {t('minerGames.mission_failed_title')}
                      </p>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const slug = activeGame === 'memory' ? 'crypto-memory' : activeGame === 'cart' ? 'cart-rush' : 'crypto-match-3';
                      clearTimeoutList(pendingTimeoutsRef);
                      setIsGameOver(false);
                      setSessionReady(false);
                      memoryBoardRef.current = null;
                      socket?.emit('game:start', slug);
                    }}
                    disabled={(activeGame === 'memory' ? memoryCooldown : activeGame === 'cart' ? cartCooldown : match3Cooldown) > 0}
                    className={`w-full max-w-sm rounded-2xl bg-primary px-5 py-4 text-sm font-black uppercase italic tracking-wide text-white shadow-glow transition-all hover:scale-105 sm:px-12 sm:py-6 sm:text-lg lg:px-20 lg:py-7 lg:text-xl ${
                      (activeGame === 'memory' ? memoryCooldown : activeGame === 'cart' ? cartCooldown : match3Cooldown) > 0
                        ? 'cursor-not-allowed opacity-50'
                        : ''
                    }`}
                  >
                    {(activeGame === 'memory' ? memoryCooldown : activeGame === 'cart' ? cartCooldown : match3Cooldown) > 0
                      ? t('minerGames.wait_seconds', {
                          seconds: activeGame === 'memory' ? memoryCooldown : activeGame === 'cart' ? cartCooldown : match3Cooldown,
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
                    className="text-xs font-bold uppercase tracking-wide text-slate-500 transition-colors hover:text-white sm:tracking-[0.3em]"
                  >
                    {t('minerGames.back_to_terminal')}
                  </button>
                </div>
              ) : (
                <div className="flex min-h-[380px] w-full flex-col items-center justify-center gap-6">
                  <div className="h-24 w-24 animate-spin rounded-full border-8 border-primary border-t-transparent shadow-glow" />
                  <p className="animate-pulse text-center text-sm font-black uppercase tracking-[0.25em] text-white sm:tracking-[0.6em]">
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
      className={`min-w-0 flex-1 overflow-hidden rounded-2xl border border-amber-500/35 bg-gradient-to-br from-amber-500/15 via-amber-600/5 to-slate-900/40 px-3 py-3 shadow-lg transition-all duration-300 sm:max-w-md sm:px-4 lg:max-w-lg ${flash ? 'ring-2 ring-amber-400/70 sm:scale-[1.01]' : ''}`}
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
          <p className="text-[9px] font-black uppercase tracking-wide text-amber-200/90 sm:tracking-[0.2em]">
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
    'group relative block overflow-hidden rounded-3xl border p-6 text-left shadow-2xl transition-all duration-500 sm:rounded-[3rem] sm:p-8 lg:rounded-[4rem] lg:p-12';
  const activeCls = `${base} border-slate-800 bg-slate-900 hover:-translate-y-4 hover:border-primary`;
  const disabledCls = `${base} cursor-not-allowed border-slate-800/80 bg-slate-950 opacity-[0.42] grayscale`;

  const inner = (
    <>
      <div
        className={`absolute -right-12 -top-12 h-48 w-48 bg-gradient-to-br ${color} blur-[70px] transition-all duration-700 sm:h-72 sm:w-72 sm:blur-[90px] ${disabled ? 'opacity-5' : 'opacity-10 group-hover:opacity-30'}`}
      />
      <div
        className={`mb-8 flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br ${color} shadow-2xl transition-transform duration-500 sm:mb-10 sm:h-24 sm:w-24 sm:rounded-[2rem] lg:mb-12 lg:h-28 lg:w-28 lg:rounded-[3rem] ${disabled ? '' : 'group-hover:rotate-12'}`}
      >
        {React.createElement(icon, { className: 'h-10 w-10 text-white sm:h-12 sm:w-12 lg:h-14 lg:w-14', 'aria-hidden': true })}
      </div>
      <h3 className="mb-4 break-words text-2xl font-black uppercase italic leading-none tracking-tight text-white sm:mb-6 sm:text-3xl lg:text-4xl">{title}</h3>
      <p className="mb-6 text-sm font-medium leading-relaxed text-slate-400 transition-colors group-hover:text-slate-200">
        {description}
      </p>
      {disabled && cooldownMinutes > 0 ? (
        <p className="mb-6 text-sm font-black uppercase tracking-wide text-amber-400/90">
          {t('game2048.arena_cooldown_minutes', { minutes: cooldownMinutes })}
        </p>
      ) : null}
      {disabled ? (
        <div className="text-xs font-black uppercase tracking-wide text-slate-500 sm:tracking-[0.35em]">
          {t('game2048.arena_unavailable')}
        </div>
      ) : (
        <div className="flex items-center gap-3 text-xs font-black uppercase tracking-wide text-primary transition-all duration-500 sm:gap-5 sm:tracking-[0.4em] md:translate-y-6 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100">
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
      className={`group relative overflow-hidden rounded-3xl border-2 border-slate-800 bg-slate-900/40 p-6 text-left shadow-2xl transition-all duration-500 backdrop-blur-sm sm:rounded-[3rem] sm:p-8 lg:rounded-[4rem] lg:p-12 ${disabled ? 'cursor-not-allowed opacity-40 grayscale' : 'hover:-translate-y-4 hover:border-primary hover:shadow-primary/20'}`}
    >
      {/* Decorative Corner */}
      <div className="absolute left-0 top-0 h-12 w-12 border-l-2 border-t-2 border-white/10 transition-colors group-hover:border-primary/50" />
      
      <div
        className={`absolute -right-12 -top-12 h-48 w-48 bg-gradient-to-br ${color} blur-[70px] transition-all duration-700 sm:h-72 sm:w-72 sm:blur-[90px] ${disabled ? 'opacity-10' : 'opacity-10 group-hover:opacity-40'}`}
      />
      <div
        className={`mb-8 flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-white/10 bg-gradient-to-br ${color} shadow-[0_0_30px_rgba(0,0,0,0.3)] transition-all duration-500 sm:mb-10 sm:h-24 sm:w-24 sm:rounded-[2.5rem] lg:mb-12 lg:h-32 lg:w-32 lg:rounded-[3.5rem] ${!disabled && 'group-hover:rotate-[10deg] group-hover:scale-110'}`}
      >
        {React.createElement(icon, { className: 'h-10 w-10 text-white drop-shadow-lg sm:h-12 sm:w-12 lg:h-16 lg:w-16', 'aria-hidden': true })}
      </div>
      <h3 className="mb-4 break-words text-2xl font-black uppercase italic leading-none tracking-tighter text-white sm:mb-6 sm:text-3xl lg:text-5xl">{title}</h3>
      <p className="mb-8 text-sm font-medium leading-relaxed text-slate-400 transition-colors group-hover:text-slate-200 sm:mb-10 lg:mb-12">
        {description}
      </p>
      <div className="flex items-center gap-3 text-xs font-black uppercase tracking-[0.2em] text-primary transition-all duration-500 sm:gap-5 sm:tracking-[0.4em] md:translate-y-6 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100">
        {disabled ? (
          <span className="text-amber-500/80">{cooldownLabel}</span>
        ) : (
          <>
            {ctaStart} <Play className="h-4 w-4 fill-current" aria-hidden />
          </>
        )}
      </div>
    </button>

  );
});
