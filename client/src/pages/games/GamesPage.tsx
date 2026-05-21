import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useLayoutEffect,
  memo,
} from 'react';
import type { MutableRefObject } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { LucideIcon } from 'lucide-react';
import { useAuthStore, api } from '../../store/auth';
import { formatHashrate } from '../../shared/utils/machine';
import { Link } from 'react-router-dom';
import { Brain, LayoutGrid, Trophy, Clock, Zap, RotateCcw, Play, Grid3X3, Car } from 'lucide-react';
import { toast } from 'sonner';
import {
  MINER_GAMES_LOGICAL_SIZE,
  getMemoryGridLayout,
  hitTestMemoryCardIndex,
  getMatch3GridLayout,
  hitTestMatch3Cell,
} from '../../games/minerGamesLayout';
import {
  translateGameSocketError,
  translateGameFinishedFailure,
  translateGameReward,
} from '../../games/minerGamesSocketMessages';
import { createMinerGamesSocketGuard } from '../../games/minerGamesSocketGuards';
import { CRYPTO_ICONS, COIN_COLORS, ICON_IMAGES } from '../../games/cryptoGameIcons';

type CryptoIconKey = keyof typeof CRYPTO_ICONS;

/** `cryptoGameIcons.js` builds this object dynamically; treat as image map for indexing. */
const ICON_IMAGES_MAP = ICON_IMAGES as Record<CryptoIconKey, HTMLImageElement>;

/** UI route keys — map to server slugs on `game:start`. */
type ActiveGame = 'memory' | 'match-3' | 'cart' | null;

type MemoryBoardCard = {
  id: number;
  symbol?: string | null;
  isFlipped?: boolean;
  isMatched?: boolean;
};

type Match3Piece = {
  symbol: string;
  x: number;
  y: number;
  visualX: number;
  visualY: number;
  scale?: number;
};

type Match3Cell = { cx: number; cy: number };

/** Forward swap uses fx,fy,tx,ty; invalid_swap replay uses rx,ry,rfx,rfy only. */
type SwapAnim = {
  startTime: number;
  duration: number;
  fx?: number;
  fy?: number;
  tx?: number;
  ty?: number;
  rx?: number;
  ry?: number;
  rfx?: number;
  rfy?: number;
} | null;

type CartEventVariant = { body?: string; accent?: string; glow?: string };

type CartServerEvent = {
  id?: string;
  lane?: number;
  progress?: number;
  speed?: number;
  kind?: string;
  variant?: CartEventVariant;
};

type CartStateRef = {
  lane: number;
  renderLane: number;
  steer: number;
  lanes: number;
  health: number;
  score: number;
  events: CartServerEvent[];
  targetScore: number;
  distance: number;
  btcCount: number;
  hit: CartServerEvent | null;
  roadSpeed: number;
  roadOffset: number;
  lastServerUpdateAt: number;
  lastFrameAt: number;
  difficulty: number;
  localEvents?: CartServerEvent[];
  lastProcessedUpdate?: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
};

type CardFlipAnim = { startTime: number; duration: number; opening: boolean };

type GameStartedMemory = {
  game: 'crypto-memory';
  board: Array<{ id: number; isFlipped?: boolean; isMatched?: boolean; symbol?: string }>;
  score?: number;
};

type GameStartedMatch3 = {
  game: 'crypto-match-3';
  board: string[][];
  score?: number;
};

type GameStartedCart = {
  game: 'cart-rush';
  lane?: number;
  lanes?: number;
  health?: number;
  score?: number;
  targetScore?: number;
  distance?: number;
  btcCount?: number;
  roadSpeed?: number;
  timeLimitSeconds?: number;
};

type GameStartedPayload = GameStartedMemory | GameStartedMatch3 | GameStartedCart;

type MemoryGridLayout = ReturnType<typeof getMemoryGridLayout>;
type Match3GridLayout = ReturnType<typeof getMatch3GridLayout>;

const SOCKET_URL = '/';
const LOGICAL = MINER_GAMES_LOGICAL_SIZE;
const CART_LOGICAL_WIDTH = 750;
const CART_LOGICAL_HEIGHT = 500;
const CART_TOUCH_SWIPE_THRESHOLD = 26;
const CART_TARGET_SCORE = 750;
const CART_TIME_LIMIT_SECONDS = 120;

/** Must match server MEMORY_FLIP_OPEN_SETTLE_MS (~client open animation). */
const MEMORY_CARD_OPEN_ANIM_MS = 300;
const MEMORY_CARD_CLOSE_ANIM_MS = 500;

/** Defer React state updates out of the canvas rAF callback stack. */
function scheduleUiUpdate(fn: () => void) {
  if (typeof queueMicrotask === 'function') queueMicrotask(fn);
  else void Promise.resolve().then(fn);
}

function clearTimeoutList(listRef: MutableRefObject<ReturnType<typeof setTimeout>[]>) {
  listRef.current.forEach((id) => clearTimeout(id));
  listRef.current = [];
}

function clampCartLane(value: number, lanes: number) {
  return Math.max(0, Math.min(lanes - 1, value));
}

function getCanvasLogicalSize(activeGame: ActiveGame) {
  return activeGame === 'cart'
    ? { width: CART_LOGICAL_WIDTH, height: CART_LOGICAL_HEIGHT }
    : { width: LOGICAL, height: LOGICAL };
}

function getCanvasViewportStyle(activeGame: ActiveGame): React.CSSProperties {
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

function getCartTrackLayout(
  lanes: number,
  logicalWidth = CART_LOGICAL_WIDTH,
  logicalHeight = CART_LOGICAL_HEIGHT,
) {
  const roadX = 0;
  const roadY = 50;
  const roadW = logicalWidth;
  const roadH = logicalHeight - 100;
  const laneH = roadH / lanes;
  return { roadX, roadY, roadW, roadH, laneH };
}

function getCartLaneFromPointer(
  y: number,
  lanes: number,
  logicalWidth = CART_LOGICAL_WIDTH,
  logicalHeight = CART_LOGICAL_HEIGHT,
) {
  const { roadY, roadH, laneH } = getCartTrackLayout(lanes, logicalWidth, logicalHeight);
  const boundedY = Math.max(roadY, Math.min(roadY + roadH - 1, y));
  return clampCartLane(Math.floor((boundedY - roadY) / laneH), lanes);
}

function pointerClientXY(
  e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
): { clientX: number; clientY: number } {
  if ('touches' in e && e.touches.length > 0) {
    return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
  }
  const m = e as React.MouseEvent<HTMLCanvasElement>;
  return { clientX: m.clientX, clientY: m.clientY };
}

export default function Games() {
  const { t } = useTranslation();
  const { token } = useAuthStore();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [activeGame, setActiveGame] = useState<ActiveGame>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [hudScore, setHudScore] = useState(0);
  const [isGameOver, setIsGameOver] = useState(false);
  const [rewardMessage, setRewardMessage] = useState<string | null>(null);
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
  const activeGameRef = useRef<ActiveGame>(null);

  const memoryLayout = useMemo<MemoryGridLayout>(() => getMemoryGridLayout(LOGICAL), []);
  const match3Layout = useMemo<Match3GridLayout>(() => getMatch3GridLayout(LOGICAL), []);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameLoopRef = useRef<number | null>(null);
  const particles = useRef<Particle[]>([]);
  const visualBoard = useRef<Match3Piece[][]>([]);
  const pointer = useRef({ x: 250, y: 250, isDown: false });
  const isTouchDevice = useRef(
    typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0),
  );
  const selectedCell = useRef<Match3Cell | null>(null);
  const swapAnim = useRef<SwapAnim>(null);
  const memoryBoardRef = useRef<MemoryBoardCard[] | null>(null);
  const cartStateRef = useRef<CartStateRef>({
    lane: 1,
    renderLane: 1,
    steer: 0,
    lanes: 3,
    health: 3,
    score: 0,
    events: [],
    targetScore: CART_TARGET_SCORE,
    distance: 0,
    btcCount: 0,
    hit: null,
    roadSpeed: 0.48,
    roadOffset: 0,
    lastServerUpdateAt: 0,
    lastFrameAt: 0,
    difficulty: 0,
  });
  const cartTouchRef = useRef({ active: false, y: 0 });
  /** Canvas HUD must not close over `timeLeft` state — that changes every 1s and would recreate drawCart + restart rAF. */
  const cartHudTimeRef = useRef(0);
  const cardFlipAnims = useRef(new Map<number, CardFlipAnim>());
  const pendingTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const socketEmitGuardRef = useRef(createMinerGamesSocketGuard());

  // Throttling and input authority refs for Cart Rush
  const lastEmittedLaneRef = useRef<number | null>(null);
  const lastEmitTimeRef = useRef<number>(0);
  const emitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLaneActionTimeRef = useRef<number>(0);
  const starsRef = useRef<Array<{ x: number; y: number; speed: number; size: number }>>([]);

  const initStars = useCallback(() => {
    const stars = [];
    for (let i = 0; i < 40; i++) {
      stars.push({
        x: Math.random() * CART_LOGICAL_WIDTH,
        y: Math.random() * CART_LOGICAL_HEIGHT,
        speed: Math.random() * 80 + 30,
        size: Math.random() * 1.8 + 0.6,
      });
    }
    starsRef.current = stars;
  }, []);

  const emitLaneChange = useCallback((lane: number) => {
    if (!socket) return;
    const now = performance.now();
    const minInterval = 50; // ms
    
    const doEmit = (targetLane: number) => {
      socket.emit('game:action', { type: 'lane', lane: targetLane });
      lastEmittedLaneRef.current = targetLane;
      lastEmitTimeRef.current = performance.now();
      if (emitTimeoutRef.current) {
        clearTimeout(emitTimeoutRef.current);
        emitTimeoutRef.current = null;
      }
    };

    if (emitTimeoutRef.current) {
      clearTimeout(emitTimeoutRef.current);
      emitTimeoutRef.current = setTimeout(() => {
        doEmit(lane);
      }, Math.max(0, minInterval - (now - lastEmitTimeRef.current)));
      return;
    }

    const elapsed = now - lastEmitTimeRef.current;
    if (elapsed >= minInterval) {
      doEmit(lane);
    } else {
      emitTimeoutRef.current = setTimeout(() => {
        doEmit(lane);
      }, minInterval - elapsed);
    }
  }, [socket]);

  const [totalGamePower, setTotalGamePower] = useState(0);
  const [powerLoading, setPowerLoading] = useState(true);
  const [powerError, setPowerError] = useState<string | null>(null);
  const [powerFlash, setPowerFlash] = useState(false);
  const prevGamePowerRef = useRef<number | null>(null);

  cartHudTimeRef.current = timeLeft;

  const fetchActiveGamePowers = useCallback(async (options: { silent?: boolean } = {}) => {
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

  const createExplosion = useCallback((x: number, y: number) => {
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
    const guard = socketEmitGuardRef.current;
    const newSocket = io(SOCKET_URL, { auth: { token }, withCredentials: true });

    newSocket.on('game:error', (msg: unknown) => {
      guard.releaseStart();
      clearTimeoutList(pendingTimeoutsRef);
      toast.error(translateGameSocketError(t, msg));
      setIsProcessing(false);
      setActiveGame(null);
      setSessionReady(false);
      memoryBoardRef.current = null;
    });

    newSocket.on('game:started', (raw: unknown) => {
      const data = raw as GameStartedPayload;
      guard.releaseStart();
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
        initStars();
        cartStateRef.current = {
          lane: Number(data.lane) || 1,
          renderLane: Number(data.lane) || 1,
          steer: 0,
          lanes: Number(data.lanes) || 3,
          health: Number(data.health) || 3,
          score: Number(data.score) || 0,
          events: [],
          targetScore: Number(data.targetScore) || CART_TARGET_SCORE,
          distance: Number(data.distance) || 0,
          btcCount: Number(data.btcCount) || 0,
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

      setTimeLeft(
        data.game === 'crypto-memory'
          ? 70
          : data.game === 'cart-rush'
            ? Number(data.timeLimitSeconds) || CART_TIME_LIMIT_SECONDS
            : 180,
      );
    });

    newSocket.on('game:card_flipped', (data: { id: number; symbol: string }) => {
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

    newSocket.on('game:match', (data: { ids: number[]; score: number }) => {
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

    newSocket.on('game:mismatch', (data: { ids: number[] }) => {
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

    newSocket.on('game:board_update', (data: { board?: string[][]; score: number }) => {
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

    newSocket.on('game:cart_lane', (data: { lane?: number }) => {
      const nextLane = Number(data.lane) || 0;
      const serverNow = performance.now();
      const current = cartStateRef.current;
      const ignoreServerLane = lastLaneActionTimeRef.current && (serverNow - lastLaneActionTimeRef.current < 800);
      const laneToUse = ignoreServerLane ? current.lane : nextLane;
      cartStateRef.current = {
        ...current,
        lane: laneToUse,
        renderLane: Number.isFinite(current.renderLane) ? current.renderLane : laneToUse,
      };
    });

    newSocket.on('game:cart_update', (data: Record<string, unknown>) => {
      const nextLane = Number(data.lane) || 0;
      const serverNow = performance.now();
      const current = cartStateRef.current;
      const ignoreServerLane = lastLaneActionTimeRef.current && (serverNow - lastLaneActionTimeRef.current < 800);
      const laneToUse = ignoreServerLane ? current.lane : nextLane;
      cartStateRef.current = {
        ...current,
        lane: laneToUse,
        renderLane: Number.isFinite(current.renderLane) ? current.renderLane : laneToUse,
        health: Number(data.health) || 0,
        score: Number(data.score) || 0,
        targetScore: Number(data.targetScore) || current.targetScore,
        distance: Number(data.distance) || 0,
        btcCount: Number(data.btcCount) || 0,
        events: Array.isArray(data.events)
          ? (data.events as CartServerEvent[]).map((event) => ({
              ...event,
              progress: Number(event.progress) || 0,
              speed:
                Number(event.speed) ||
                Number(data.roadSpeed) ||
                current.roadSpeed ||
                0.48,
            }))
          : [],
        hit: (data.hit as CartServerEvent | null | undefined) ?? null,
        roadSpeed: Number(data.roadSpeed) || current.roadSpeed || 0.48,
        difficulty: Number(data.difficulty) || 0,
        lastServerUpdateAt: serverNow,
      };
      const hitPayload = data.hit as CartServerEvent | null | undefined;
      if (hitPayload?.kind === 'enemy-car') {
        const lanes = Math.max(3, Number(cartStateRef.current.lanes) || 3);
        const { roadX, roadY, roadW, roadH, laneH } = getCartTrackLayout(lanes, CART_LOGICAL_WIDTH, CART_LOGICAL_HEIGHT);
        createExplosion(
          roadX + Math.min(roadW * 0.26, 172),
          roadY + laneH * cartStateRef.current.lane + laneH / 2,
        );
      }
    });

    newSocket.on('game:score_update', (data: { score: number }) => {
      setHudScore(data.score);
    });

    newSocket.on(
      'game:finished',
      (data: {
        cooldownSeconds?: number;
        success?: boolean;
        messageCode?: string;
        message?: string;
        rewardCode?: string;
        rewardParams?: Record<string, unknown>;
        reward?: string;
      }) => {
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
      guard.releaseStart();
      clearTimeoutList(pendingTimeoutsRef);
      newSocket.disconnect();
      if (emitTimeoutRef.current) {
        clearTimeout(emitTimeoutRef.current);
        emitTimeoutRef.current = null;
      }
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
      const raw = window.devicePixelRatio || 1;
      /** Cart-rush: lower DPR cap on canvas = far less fill-rate work on phones (still sharp enough at 750×500 logical). */
      const dpr =
        activeGame === 'cart' ? Math.min(1.5, raw) : Math.min(2, raw);
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
    const noDefault = (e: Event) => e.preventDefault();
    canvas.addEventListener('touchstart', noDefault, { passive: false });
    canvas.addEventListener('touchmove', noDefault, { passive: false });
    return () => {
      canvas.removeEventListener('touchstart', noDefault);
      canvas.removeEventListener('touchmove', noDefault);
    };
  }, [activeGame, isGameOver, sessionReady]);

  const drawMemory = useCallback(
    (ctx: CanvasRenderingContext2D) => {
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
          const img =
            card.symbol && card.symbol in ICON_IMAGES_MAP
              ? ICON_IMAGES_MAP[card.symbol as CryptoIconKey]
              : undefined;
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
    (ctx: CanvasRenderingContext2D) => {
      if (!visualBoard.current.length) return;
      const { cellSize: s, sx, sy, stride } = match3Layout;
      const eio = (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

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
            const { fx, fy, tx, ty, rx, ry, rfx, rfy } = sa;
            if (fx !== undefined && fy !== undefined && tx !== undefined && ty !== undefined) {
              if (fx === x && fy === y) {
                drawX += (tx - fx) * saOffset * stride;
                drawY += (ty - fy) * saOffset * stride;
              } else if (tx === x && ty === y) {
                drawX += (fx - tx) * saOffset * stride;
                drawY += (fy - ty) * saOffset * stride;
              }
            }
            if (rx !== undefined && ry !== undefined && rfx !== undefined && rfy !== undefined) {
              if (rx === x && ry === y) {
                drawX += (rfx - rx) * saOffset * stride;
                drawY += (rfy - ry) * saOffset * stride;
              } else if (rfx === x && rfy === y) {
                drawX += (rx - rfx) * saOffset * stride;
                drawY += (ry - rfy) * saOffset * stride;
              }
            }
          }

          const col =
            piece.symbol in COIN_COLORS ? COIN_COLORS[piece.symbol as CryptoIconKey] : undefined;
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

          const img =
            piece.symbol in ICON_IMAGES_MAP
              ? ICON_IMAGES_MAP[piece.symbol as CryptoIconKey]
              : undefined;
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

  const drawCart = useCallback((ctx: CanvasRenderingContext2D, deltaSeconds: number) => {
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
    
    // Cyberpunk Sky Background
    ctx.fillStyle = '#050409';
    ctx.fillRect(0, 0, CART_LOGICAL_WIDTH, CART_LOGICAL_HEIGHT);
    
    // Parallax Stars / Space backdrop
    ctx.fillStyle = '#ffffff';
    if (starsRef.current) {
      starsRef.current.forEach((star) => {
        star.x -= star.speed * deltaSeconds;
        if (star.x < 0) {
          star.x = CART_LOGICAL_WIDTH;
          star.y = Math.random() * CART_LOGICAL_HEIGHT;
        }
        ctx.save();
        ctx.globalAlpha = 0.2 + (star.speed / 110) * 0.6;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    }
    
    // Cyberpunk neon grid shoulders
    const shoulderGrad = ctx.createLinearGradient(0, 0, 0, CART_LOGICAL_HEIGHT);
    shoulderGrad.addColorStop(0, '#1e1133');
    shoulderGrad.addColorStop(0.1, '#0c071a');
    shoulderGrad.addColorStop(0.9, '#0c071a');
    shoulderGrad.addColorStop(1, '#1e1133');
    ctx.fillStyle = shoulderGrad;
    ctx.fillRect(0, 0, CART_LOGICAL_WIDTH, 50);
    ctx.fillRect(0, CART_LOGICAL_HEIGHT - 50, CART_LOGICAL_WIDTH, 50);
    
    // Road surface gradient
    const roadGrad = ctx.createLinearGradient(0, roadY, 0, roadY + roadH);
    roadGrad.addColorStop(0, '#0a0915');
    roadGrad.addColorStop(0.5, '#0e0d22');
    roadGrad.addColorStop(1, '#0a0915');
    ctx.fillStyle = roadGrad;
    ctx.fillRect(roadX, roadY, roadW, roadH);
    
    // Glowing neon pink borders for road edges
    ctx.strokeStyle = '#f72585';
    ctx.shadowColor = '#f72585';
    ctx.shadowBlur = 8;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, roadY);
    ctx.lineTo(CART_LOGICAL_WIDTH, roadY);
    ctx.moveTo(0, roadY + roadH);
    ctx.lineTo(CART_LOGICAL_WIDTH, roadY + roadH);
    ctx.stroke();
    ctx.shadowBlur = 0; // reset shadow
    
    // Neon scrolling horizontal grid lines (receding visual)
    ctx.strokeStyle = 'rgba(0, 245, 255, 0.08)';
    ctx.lineWidth = 1;
    const gridSpacing = 80;
    const gridOffset = scroll % gridSpacing;
    ctx.beginPath();
    for (let gx = -gridSpacing; gx < CART_LOGICAL_WIDTH + gridSpacing; gx += gridSpacing) {
      ctx.moveTo(gx - gridOffset, roadY);
      ctx.lineTo(gx - gridOffset, roadY + roadH);
    }
    ctx.stroke();

    // Lane Dividers (Glowing dashed lines)
    ctx.strokeStyle = 'rgba(0, 245, 255, 0.28)';
    ctx.shadowColor = '#00f5ff';
    ctx.shadowBlur = 4;
    ctx.setLineDash([60, 40]);
    ctx.lineDashOffset = -scroll;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 1; i < lanes; i++) {
      const ly = roadY + laneH * i;
      ctx.moveTo(0, ly);
      ctx.lineTo(CART_LOGICAL_WIDTH, ly);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0; // reset

    // Vector art drawing helpers for obstacles
    const drawCone = (cx: number, cy: number) => {
      ctx.save();
      ctx.translate(cx, cy);
      
      // Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.ellipse(0, 16, 20, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      // Cone Base
      ctx.fillStyle = '#1e1b18';
      ctx.beginPath();
      ctx.roundRect(-22, 10, 44, 6, 2);
      ctx.fill();

      // Cone Body (Orange)
      ctx.fillStyle = '#ff6b35';
      ctx.beginPath();
      ctx.moveTo(-14, 10);
      ctx.lineTo(-4, -18);
      ctx.quadraticCurveTo(0, -20, 4, -18);
      ctx.lineTo(14, 10);
      ctx.closePath();
      ctx.fill();

      // Reflective white stripe
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(-9, -2);
      ctx.lineTo(-6, -8);
      ctx.lineTo(6, -8);
      ctx.lineTo(9, -2);
      ctx.closePath();
      ctx.fill();

      // Neon glow
      ctx.strokeStyle = 'rgba(255, 107, 53, 0.4)';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#ff6b35';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(-14, 10);
      ctx.lineTo(-4, -18);
      ctx.lineTo(4, -18);
      ctx.lineTo(14, 10);
      ctx.stroke();
      
      ctx.restore();
    };

    const drawBarrier = (cx: number, cy: number) => {
      ctx.save();
      ctx.translate(cx, cy);

      // Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.ellipse(0, 16, 25, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      // Support legs
      ctx.strokeStyle = '#4a4a4a';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-18, 16);
      ctx.lineTo(-12, -10);
      ctx.lineTo(-6, 16);
      ctx.moveTo(6, 16);
      ctx.lineTo(12, -10);
      ctx.lineTo(18, 16);
      ctx.stroke();

      // Horizontal board
      ctx.fillStyle = '#ffb703';
      ctx.beginPath();
      ctx.roundRect(-26, -8, 52, 14, 2);
      ctx.fill();

      // Diagonal black stripes
      ctx.strokeStyle = '#1e1b18';
      ctx.lineWidth = 5;
      ctx.save();
      ctx.beginPath();
      ctx.rect(-26, -8, 52, 14);
      ctx.clip();
      ctx.beginPath();
      for (let ox = -40; ox < 40; ox += 14) {
        ctx.moveTo(ox, -10);
        ctx.lineTo(ox + 10, 10);
      }
      ctx.stroke();
      ctx.restore();

      // Neon warning lights on top corners
      const pulse = Math.sin(now * 0.015) > 0;
      ctx.fillStyle = pulse ? '#ff002b' : '#55000a';
      if (pulse) {
        ctx.shadowColor = '#ff002b';
        ctx.shadowBlur = 8;
      }
      ctx.beginPath();
      ctx.arc(-20, -12, 4, 0, Math.PI * 2);
      ctx.arc(20, -12, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    };

    const drawPothole = (cx: number, cy: number) => {
      ctx.save();
      ctx.translate(cx, cy);

      // Dark hole
      ctx.fillStyle = '#050409';
      ctx.beginPath();
      ctx.ellipse(0, 0, 32, 14, 0, 0, Math.PI * 2);
      ctx.fill();

      // Neon crack outlines (cyberpunk road glitch style)
      ctx.strokeStyle = '#7209b7'; // glowing purple
      ctx.lineWidth = 1.5;
      ctx.shadowColor = '#7209b7';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.ellipse(0, 0, 32, 14, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Cracks extending outwards
      ctx.beginPath();
      ctx.moveTo(-32, 0);
      ctx.lineTo(-42, -4);
      ctx.lineTo(-46, -2);
      
      ctx.moveTo(32, 0);
      ctx.lineTo(44, 5);
      
      ctx.moveTo(0, -14);
      ctx.lineTo(4, -22);
      ctx.lineTo(-2, -26);
      
      ctx.moveTo(-10, 13);
      ctx.lineTo(-14, 20);
      ctx.stroke();

      ctx.restore();
    };

    const drawPlayerCar = (x: number, y: number, tilt: number, alpha = 1) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(tilt);
      ctx.globalAlpha = alpha;

      if (alpha === 1) {
          ctx.save();
          // Hyper headlights pointing RIGHT
          const lightGrad = ctx.createLinearGradient(CAR_WIDTH/2 - 10, 0, CAR_WIDTH/2 + 250, 0);
          lightGrad.addColorStop(0, 'rgba(0, 245, 255, 0.25)'); // cyan headlights
          lightGrad.addColorStop(1, 'rgba(0, 245, 255, 0)');
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

      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.ellipse(2, 6, CAR_WIDTH/2 + 4, CAR_HEIGHT/2 + 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Wheels with glowing cyan rims
      ctx.fillStyle = '#111';
      [[-35, -28], [18, -28], [-35, 18], [18, 18]].forEach(p => {
          ctx.fillRect(p[0], p[1], 24, 12);
          
          ctx.save();
          ctx.strokeStyle = '#00f5ff';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect(p[0] + 4, p[1] + 2, 16, 8, 2);
          ctx.stroke();
          ctx.restore();
      });

      // Body Gradient (Cyber Red/Indigo sportscar)
      const grad = ctx.createLinearGradient(-CAR_WIDTH/2, 0, CAR_WIDTH/2, 0);
      grad.addColorStop(0, '#f72585'); // neon hot pink rear
      grad.addColorStop(1, '#ff003c'); // bright crimson nose
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(-CAR_WIDTH/2, -CAR_HEIGHT/2, CAR_WIDTH, CAR_HEIGHT, 14);
      ctx.fill();

      // Center decal stripe
      ctx.fillStyle = '#00f5ff';
      ctx.fillRect(-CAR_WIDTH/2, -5, CAR_WIDTH, 10);

      // Cabin / Glass windshield (Sleek dark blue glassmorphism)
      ctx.fillStyle = '#0a0f1d';
      ctx.beginPath();
      ctx.roundRect(-10, -18, 38, 36, 6);
      ctx.fill();
      
      ctx.strokeStyle = 'rgba(0, 245, 255, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(-10, -18, 38, 36, 6);
      ctx.stroke();

      // Exhaust tail-lights
      ctx.fillStyle = '#ff0055';
      ctx.shadowColor = '#ff0055';
      ctx.shadowBlur = 10;
      ctx.fillRect(-CAR_WIDTH/2, -18, 5, 8);
      ctx.fillRect(-CAR_WIDTH/2, 10, 5, 8);

      ctx.restore();
    };

    const drawEnemyCar = (cx: number, cy: number, color: string) => {
      ctx.save();
      ctx.translate(cx, cy);

      // Headlight beams pointing LEFT (oncoming)
      ctx.save();
      const lightGrad = ctx.createLinearGradient(-CAR_WIDTH/2, 0, -CAR_WIDTH/2 - 150, 0);
      lightGrad.addColorStop(0, 'rgba(255, 0, 85, 0.18)'); // neon red headlight cone
      lightGrad.addColorStop(1, 'rgba(255, 0, 85, 0)');
      ctx.fillStyle = lightGrad;
      ctx.beginPath();
      ctx.moveTo(-CAR_WIDTH/2 + 5, -12);
      ctx.lineTo(-CAR_WIDTH/2 - 140, -32);
      ctx.lineTo(-CAR_WIDTH/2 - 140, 12);
      ctx.lineTo(-CAR_WIDTH/2 + 5, 0);
      ctx.fill();
      ctx.restore();

      // Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.ellipse(0, 6, CAR_WIDTH/2 + 4, CAR_HEIGHT/2 + 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Wheels
      ctx.fillStyle = '#0c0c10';
      [[-32, -28], [22, -28], [-32, 18], [22, 18]].forEach(p => {
          ctx.fillRect(p[0], p[1], 20, 10);
      });

      // Car body (cyber styled)
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(-CAR_WIDTH/2, -CAR_HEIGHT/2, CAR_WIDTH, CAR_HEIGHT, 8);
      ctx.fill();

      // Cyber glowing decal line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(-CAR_WIDTH/2, -CAR_HEIGHT/2, CAR_WIDTH, CAR_HEIGHT, 8);
      ctx.stroke();

      // Cockpit / Windshield
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.moveTo(-16, -16);
      ctx.lineTo(-34, -16);
      ctx.lineTo(-38, 16);
      ctx.lineTo(-16, 16);
      ctx.closePath();
      ctx.fill();

      // Taillights (facing right, meaning on the right side)
      ctx.fillStyle = '#ff0055';
      ctx.shadowColor = '#ff0055';
      ctx.shadowBlur = 8;
      ctx.fillRect(CAR_WIDTH/2 - 4, -16, 4, 8);
      ctx.fillRect(CAR_WIDTH/2 - 4, 8, 4, 8);

      // Oncoming headlights (facing left, meaning on the left side)
      ctx.fillStyle = '#ff3366';
      ctx.shadowColor = '#ff3366';
      ctx.shadowBlur = 10;
      ctx.fillRect(-CAR_WIDTH/2, -14, 4, 6);
      ctx.fillRect(-CAR_WIDTH/2, 8, 4, 6);

      ctx.restore();
    };

    const drawBTC = (cx: number, cy: number, rot: number) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(Math.cos(rot), 1);
      
      // Outer neon gold aura
      ctx.shadowColor = '#ffd60a';
      ctx.shadowBlur = 14;
      
      const grad = ctx.createRadialGradient(-3, -3, 2, 0, 0, BTC_SIZE);
      grad.addColorStop(0, '#ffd60a');
      grad.addColorStop(1, '#ff9f1c');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, BTC_SIZE, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.shadowBlur = 0; // reset
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('₿', 0, 1);
      ctx.restore();
    };

    // Client-side smooth target interpolation & extrapolation for events
    if (!state.localEvents) state.localEvents = [];
    
    if (state.lastProcessedUpdate !== state.lastServerUpdateAt) {
      state.lastProcessedUpdate = state.lastServerUpdateAt;
      const localMap = new Map(state.localEvents.map((e) => [e.id, e]));
      const newLocalEvents: CartServerEvent[] = [];
      
      for (const s_evt of state.events || []) {
        if (!s_evt.id) {
          newLocalEvents.push({ ...s_evt });
          continue;
        }
        let l_evt = localMap.get(s_evt.id);
        if (l_evt) {
          const diff = Number(s_evt.progress) - Number(l_evt.progress);
          if (Math.abs(diff) > 0.4) {
             l_evt.progress = s_evt.progress; // snap if massive desync
          }
          // Update properties from server authority
          (l_evt as any).serverProgress = s_evt.progress;
          l_evt.speed = s_evt.speed;
          l_evt.lane = s_evt.lane;
          newLocalEvents.push(l_evt);
        } else {
          // New event: Extrapolate start position to prevent pop/spawn stutter
          const elapsed = (now - state.lastServerUpdateAt) / 1000;
          const startProgress = (s_evt.progress ?? 0) + elapsed * (Number(s_evt.speed) || serverRoadSpeed);
          newLocalEvents.push({
            ...s_evt,
            serverProgress: s_evt.progress,
            progress: startProgress,
          } as any);
        }
      }
      state.localEvents = newLocalEvents;
    }
    
    // In every frame: smoothly lerp visual progress towards extrapolated target progress
    const elapsedSinceUpdate = (now - state.lastServerUpdateAt) / 1000;
    state.localEvents.forEach((e: any) => {
      const speed = Number(e.speed) || serverRoadSpeed;
      const target = (Number(e.serverProgress) || 0) + elapsedSinceUpdate * speed;
      const current = Number(e.progress) || 0;
      
      // Spring lerp (framerate independent)
      e.progress = current + (target - current) * (1 - Math.exp(-12 * deltaSeconds));
    });

    const btcRotation = now / 200;

    // Draw all local events with their custom drawings
    for (const event of state.localEvents) {
      const lane = clampCartLane(Number(event.lane) || 0, lanes);
      const progress = Math.max(0, Math.min(1.25, Number(event.progress) || 0));
      const y = roadY + laneH * lane + laneH / 2;
      const x = roadX + roadW - progress * (roadW + 180) + 60;

      switch (event.kind) {
        case 'coin':
          drawBTC(x, y, btcRotation);
          break;
        case 'cone':
          drawCone(x, y);
          break;
        case 'barrier':
          drawBarrier(x, y);
          break;
        case 'pothole':
          drawPothole(x, y);
          break;
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

    // Spawn thruster spark particles behind player's car
    if (!isGameOver && Math.random() < 0.85) {
      const rx = carX - CAR_WIDTH/2 + 5;
      const ry1 = carY - 14;
      const ry2 = carY + 14;
      
      particles.current.push({
        x: rx,
        y: ry1 + (Math.random() - 0.5) * 4,
        vx: -15 - Math.random() * 8, // shoot backwards fast
        vy: (Math.random() - 0.5) * 1.5,
        life: 0.7 + Math.random() * 0.4,
        color: Math.random() < 0.35 ? '#f72585' : '#00f5ff', // neon pink or cyan
        size: Math.random() * 2.5 + 1.2,
      });

      particles.current.push({
        x: rx,
        y: ry2 + (Math.random() - 0.5) * 4,
        vx: -15 - Math.random() * 8,
        vy: (Math.random() - 0.5) * 1.5,
        life: 0.7 + Math.random() * 0.4,
        color: Math.random() < 0.35 ? '#f72585' : '#00f5ff',
        size: Math.random() * 2.5 + 1.2,
      });
    }

    if (hit) {
      ctx.save();
      const shake = Math.sin(now * 0.04) * 9;
      ctx.translate(shake, -shake * 0.6);
    }

    drawPlayerCar(carX, carY, tilt, hit ? (now % 200 < 100 ? 0.5 : 1) : 1);

    if (hit) ctx.restore();

    // Dark screen border vignette
    const v = ctx.createRadialGradient(CART_LOGICAL_WIDTH/2, CART_LOGICAL_HEIGHT/2, CART_LOGICAL_WIDTH/3, CART_LOGICAL_WIDTH/2, CART_LOGICAL_HEIGHT/2, CART_LOGICAL_WIDTH/1.2);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, CART_LOGICAL_WIDTH, CART_LOGICAL_HEIGHT);

    ctx.restore();

    // Glassmorphic Retro Cyberpunk HUD
    ctx.save();
    const drawHudBox = (
      x: number,
      y: number,
      w: number,
      h: number,
      label: string,
      value: string,
      valueColor = '#ffffff',
    ) => {
      // Semi-transparent glass box
      ctx.fillStyle = 'rgba(10, 8, 20, 0.72)';
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 8);
      ctx.fill();
      
      // Neon border
      ctx.strokeStyle = 'rgba(0, 245, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();
      
      // Mini corner accent lines
      ctx.strokeStyle = valueColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y + 8); ctx.lineTo(x, y); ctx.lineTo(x + 8, y);
      ctx.moveTo(x + w, y + h - 8); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - 8, y + h);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '900 9px "Outfit", "Inter", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(label, x + 14, y + 18);
      
      ctx.fillStyle = valueColor;
      ctx.font = '900 21px "Outfit", "Inter", sans-serif';
      ctx.fillText(value, x + 14, y + h - 14);
    };

    drawHudBox(20, 20, 122, 56, 'TEMPO', `${cartHudTimeRef.current}s`, '#00f5ff');
    drawHudBox(156, 20, 122, 56, 'PONTOS', `${Number(state.score) || 0}`, '#f72585');
    drawHudBox(CART_LOGICAL_WIDTH - 280, 20, 122, 56, 'VIDAS', '❤️'.repeat(Math.max(0, Number(state.health) || 0)) || '0', '#ff0055');
    drawHudBox(CART_LOGICAL_WIDTH - 142, 20, 122, 56, 'DISTÂNCIA', `${Math.floor(Number(state.distance) || 0)}m`, '#ffffff');

    // Progress bar container
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath();
    ctx.roundRect(CART_LOGICAL_WIDTH / 2 - 150, CART_LOGICAL_HEIGHT - 26, 300, 6, 3);
    ctx.fill();

    // Progress bar fill (neon cyan/magenta gradient)
    const progressGrad = ctx.createLinearGradient(CART_LOGICAL_WIDTH / 2 - 150, 0, CART_LOGICAL_WIDTH / 2 + 150, 0);
    progressGrad.addColorStop(0, '#f72585');
    progressGrad.addColorStop(1, '#00f5ff');
    ctx.fillStyle = progressGrad;
    ctx.beginPath();
    ctx.roundRect(CART_LOGICAL_WIDTH / 2 - 150, CART_LOGICAL_HEIGHT - 26, 300 * missionProgress, 6, 3);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = '900 24px "Outfit", "Inter", sans-serif';
    ctx.fillText('MISSION: 750', CART_LOGICAL_WIDTH / 2, 52);
    ctx.font = '700 12px "Outfit", "Inter", sans-serif';
    ctx.fillStyle = '#aaaaaa';
    ctx.fillText(`1 BTC = 50 pontos  •  10 metros = 1 ponto  •  Meta ${state.targetScore}`, CART_LOGICAL_WIDTH / 2, 74);
    ctx.restore();
  }, []);

  useEffect(() => {
    if (!activeGame || !sessionReady || isGameOver) return;
    const logicalSize = getCanvasLogicalSize(activeGame);
    const render = (frameTime: number) => {
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

      if (activeGame === 'cart') {
        drawCart(ctx, deltaSeconds);
        if (particles.current.length > 0) {
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
        }
      } else {
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
      }

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
    return () => {
      if (gameLoopRef.current != null) cancelAnimationFrame(gameLoopRef.current);
    };
  }, [activeGame, sessionReady, isGameOver, drawMemory, drawMatch3, drawCart]);

  const syncMouse = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: pointer.current.x, y: pointer.current.y };
    const rect = canvas.getBoundingClientRect();
    const logicalSize = getCanvasLogicalSize(activeGame);
    const { clientX, clientY } = pointerClientXY(e);
    const x = ((clientX - rect.left) / rect.width) * logicalSize.width;
    const y = ((clientY - rect.top) / rect.height) * logicalSize.height;
    pointer.current.x = x;
    pointer.current.y = y;
    return { x, y };
  },
  [activeGame],
);

  const moveCartToPointerLane = useCallback(
    (y: number) => {
      if (!socket) return;
      const current = cartStateRef.current;
      const lanes = Math.max(3, Number(current.lanes) || 3);
      const nextLane = getCartLaneFromPointer(y, lanes, CART_LOGICAL_WIDTH, CART_LOGICAL_HEIGHT);
      if (nextLane === current.lane) return;
      if (!socketEmitGuardRef.current.tryEmitLane()) return;
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
    (step: number) => {
      if (!socket) return;
      const current = cartStateRef.current;
      const lanes = Math.max(3, Number(current.lanes) || 3);
      const nextLane = clampCartLane(current.lane + step, lanes);
      if (nextLane === current.lane) return;
      if (!socketEmitGuardRef.current.tryEmitLane()) return;
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
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
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
        if ('touches' in e && e.touches.length > 0) {
          cartTouchRef.current = { active: true, y };
          moveCartToPointerLane(y);
          return;
        }
        moveCartToPointerLane(y);
      }
    },
    [activeGame, isGameOver, isProcessing, socket, syncMouse, memoryLayout, match3Layout, moveCartToPointerLane],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      const { y } = syncMouse(e);
      if (activeGame === 'cart' && pointer.current.isDown && !isGameOver && !isProcessing) {
        if ('touches' in e && e.touches.length > 0 && cartTouchRef.current.active) {
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
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
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
    if (!socket || !socketEmitGuardRef.current.tryBeginStart()) return;
    clearTimeoutList(pendingTimeoutsRef);
    setActiveGame('memory');
    activeGameRef.current = 'memory';
    setSessionReady(false);
    memoryBoardRef.current = null;
    socket.emit('game:start', 'crypto-memory');
  }, [socket]);

  const startMatch3 = useCallback(() => {
    if (!socket || !socketEmitGuardRef.current.tryBeginStart()) return;
    clearTimeoutList(pendingTimeoutsRef);
    setActiveGame('match-3');
    activeGameRef.current = 'match-3';
    setSessionReady(false);
    memoryBoardRef.current = null;
    socket.emit('game:start', 'crypto-match-3');
  }, [socket]);

  const startCart = useCallback(() => {
    if (!socket || !socketEmitGuardRef.current.tryBeginStart()) return;
    clearTimeoutList(pendingTimeoutsRef);
    setActiveGame('cart');
    activeGameRef.current = 'cart';
    setSessionReady(false);
    memoryBoardRef.current = null;
    initStars();
    cartStateRef.current = {
      lane: 1,
      renderLane: 1,
      steer: 0,
      lanes: 3,
      health: 3,
      score: 0,
      events: [],
      targetScore: CART_TARGET_SCORE,
      distance: 0,
      btcCount: 0,
      hit: null,
      roadSpeed: 0.48,
      roadOffset: 0,
      lastServerUpdateAt: performance.now(),
      lastFrameAt: performance.now(),
      difficulty: 0,
    };
    socket.emit('game:start', 'cart-rush');
  }, [socket, initStars]);

  useEffect(() => {
    if (activeGame !== 'cart' || isGameOver || !socket) return undefined;
    const onKey = (e: KeyboardEvent) => {
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
              {/* Scanline overlay: skip for cart-rush (full-speed canvas + layered gradients = heavy compositing on mobile). */}
              {activeGame !== 'cart' ? (
                <div className="pointer-events-none absolute inset-0 z-50 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.03),rgba(0,255,0,0.01),rgba(0,0,255,0.03))] bg-[length:100%_4px,3px_100%] opacity-20" />
              ) : null}
              
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
                      if (!socket || !socketEmitGuardRef.current.tryBeginStart()) return;
                      clearTimeoutList(pendingTimeoutsRef);
                      setIsGameOver(false);
                      setSessionReady(false);
                      memoryBoardRef.current = null;
                      socket.emit('game:start', slug);
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

type TemporaryPowerSummaryProps = {
  t: TFunction;
  totalGamePower: number;
  loading: boolean;
  errorKey: string | null;
  flash: boolean;
  onRetry: () => void;
};

function TemporaryPowerSummary({
  t,
  totalGamePower,
  loading,
  errorKey,
  flash,
  onRetry,
}: TemporaryPowerSummaryProps) {
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

type GameCardLinkProps = {
  to: string;
  title: string;
  description: string;
  icon: LucideIcon;
  color: string;
  ctaLabel: string;
  disabled?: boolean;
  cooldownMinutes?: number;
};

const GameCardLink = memo(function GameCardLink({
  to,
  title,
  description,
  icon,
  color,
  ctaLabel,
  disabled = false,
  cooldownMinutes = 0,
}: GameCardLinkProps) {
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

type GameCardProps = {
  title: string;
  description: string;
  icon: LucideIcon;
  color: string;
  onClick: () => void;
  disabled: boolean;
  ctaStart: string;
  cooldownLabel: string;
};

const GameCard = memo(function GameCard({
  title,
  description,
  icon,
  color,
  onClick,
  disabled,
  ctaStart,
  cooldownLabel,
}: GameCardProps) {
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
