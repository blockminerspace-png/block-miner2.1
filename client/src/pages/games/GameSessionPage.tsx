import React, { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect, memo } from "react";
import type { MutableRefObject } from "react";
import { io, type Socket } from "socket.io-client";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { LucideIcon } from "lucide-react";
import { useAuthStore } from "../../store/auth";
import { useNavigate, useParams } from "react-router-dom";
import { Clock, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  MINER_GAMES_LOGICAL_SIZE,
  getMemoryGridLayout,
  hitTestMemoryCardIndex,
  getMatch3GridLayout,
  hitTestMatch3Cell
} from "../../games/minerGamesLayout";
import {
  translateGameSocketError,
  translateGameReward
} from "../../games/minerGamesSocketMessages";
import { createMinerGamesSocketGuard } from "../../games/minerGamesSocketGuards";
import { CRYPTO_ICONS, COIN_COLORS, ICON_IMAGES } from "../../games/cryptoGameIcons";
import type { GameFlowStat, GameFlowResolution } from "../../games/finish";
import { saveGameVerifyRecord } from "../../games/finish/gameVerifyStorage";
import { setGameCooldown } from "../../games/gameCooldownStore";

import type {
  ActiveGame,
  CryptoIconKey,
  MemoryBoardCard,
  Match3Piece,
  Match3Cell,
  SwapAnim,
  CartEventVariant,
  CartServerEvent,
  SceneryItem,
  CartStateRef,
  Particle,
  CardFlipAnim,
  GameStartedPayload,
  MemoryGridLayout,
  Match3GridLayout,
} from "./gameSession/gameSession.types";
import {
  SOCKET_URL,
  LOGICAL,
  CART_LOGICAL_WIDTH,
  CART_LOGICAL_HEIGHT,
  CART_TOUCH_SWIPE_THRESHOLD,
  CART_TARGET_SCORE,
  CART_TIME_LIMIT_SECONDS,
  MEMORY_CARD_OPEN_ANIM_MS,
  MEMORY_CARD_CLOSE_ANIM_MS,
  SLUG_MAP,
  GAME_LABEL_KEYS,
} from "./gameSession/gameSession.constants";
import {
  scheduleUiUpdate,
  clearTimeoutList,
  clampCartLane,
  getCanvasLogicalSize,
  getCanvasViewportStyle,
  getCartTrackLayout,
  getCartLaneFromPointer,
  pointerClientXY,
  formatMs,
  buildGameStats,
} from "./gameSession/gameSession.utils";

import { BlockStackArena } from "./gameSession/components/BlockStackArena";
import { SkyRunnerArena } from "./gameSession/components/SkyRunnerArena";
const ICON_IMAGES_MAP = ICON_IMAGES as Record<CryptoIconKey, HTMLImageElement>;

export default function GameSessionPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const mapping = SLUG_MAP[slug ?? ""];
  const activeGame: ActiveGame = mapping?.game ?? null;
  const serverSlug = mapping?.serverSlug ?? "";

  const { t } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;
  const { token } = useAuthStore();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const sessionReadyRef = useRef(false);
  const isGameOverRef = useRef(false);

  // Redirect to hub on invalid slug
  useEffect(() => {
    if (!mapping) navigate("/games", { replace: true });
  }, [mapping, navigate]);

  const [hudScore, setHudScore] = useState(0);
  const [isGameOver, setIsGameOver] = useState(false);
  sessionReadyRef.current = sessionReady;
  isGameOverRef.current = isGameOver;
  const gameStartedAtRef = useRef<number>(0);
  // Lightweight mirrors of gameplay state, snapshot-safe from inside socket callbacks.
  const hudScoreRef = useRef(0);
  const stackStateRef = useRef<{ blocksPlaced: number; target: number } | null>(null);
  const skyProgressRef = useRef<{ pipesPassed: number; target: number } | null>(null);
  const memoryProgressRef = useRef<{ pairs: number; totalPairs: number; attempts: number } | null>(null);
  const match3ProgressRef = useRef<{ swaps: number; cascades: number } | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  /**
   * Which tab is open in the games index: our minigames or the curated
   * partner-games catalog. Tabs only render when no game is active.
   */

  // Block Stack state (DOM-rendered, no canvas — simpler + lighter).
  const [stackState, setStackState] = useState<{
    target: number;
    playWidth: number;
    blocksPlaced: number;
    block: { width: number; travelMs: number; startedAt: number };
    base: { leftPx: number; width: number };
    tower: Array<{ leftPx: number; width: number }>;
  } | null>(null);

  /**
   * Sky Runner config (Flappy-Bird-style airplane). Client-authoritative
   * physics: the server only seeds the run + receives checkpoints for
   * anti-cheat. The Arena runs gravity, scroll, pipe spawning and collision
   * detection itself in a rAF loop using the constants below, so there is
   * zero input-to-render delay.
   */
  const [skyState, setSkyState] = useState<{
    seed: string;
    worldW: number;
    worldH: number;
    planeX: number;
    planeRadius: number;
    pipeW: number;
    pipeGap: number;
    pipeGapMin: number;
    pipeSpawnDx: number;
    pipeMargin: number;
    scrollSpeedBase: number;
    scrollSpeedMax: number;
    difficultyRampMs: number;
    gravity: number;
    flapVy: number;
    maxVy: number;
    minFlapIntervalMs: number;
    invulnMs: number;
    targetPipes: number;
    lives: number;
    maxLives: number;
    checkpointEveryPipes: number;
  } | null>(null);
  /** Server sets allowNewStart=false when a round is ACTIVE (continue), not only on cooldown. */
  const [gameTimerKey, setGameTimerKey] = useState(0);
  const activeGameRef = useRef<ActiveGame>(null);

  // Mirror hudScore → ref so socket callbacks can snapshot the latest score.
  useEffect(() => { hudScoreRef.current = hudScore; }, [hudScore]);
  useEffect(() => {
    if (stackState) stackStateRef.current = { blocksPlaced: stackState.blocksPlaced, target: stackState.target };
  }, [stackState]);

  useEffect(() => {
    activeGameRef.current = activeGame;
  }, [activeGame]);

  const memoryLayout = useMemo<MemoryGridLayout>(() => getMemoryGridLayout(LOGICAL), []);
  const match3Layout = useMemo<Match3GridLayout>(() => getMatch3GridLayout(LOGICAL), []);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameLoopRef = useRef<number | null>(null);
  const particles = useRef<Particle[]>([]);
  const visualBoard = useRef<Match3Piece[][]>([]);
  const pointer = useRef({ x: 250, y: 250, isDown: false });
  const isTouchDevice = useRef(
    typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0)
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
    difficulty: 0
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
  const sceneryRef = useRef<SceneryItem[]>([]);

  const initScenery = useCallback(() => {
    const items: SceneryItem[] = [];
    // Far background mountains (slow speed)
    for (let i = 0; i < 6; i++) {
      items.push({
        x: Math.random() * CART_LOGICAL_WIDTH,
        y: 135 + Math.random() * 25, // Horizon height is ~180, so mountains are drawn above it
        speedFactor: 0.12 + Math.random() * 0.08,
        size: 70 + Math.random() * 60, // Width base
        type: "mountain"
      });
    }
    // Trees and utility poles on both sides of the road (road is y: 180 to 360)
    for (let i = 0; i < 18; i++) {
      const isTop = Math.random() < 0.5;
      items.push({
        x: Math.random() * CART_LOGICAL_WIDTH,
        y: isTop ? 120 + Math.random() * 30 : 385 + Math.random() * 30,
        speedFactor: 0.95 + Math.random() * 0.08,
        size: 20 + Math.random() * 15,
        type: Math.random() < 0.5 ? "tree" : "pole"
      });
    }
    // Sort items by speedFactor for proper depth layering
    sceneryRef.current = items.sort((a, b) => a.speedFactor - b.speedFactor);
  }, []);

  const emitLaneChange = useCallback(
    (lane: number) => {
      if (!socket) return;
      const now = performance.now();
      const minInterval = 50; // ms

      const doEmit = (targetLane: number) => {
        socket.emit("game:action", { type: "lane", lane: targetLane });
        lastEmittedLaneRef.current = targetLane;
        lastEmitTimeRef.current = performance.now();
        if (emitTimeoutRef.current) {
          clearTimeout(emitTimeoutRef.current);
          emitTimeoutRef.current = null;
        }
      };

      if (emitTimeoutRef.current) {
        clearTimeout(emitTimeoutRef.current);
        emitTimeoutRef.current = setTimeout(
          () => {
            doEmit(lane);
          },
          Math.max(0, minInterval - (now - lastEmitTimeRef.current))
        );
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
    },
    [socket]
  );

  cartHudTimeRef.current = timeLeft;

  const createExplosion = useCallback((x: number, y: number) => {
    if (particles.current.length > 30) return;
    for (let i = 0; i < 8; i += 1) {
      particles.current.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 8,
        life: 1.0,
        color: "#3b82f6",
        size: Math.random() * 4 + 1.5
      });
    }
  }, []);

  useEffect(() => {
    const guard = socketEmitGuardRef.current;
    const newSocket = io(SOCKET_URL, {
      auth: { token },
      withCredentials: true,
      reconnection: false,
      transports: ['polling', 'websocket'],
      timeout: Math.max(60_000, Number(import.meta.env.VITE_SOCKET_TIMEOUT_MS) || 120_000),
    });

    // Auto-start the game for this session (socket.io queues until connected)
    if (activeGame && socketEmitGuardRef.current.tryBeginStart()) {
      activeGameRef.current = activeGame;
      if (activeGame === "cart") initScenery();
      if (activeGame === "stack") setStackState(null);
      if (activeGame === "sky") setSkyState(null);
      memoryBoardRef.current = null;
      newSocket.emit("game:start", serverSlug);
    }

    newSocket.on("game:error", (msg: unknown) => {
      guard.releaseStart();
      clearTimeoutList(pendingTimeoutsRef);
      toast.error(translateGameSocketError(tRef.current, msg));
      setIsProcessing(false);
      setSessionReady(false);
      memoryBoardRef.current = null;
      navigate("/games");
    });

    newSocket.on("game:started", (raw: unknown) => {
      const data = raw as GameStartedPayload;
      guard.releaseStart();
      clearTimeoutList(pendingTimeoutsRef);
      setIsGameOver(false);
      gameStartedAtRef.current = Date.now();
      setIsProcessing(false);
      setGameTimerKey((k) => k + 1);
      particles.current = [];
      cardFlipAnims.current.clear();

      if (data.game === "crypto-memory" && data.board) {
        memoryBoardRef.current = data.board.map((c) => ({ ...c }));
        setHudScore(Number(data.score) || 0);
        setSessionReady(true);
      } else if (data.game === "crypto-match-3" && data.board) {
        memoryBoardRef.current = null;
        selectedCell.current = null;
        swapAnim.current = null;
        visualBoard.current = data.board.map((row, y) =>
          row.map((s, x) => ({ symbol: s, x, y, visualX: x, visualY: y, scale: 1.0 }))
        );
        setHudScore(Number(data.score) || 0);
        setSessionReady(true);
      } else if (data.game === "cart-rush") {
        const serverNow = performance.now();
        memoryBoardRef.current = null;
        selectedCell.current = null;
        initScenery();
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
          difficulty: 0
        };
        setHudScore(Number(data.score) || 0);
        setSessionReady(true);
      } else if (data.game === "block-stack") {
        memoryBoardRef.current = null;
        setStackState({
          target: data.target,
          playWidth: data.playWidth,
          blocksPlaced: data.blocksPlaced,
          block: data.block,
          base: data.base,
          tower: [data.base],
        });
        setHudScore(Number(data.score) || 0);
        setSessionReady(true);
      } else if (data.game === "sky-runner") {
        memoryBoardRef.current = null;
        setSkyState({
          seed: data.seed,
          worldW: data.worldW,
          worldH: data.worldH,
          planeX: data.planeX,
          planeRadius: data.planeRadius,
          pipeW: data.pipeW,
          pipeGap: data.pipeGap,
          pipeGapMin: data.pipeGapMin,
          pipeSpawnDx: data.pipeSpawnDx,
          pipeMargin: data.pipeMargin,
          scrollSpeedBase: data.scrollSpeedBase,
          scrollSpeedMax: data.scrollSpeedMax,
          difficultyRampMs: data.difficultyRampMs,
          gravity: data.gravity,
          flapVy: data.flapVy,
          maxVy: data.maxVy,
          minFlapIntervalMs: data.minFlapIntervalMs,
          invulnMs: data.invulnMs,
          targetPipes: data.targetPipes,
          lives: data.lives,
          maxLives: data.maxLives,
          checkpointEveryPipes: data.checkpointEveryPipes,
        });
        setHudScore(Number(data.score) || 0);
        setSessionReady(true);
      } else {
        setSessionReady(false);
      }

      setTimeLeft(
        data.game === "crypto-memory"
          ? 70
          : data.game === "cart-rush"
            ? Number(data.timeLimitSeconds) || CART_TIME_LIMIT_SECONDS
            : data.game === "block-stack" || data.game === "sky-runner"
              ? 0 // No global timer — game-over is win/lose, not time-based
              : 180
      );
    });

    newSocket.on("game:card_flipped", (data: { id: number; symbol: string }) => {
      cardFlipAnims.current.set(data.id, {
        startTime: performance.now(),
        duration: MEMORY_CARD_OPEN_ANIM_MS,
        opening: true
      });
      const board = memoryBoardRef.current;
      if (!board) return;
      const card = board.find((c) => c.id === data.id);
      if (card) {
        card.symbol = data.symbol;
        card.isFlipped = true;
      }
    });

    newSocket.on("game:match", (data: { ids: number[]; score: number }) => {
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

    newSocket.on("game:mismatch", (data: { ids: number[] }) => {
      setIsProcessing(true);
      const now = performance.now();
      data.ids.forEach((id) => {
        cardFlipAnims.current.set(id, {
          startTime: now,
          duration: MEMORY_CARD_CLOSE_ANIM_MS,
          opening: false
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

    newSocket.on("game:board_update", (data: { board?: string[][]; score: number }) => {
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
          })
        );
      }
      setHudScore(data.score);
      createExplosion(250, 250);
      setIsProcessing(false);
    });

    newSocket.on("game:invalid_swap", () => {
      if (swapAnim.current) {
        const sa = swapAnim.current;
        swapAnim.current = {
          rx: sa.fx,
          ry: sa.fy,
          rfx: sa.tx,
          rfy: sa.ty,
          startTime: performance.now(),
          duration: 100
        };
      }
      selectedCell.current = null;
    });

    newSocket.on("game:cart_lane", (data: { lane?: number }) => {
      const nextLane = Number(data.lane) || 0;
      const serverNow = performance.now();
      const current = cartStateRef.current;
      const ignoreServerLane = lastLaneActionTimeRef.current && serverNow - lastLaneActionTimeRef.current < 800;
      const laneToUse = ignoreServerLane ? current.lane : nextLane;
      cartStateRef.current = {
        ...current,
        lane: laneToUse,
        renderLane: Number.isFinite(current.renderLane) ? current.renderLane : laneToUse
      };
    });

    newSocket.on("game:cart_update", (data: Record<string, unknown>) => {
      const nextLane = Number(data.lane) || 0;
      const serverNow = performance.now();
      const current = cartStateRef.current;
      const ignoreServerLane = lastLaneActionTimeRef.current && serverNow - lastLaneActionTimeRef.current < 800;
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
              speed: Number(event.speed) || Number(data.roadSpeed) || current.roadSpeed || 0.48
            }))
          : [],
        hit: (data.hit as CartServerEvent | null | undefined) ?? null,
        roadSpeed: Number(data.roadSpeed) || current.roadSpeed || 0.48,
        difficulty: Number(data.difficulty) || 0,
        lastServerUpdateAt: serverNow
      };
      const hitPayload = data.hit as CartServerEvent | null | undefined;
      if (hitPayload?.kind === "enemy-car") {
        const lanes = Math.max(3, Number(cartStateRef.current.lanes) || 3);
        const { roadX, roadY, roadW, roadH, laneH } = getCartTrackLayout(
          lanes,
          CART_LOGICAL_WIDTH,
          CART_LOGICAL_HEIGHT
        );
        createExplosion(roadX + Math.min(roadW * 0.26, 172), roadY + laneH * cartStateRef.current.lane + laneH / 2);
      }
    });

    newSocket.on("game:score_update", (data: { score: number }) => {
      setHudScore(data.score);
    });

    // Block Stack events
    newSocket.on(
      "game:stack_dropped",
      (data: {
        blocksPlaced: number;
        score: number;
        blockLeft: number;
        blockWidth: number;
        overlapWidth: number;
        missed: boolean;
        nextBlock?: { width: number; travelMs: number; startedAt: number };
        base?: { leftPx: number; width: number };
      }) => {
        setHudScore(Number(data.score) || 0);
        setStackState((prev) => {
          if (!prev) return prev;
          // Add the dropped block to the tower (uses the overlap, not the placed-block width).
          const placed = {
            leftPx: data.missed ? data.blockLeft : (data.base?.leftPx ?? prev.base.leftPx),
            width: data.missed ? data.blockWidth : (data.base?.width ?? prev.base.width),
          };
          const tower = [...prev.tower, placed];
          if (data.missed || !data.nextBlock || !data.base) {
            // Final frame before server fires game:finished — keep block visible for visual feedback.
            return { ...prev, blocksPlaced: data.blocksPlaced, tower };
          }
          return {
            ...prev,
            blocksPlaced: data.blocksPlaced,
            block: data.nextBlock,
            base: data.base,
            tower,
          };
        });
      }
    );

    // ─── Sky Runner events ───────────────────────────────────────────────────
    // Client runs all physics in rAF (see SkyRunnerArena). The server only
    // emits `game:started` (seed + constants) and `game:finished`. The Arena
    // emits `{type:"flap"|"checkpoint"|"finish"}` actions for anti-cheat.

    newSocket.on(
      "game:finished",
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
        if (activeGameRef.current) setGameCooldown(activeGameRef.current, cd);

        const durationMs = gameStartedAtRef.current
          ? Date.now() - gameStartedAtRef.current
          : 0;
        const captured: GameFlowStat[] = buildGameStats(activeGameRef.current, {
          score: hudScoreRef.current,
          durationMs,
          cart: cartStateRef.current,
          stack: stackStateRef.current,
          sky: skyProgressRef.current,
          memory: memoryProgressRef.current,
          match3: match3ProgressRef.current,
        }, tRef.current).map((s) => ({ label: s.label, value: s.value }));

        // The reward is already granted (or rejected) server-side at this
        // point — build the final resolution and hand off to /games/verify.
        // The verify page never triggers a grant, so a reload there can
        // never double-count the reward.
        let resolution: GameFlowResolution;
        if (data.success) {
          resolution = {
            outcome: "success",
            rewardMessage: translateGameReward(tRef.current, data),
            cooldownSeconds: cd,
            stats: captured,
          };
        } else {
          // Anti-cheat rejection uses a distinct messageCode and must never
          // surface as "cheat" — the verify page shows a neutral "couldn't
          // be validated" copy. All other failures use the generic failure UI.
          const isRejected = data.messageCode === "anti_cheat_timing";
          resolution = {
            outcome: isRejected ? "rejected" : "failure",
            rewardMessage: null,
            cooldownSeconds: cd,
            stats: captured,
            reasonKey: data.messageCode ?? null,
            reasonMessage: data.message ?? null,
          };
        }

        const gameKey = activeGameRef.current;
        saveGameVerifyRecord({
          gameKey: gameKey ?? "",
          gameLabelKey: gameKey ? GAME_LABEL_KEYS[gameKey] : "",
          playAgainPath: gameKey ? `/games/${gameKey}` : "/games",
          stats: captured,
          resolution,
          cooldownSeconds: cd,
        });
        // RollerCoin-style: leave the game and show the full verify page
        // (with the app sidebar + navbar) instead of an overlay on the game.
        navigate("/games/verify", { replace: true });
      }
    );

    newSocket.on("disconnect", () => {
      if (sessionReadyRef.current && !isGameOverRef.current) {
        toast.error(tRef.current("games.sessionDisconnected", { defaultValue: "Connection lost. Returning to games." }));
        navigate("/games", { replace: true });
      }
    });

    setSocket(newSocket);
    return () => {
      guard.releaseStart();
      clearTimeoutList(pendingTimeoutsRef);
      newSocket.removeAllListeners();
      newSocket.disconnect();
      if (emitTimeoutRef.current) {
        clearTimeout(emitTimeoutRef.current);
        emitTimeoutRef.current = null;
      }
    };
  }, [token, createExplosion, activeGame, serverSlug, initScenery, navigate]);


  useEffect(() => {
    if (!gameTimerKey || isGameOver) return;
    // Block Stack and Sky Runner have no global countdown (win/lose by
    // game outcome) — skip the global timer effect for them.
    if (activeGameRef.current === "stack" || activeGameRef.current === "sky") return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsGameOver(true);
          if (socket) socket.emit("game:end");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [gameTimerKey, isGameOver, socket]);

  useLayoutEffect(() => {
    if (!activeGame || isGameOver) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const applyDpr = () => {
      const c = canvasRef.current;
      if (!c) return;
      const { width: logicalWidth, height: logicalHeight } = getCanvasLogicalSize(activeGame);
      const rect = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const displayWidth = rect.width > 0 ? rect.width : logicalWidth;
      const displayHeight = rect.height > 0 ? rect.height : logicalHeight;
      c.width = Math.round(displayWidth * dpr);
      c.height = Math.round(displayHeight * dpr);
      const ctx = c.getContext("2d");
      if (ctx) {
        ctx.setTransform(c.width / logicalWidth, 0, 0, c.height / logicalHeight, 0, 0);
      }
    };
    applyDpr();
    window.addEventListener("resize", applyDpr);
    return () => window.removeEventListener("resize", applyDpr);
  }, [activeGame, isGameOver, sessionReady]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !activeGame || !sessionReady || isGameOver) return;
    const noDefault = (e: Event) => e.preventDefault();
    canvas.addEventListener("touchstart", noDefault, { passive: false });
    canvas.addEventListener("touchmove", noDefault, { passive: false });
    return () => {
      canvas.removeEventListener("touchstart", noDefault);
      canvas.removeEventListener("touchmove", noDefault);
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

        ctx.fillStyle = card.isMatched ? "#0f2d1f" : showFront ? "#0d1f3a" : "#0f172a";
        ctx.beginPath();
        ctx.roundRect(-r, -r, size, size, 16);
        ctx.fill();

        ctx.strokeStyle = card.isMatched
          ? "rgba(16,185,129,0.5)"
          : showFront
            ? "rgba(59,130,246,0.5)"
            : "rgba(51,65,85,0.7)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(-r, -r, size, size, 16);
        ctx.stroke();

        if (showFront && !card.isMatched) {
          const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
          grad.addColorStop(0, "rgba(59,130,246,0.08)");
          grad.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.roundRect(-r, -r, size, size, 16);
          ctx.fill();
        }

        if (showFront || card.isMatched) {
          const img =
            card.symbol && card.symbol in ICON_IMAGES_MAP ? ICON_IMAGES_MAP[card.symbol as CryptoIconKey] : undefined;
          if (img?.complete && img.naturalWidth > 0) {
            const is = size * 0.68;
            ctx.drawImage(img, -is / 2, -is / 2, is, is);
          }
        } else {
          ctx.strokeStyle = "rgba(51,65,85,0.4)";
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
    [memoryLayout]
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

          const col = piece.symbol in COIN_COLORS ? COIN_COLORS[piece.symbol as CryptoIconKey] : undefined;
          const cx2 = drawX + s / 2;
          const cy2 = drawY + s / 2;
          ctx.save();

          if (isSelected) {
            const pulseT = performance.now() / 700;
            const pulse = 0.5 + 0.5 * Math.sin(pulseT * Math.PI * 2);
            ctx.shadowBlur = 18 + 8 * pulse;
            ctx.shadowColor = col ? col.glow : "rgba(99,179,237,0.9)";
            ctx.strokeStyle = col ? col.border : "rgba(99,179,237,0.9)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(drawX - 2, drawY - 2, s + 4, s + 4, 14);
            ctx.stroke();
            ctx.shadowBlur = 0;
          }

          const bgGrad = ctx.createRadialGradient(cx2, cy2, 2, cx2, cy2, s * 0.75);
          if (col) {
            bgGrad.addColorStop(0, col.bg);
            bgGrad.addColorStop(1, "rgba(15,23,42,0.92)");
          } else {
            bgGrad.addColorStop(0, "rgba(30,41,59,0.8)");
            bgGrad.addColorStop(1, "rgba(15,23,42,0.92)");
          }
          ctx.fillStyle = bgGrad;
          ctx.beginPath();
          ctx.roundRect(drawX, drawY, s, s, 12);
          ctx.fill();

          ctx.strokeStyle = col ? col.border.replace("0.5", "0.3") : "rgba(51,65,85,0.5)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(drawX, drawY, s, s, 12);
          ctx.stroke();

          const img = piece.symbol in ICON_IMAGES_MAP ? ICON_IMAGES_MAP[piece.symbol as CryptoIconKey] : undefined;
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
    [match3Layout]
  );

  const drawCart = useCallback((ctx: CanvasRenderingContext2D, deltaSeconds: number) => {
    const state = cartStateRef.current;
    const lanes = Math.max(3, Number(state.lanes) || 3);
    const { roadX, roadY, roadW, roadH, laneH } = getCartTrackLayout(lanes, CART_LOGICAL_WIDTH, CART_LOGICAL_HEIGHT);
    const now = performance.now();
    const hit = state.hit;
    const serverRoadSpeed = Number(state.roadSpeed) || 0.48;
    const roadPixelsPerSecond = 110 + serverRoadSpeed * 90;
    state.roadOffset = ((Number(state.roadOffset) || 0) + roadPixelsPerSecond * deltaSeconds) % CART_LOGICAL_WIDTH;
    const scroll = state.roadOffset;
    const missionProgress = Math.max(
      0,
      Math.min(1, (Number(state.score) || 0) / Math.max(1, Number(state.targetScore) || CART_TARGET_SCORE))
    );

    const CAR_WIDTH = 110;
    const CAR_HEIGHT = 50;
    const BTC_SIZE = 28;

    ctx.save();

    // 1. Daytime Sky Background
    const skyGrad = ctx.createLinearGradient(0, 0, 0, 180);
    skyGrad.addColorStop(0, "#38bdf8");
    skyGrad.addColorStop(1, "#bae6fd");
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, CART_LOGICAL_WIDTH, 180);

    // Draw Sun
    ctx.save();
    ctx.fillStyle = "#fde68a";
    ctx.beginPath();
    ctx.arc(80, 55, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(253, 224, 71, 0.35)";
    ctx.beginPath();
    ctx.arc(80, 55, 44, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Clouds
    const drawCloud = (cx: number, cy: number, scale: number) => {
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.88)";
      ctx.beginPath();
      ctx.ellipse(cx, cy, 40 * scale, 20 * scale, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 28 * scale, cy + 5 * scale, 30 * scale, 16 * scale, 0, 0, Math.PI * 2);
      ctx.ellipse(cx - 25 * scale, cy + 5 * scale, 26 * scale, 14 * scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    drawCloud(260, 48, 0.8);
    drawCloud(480, 35, 1.0);
    drawCloud(680, 55, 0.75);

    // 2. Parallax Scenery (Mountains, Trees, Poles)
    if (sceneryRef.current) {
      sceneryRef.current.forEach((item) => {
        // Move scenery items left based on road speed
        const speed = roadPixelsPerSecond * item.speedFactor;
        item.x -= speed * deltaSeconds;
        if (item.x < -item.size * 2) {
          item.x = CART_LOGICAL_WIDTH + item.size;
        }

        ctx.save();
        if (item.type === "mountain") {
          // Bright green rolling hills
          const mountainGrad = ctx.createLinearGradient(item.x, item.y - item.size, item.x, item.y);
          mountainGrad.addColorStop(0, "#86efac");
          mountainGrad.addColorStop(1, "#4ade80");
          ctx.fillStyle = mountainGrad;
          ctx.beginPath();
          ctx.moveTo(item.x - item.size, item.y);
          ctx.lineTo(item.x, item.y - item.size);
          ctx.lineTo(item.x + item.size, item.y);
          ctx.closePath();
          ctx.fill();
        } else if (item.type === "tree") {
          // Pine tree
          ctx.translate(item.x, item.y);
          // Trunk
          ctx.fillStyle = "#92400e";
          ctx.fillRect(-3, 0, 6, 12);
          // Leaves (layers of green triangles)
          ctx.fillStyle = "#16a34a";
          ctx.beginPath();
          ctx.moveTo(0, -item.size);
          ctx.lineTo(-item.size * 0.5, -item.size * 0.4);
          ctx.lineTo(item.size * 0.5, -item.size * 0.4);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = "#15803d";
          ctx.beginPath();
          ctx.moveTo(0, -item.size * 0.6);
          ctx.lineTo(-item.size * 0.65, 0);
          ctx.lineTo(item.size * 0.65, 0);
          ctx.closePath();
          ctx.fill();
        } else if (item.type === "pole") {
          // Utility pole
          ctx.translate(item.x, item.y);
          ctx.strokeStyle = "#4a3525";
          ctx.lineWidth = 4;
          // Main post
          ctx.beginPath();
          ctx.moveTo(0, 15);
          ctx.lineTo(0, -item.size);
          ctx.stroke();
          // Crossbar
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(-12, -item.size + 4);
          ctx.lineTo(12, -item.size + 4);
          ctx.stroke();
          // Small white insulators
          ctx.fillStyle = "#eeeeee";
          ctx.fillRect(-11, -item.size + 1, 2, 3);
          ctx.fillRect(9, -item.size + 1, 2, 3);
        }
        ctx.restore();
      });
    }

    // 3. Ground Shoulders (bright grass)
    const topShoulderGrad = ctx.createLinearGradient(0, 130, 0, 180);
    topShoulderGrad.addColorStop(0, "#4ade80");
    topShoulderGrad.addColorStop(1, "#22c55e");
    ctx.fillStyle = topShoulderGrad;
    ctx.fillRect(0, 130, CART_LOGICAL_WIDTH, 50);

    const bottomShoulderGrad = ctx.createLinearGradient(0, 360, 0, CART_LOGICAL_HEIGHT);
    bottomShoulderGrad.addColorStop(0, "#22c55e");
    bottomShoulderGrad.addColorStop(1, "#16a34a");
    ctx.fillStyle = bottomShoulderGrad;
    ctx.fillRect(0, 360, CART_LOGICAL_WIDTH, CART_LOGICAL_HEIGHT - 360);

    // Guardrails
    const drawGuardrail = (y: number, isTop: boolean) => {
      ctx.save();
      // Metallic rail gradient
      const railGrad = ctx.createLinearGradient(0, y, 0, y + 8);
      railGrad.addColorStop(0, "#757e8a");
      railGrad.addColorStop(0.5, "#bdc3c7");
      railGrad.addColorStop(1, "#5d6874");
      ctx.fillStyle = railGrad;
      ctx.fillRect(0, y, CART_LOGICAL_WIDTH, 8);

      // Support posts periodically scrolling
      ctx.fillStyle = "#3a4149";
      const postSpacing = 160;
      const postOffset = scroll % postSpacing;
      for (let px = -postSpacing; px < CART_LOGICAL_WIDTH + postSpacing; px += postSpacing) {
        if (isTop) {
          ctx.fillRect(px - postOffset, y + 8, 4, 10);
        } else {
          ctx.fillRect(px - postOffset, y - 10, 4, 10);
        }
      }
      ctx.restore();
    };

    drawGuardrail(170, true);
    drawGuardrail(362, false);

    // 4. Road Surface (visible medium grey asphalt)
    const roadGrad = ctx.createLinearGradient(0, roadY, 0, roadY + roadH);
    roadGrad.addColorStop(0, "#6b7280");
    roadGrad.addColorStop(0.5, "#5a6271");
    roadGrad.addColorStop(1, "#6b7280");
    ctx.fillStyle = roadGrad;
    ctx.fillRect(roadX, roadY, roadW, roadH);

    // Draw solid white shoulder lines
    ctx.strokeStyle = "#d2d6d9";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, roadY);
    ctx.lineTo(CART_LOGICAL_WIDTH, roadY);
    ctx.moveTo(0, roadY + roadH);
    ctx.lineTo(CART_LOGICAL_WIDTH, roadY + roadH);
    ctx.stroke();

    // Lane Dividers (bright white dashes)
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.setLineDash([40, 60]);
    ctx.lineDashOffset = -scroll;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 1; i < lanes; i++) {
      const ly = roadY + laneH * i;
      ctx.moveTo(0, ly);
      ctx.lineTo(CART_LOGICAL_WIDTH, ly);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // 5. Drawing Helpers for realistic obstacles (No Neon)
    const drawCone = (cx: number, cy: number) => {
      ctx.save();
      ctx.translate(cx, cy);

      // Shadow
      ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
      ctx.beginPath();
      ctx.ellipse(0, 18, 24, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      // Black rubber base
      ctx.fillStyle = "#374151";
      ctx.beginPath();
      ctx.roundRect(-20, 12, 40, 6, 2);
      ctx.fill();

      // Cone Body (bright orange)
      ctx.fillStyle = "#f97316";
      ctx.beginPath();
      ctx.moveTo(-16, 12);
      ctx.lineTo(-4, -22);
      ctx.lineTo(4, -22);
      ctx.lineTo(16, 12);
      ctx.closePath();
      ctx.fill();

      // Shaded left edge (3D depth)
      ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
      ctx.beginPath();
      ctx.moveTo(-16, 12);
      ctx.lineTo(-4, -22);
      ctx.lineTo(0, -22);
      ctx.lineTo(0, 12);
      ctx.closePath();
      ctx.fill();

      // Reflective white stripe
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(-10, -1);
      ctx.lineTo(-7, -10);
      ctx.lineTo(7, -10);
      ctx.lineTo(10, -1);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    };

    const drawBarrier = (cx: number, cy: number) => {
      ctx.save();
      ctx.translate(cx, cy);

      // Shadow
      ctx.fillStyle = "rgba(0, 0, 0, 0.38)";
      ctx.beginPath();
      ctx.ellipse(0, 16, 26, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      // Support legs (iron A-frame)
      ctx.strokeStyle = "#374151";
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.moveTo(-18, 16);
      ctx.lineTo(-12, -8);
      ctx.lineTo(-6, 16);
      ctx.moveTo(6, 16);
      ctx.lineTo(12, -8);
      ctx.lineTo(18, 16);
      ctx.stroke();

      // Heavy Concrete Board
      ctx.fillStyle = "#9ca3af"; // Grey concrete
      ctx.beginPath();
      ctx.roundRect(-26, -6, 52, 13, 1);
      ctx.fill();

      // Diagonal hazard safety markings (yellow/black paint stripes)
      ctx.strokeStyle = "#1f2937"; // black stripes
      ctx.lineWidth = 5;
      ctx.save();
      ctx.beginPath();
      ctx.rect(-26, -6, 52, 13);
      ctx.clip();

      // Paint yellow background first
      ctx.fillStyle = "#f59e0b";
      ctx.fillRect(-26, -6, 52, 13);

      ctx.beginPath();
      for (let ox = -40; ox < 40; ox += 14) {
        ctx.moveTo(ox, -8);
        ctx.lineTo(ox + 8, 8);
      }
      ctx.stroke();
      ctx.restore();

      // Small amber warning reflectors on top
      ctx.fillStyle = "#d97706";
      ctx.beginPath();
      ctx.arc(-20, -10, 3, 0, Math.PI * 2);
      ctx.arc(20, -10, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    };

    const drawPothole = (cx: number, cy: number) => {
      ctx.save();
      ctx.translate(cx, cy);

      // Dark cavity (clearly visible on grey road)
      ctx.fillStyle = "#1f2937";
      ctx.beginPath();
      ctx.ellipse(0, 0, 42, 18, 0, 0, Math.PI * 2);
      ctx.fill();

      // Inner puddle reflecting sky blue
      ctx.fillStyle = "#0ea5e9";
      ctx.beginPath();
      ctx.ellipse(-2, 1, 32, 12, 0, 0, Math.PI * 2);
      ctx.fill();

      // Puddle sheen highlight
      const sheenGrad = ctx.createLinearGradient(-20, -6, 20, 6);
      sheenGrad.addColorStop(0, "rgba(255, 255, 255, 0.08)");
      sheenGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.3)");
      sheenGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = sheenGrad;
      ctx.beginPath();
      ctx.ellipse(-2, 0, 28, 10, 0.1, 0, Math.PI * 2);
      ctx.fill();

      // Jagged crack outline (bright contrast)
      ctx.strokeStyle = "#111827";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, 0, 42, 18, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Outer fracture lines
      ctx.strokeStyle = "#374151";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-42, 0);
      ctx.lineTo(-52, -4);
      ctx.moveTo(42, 0);
      ctx.lineTo(52, 5);
      ctx.moveTo(0, -18);
      ctx.lineTo(4, -26);
      ctx.moveTo(-10, 16);
      ctx.lineTo(-15, 22);
      ctx.stroke();

      ctx.restore();
    };

    const drawPlayerCar = (x: number, y: number, tilt: number, alpha = 1) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(tilt);
      ctx.globalAlpha = alpha;

      // Realistic Headlights casting soft light cone on asphalt
      if (alpha === 1) {
        ctx.save();
        const lightGrad = ctx.createLinearGradient(CAR_WIDTH / 2 - 10, 0, CAR_WIDTH / 2 + 200, 0);
        lightGrad.addColorStop(0, "rgba(255, 248, 220, 0.16)"); // Soft warm white
        lightGrad.addColorStop(1, "rgba(255, 248, 220, 0)");
        ctx.fillStyle = lightGrad;
        ctx.beginPath();
        ctx.moveTo(CAR_WIDTH / 2 - 10, -14);
        ctx.lineTo(CAR_WIDTH / 2 + 190, -40);
        ctx.lineTo(CAR_WIDTH / 2 + 190, 5);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(CAR_WIDTH / 2 - 10, 14);
        ctx.lineTo(CAR_WIDTH / 2 + 190, 40);
        ctx.lineTo(CAR_WIDTH / 2 + 190, -5);
        ctx.fill();
        ctx.restore();
      }

      // Cast body shadow underneath
      ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
      ctx.beginPath();
      ctx.ellipse(2, 4, CAR_WIDTH / 2 + 2, CAR_HEIGHT / 2 + 2, 0, 0, Math.PI * 2);
      ctx.fill();

      // Rubber tires with metal hubcaps
      ctx.fillStyle = "#1f2937"; // dark grey rubber
      [
        [-33, -26],
        [16, -26],
        [-33, 16],
        [16, 16]
      ].forEach((p) => {
        ctx.fillRect(p[0], p[1], 22, 10);
        // Hubcap
        ctx.fillStyle = "#9ca3af";
        ctx.fillRect(p[0] + 6, p[1] + 2, 10, 6);
        ctx.fillStyle = "#1f2937";
      });

      // Car Body (Metallic Chrome Crimson Sportscar)
      const bodyGrad = ctx.createLinearGradient(-CAR_WIDTH / 2, 0, CAR_WIDTH / 2, 0);
      bodyGrad.addColorStop(0, "#7f1d1d"); // deep red rear
      bodyGrad.addColorStop(0.5, "#b91c1c"); // bright crimson body
      bodyGrad.addColorStop(1, "#dc2626"); // chrome red nose
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.roundRect(-CAR_WIDTH / 2, -CAR_HEIGHT / 2, CAR_WIDTH, CAR_HEIGHT, 10);
      ctx.fill();

      // Carbon Fiber Spoiler / Rear Wing
      ctx.fillStyle = "#111827";
      ctx.fillRect(-CAR_WIDTH / 2 - 2, -CAR_HEIGHT / 2 - 2, 8, CAR_HEIGHT + 4);

      // Windshield & Cabin Glass (Realistic grey tinted window with reflections)
      ctx.fillStyle = "#111827";
      ctx.beginPath();
      ctx.roundRect(-8, -16, 36, 32, 5);
      ctx.fill();

      // White glare reflection stripe on glass
      ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(10, -14);
      ctx.lineTo(24, 14);
      ctx.stroke();

      // Exhaust tailpipes
      ctx.fillStyle = "#4b5563";
      ctx.fillRect(-CAR_WIDTH / 2 - 4, -12, 4, 3);
      ctx.fillRect(-CAR_WIDTH / 2 - 4, 9, 4, 3);

      // Tail lights
      ctx.fillStyle = "#dc2626";
      ctx.fillRect(-CAR_WIDTH / 2, -18, 3, 6);
      ctx.fillRect(-CAR_WIDTH / 2, 12, 3, 6);

      ctx.restore();
    };

    const drawEnemyCar = (cx: number, cy: number, color: string) => {
      ctx.save();
      ctx.translate(cx, cy);

      // Oncoming Headlight Beams (pointing left)
      ctx.save();
      const lightGrad = ctx.createLinearGradient(-CAR_WIDTH / 2, 0, -CAR_WIDTH / 2 - 140, 0);
      lightGrad.addColorStop(0, "rgba(255, 253, 240, 0.12)"); // soft white
      lightGrad.addColorStop(1, "rgba(255, 253, 240, 0)");
      ctx.fillStyle = lightGrad;
      ctx.beginPath();
      ctx.moveTo(-CAR_WIDTH / 2 + 5, -12);
      ctx.lineTo(-CAR_WIDTH / 2 - 130, -30);
      ctx.lineTo(-CAR_WIDTH / 2 - 130, 10);
      ctx.lineTo(-CAR_WIDTH / 2 + 5, 0);
      ctx.fill();
      ctx.restore();

      // Shadow
      ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
      ctx.beginPath();
      ctx.ellipse(0, 4, CAR_WIDTH / 2 + 2, CAR_HEIGHT / 2 + 2, 0, 0, Math.PI * 2);
      ctx.fill();

      // Wheels
      ctx.fillStyle = "#111827";
      [
        [-31, -26],
        [21, -26],
        [-31, 16],
        [21, 16]
      ].forEach((p) => {
        ctx.fillRect(p[0], p[1], 18, 9);
      });

      // Muted metallic passenger car body
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(-CAR_WIDTH / 2, -CAR_HEIGHT / 2, CAR_WIDTH, CAR_HEIGHT, 7);
      ctx.fill();

      // Glass panels
      ctx.fillStyle = "#1e293b";
      ctx.beginPath();
      ctx.roundRect(-15, -15, 32, 30, 4);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Yellow oncoming headlights
      ctx.fillStyle = "#fbbf24";
      ctx.fillRect(-CAR_WIDTH / 2, -14, 2, 5);
      ctx.fillRect(-CAR_WIDTH / 2, 9, 2, 5);

      // Red tail lights on rear
      ctx.fillStyle = "#b91c1c";
      ctx.fillRect(CAR_WIDTH / 2 - 2, -14, 2, 5);
      ctx.fillRect(CAR_WIDTH / 2 - 2, 9, 2, 5);

      ctx.restore();
    };

    const drawBTC = (cx: number, cy: number, rot: number) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(Math.cos(rot), 1);

      // Shadow
      ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
      ctx.beginPath();
      ctx.arc(0, 4, BTC_SIZE, 0, Math.PI * 2);
      ctx.fill();

      // Radial Gold Gradient
      const goldGrad = ctx.createRadialGradient(-3, -3, 2, 0, 0, BTC_SIZE);
      goldGrad.addColorStop(0, "#fbbf24"); // shiny gold
      goldGrad.addColorStop(0.7, "#d97706"); // darker amber gold
      goldGrad.addColorStop(1, "#92400e"); // bronze gold rim
      ctx.fillStyle = goldGrad;
      ctx.beginPath();
      ctx.arc(0, 0, BTC_SIZE, 0, Math.PI * 2);
      ctx.fill();

      // Embossed Gold Rim Bevel
      ctx.strokeStyle = "#fef08a";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(0, 0, BTC_SIZE - 2, 0, Math.PI * 2);
      ctx.stroke();

      // Embossed physical Bitcoin ₿ emblem
      ctx.fillStyle = "#fef08a";
      ctx.font = "bold 22px Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("₿", 0, 1);

      ctx.restore();
    };

    // 6. Visual updates and Spring physics
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
            progress: startProgress
          } as any);
        }
      }
      state.localEvents = newLocalEvents;
    }

    // Smoothly lerp visual progress of obstacles
    const elapsedSinceUpdate = (now - state.lastServerUpdateAt) / 1000;
    state.localEvents.forEach((e: any) => {
      const speed = Number(e.speed) || serverRoadSpeed;
      const target = (Number(e.serverProgress) || 0) + elapsedSinceUpdate * speed;
      const current = Number(e.progress) || 0;
      e.progress = current + (target - current) * (1 - Math.exp(-12 * deltaSeconds));
    });

    const btcRotation = now / 250;

    // Draw obstacles
    for (const event of state.localEvents) {
      const lane = clampCartLane(Number(event.lane) || 0, lanes);
      const progress = Math.max(0, Math.min(1.25, Number(event.progress) || 0));
      const y = roadY + laneH * lane + laneH / 2;
      const x = roadX + roadW - progress * (roadW + 180) + 60;

      switch (event.kind) {
        case "coin":
          drawBTC(x, y, btcRotation);
          break;
        case "cone":
          drawCone(x, y);
          break;
        case "barrier":
          drawBarrier(x, y);
          break;
        case "pothole":
          drawPothole(x, y);
          break;
        case "enemy-car":
        default:
          drawEnemyCar(x, y, event.variant?.body || "#4b5563");
          break;
      }
    }

    // Smooth lerp lane transition (no overshoot/bounce)
    const carLane = clampCartLane(Number(state.lane) || 0, lanes);
    if (state.physX === undefined) {
      state.physX = carLane;
      state.physVx = 0;
    }
    const prevPhysX = state.physX;
    const laneSpeed = 8;
    state.physX = prevPhysX + (carLane - prevPhysX) * Math.min(1, laneSpeed * deltaSeconds);
    state.physVx = (state.physX - prevPhysX) / Math.max(deltaSeconds, 0.001);
    state.renderLane = state.physX;

    const carX = roadX + 160;
    const carY = roadY + laneH * state.physX + laneH / 2;
    // steering body roll/tilt proportional to lateral velocity
    const tilt = state.physVx * 0.07;

    // Spawn dispersing smoke exhaust particles
    if (!isGameOver && Math.random() < 0.65) {
      const rx = carX - CAR_WIDTH / 2 + 2;
      const ry1 = carY - 12;
      const ry2 = carY + 9;

      // Exhaust smoke (transparent grey bubbles drifting backwards)
      particles.current.push({
        x: rx,
        y: ry1 + (Math.random() - 0.5) * 2,
        vx: -6 - Math.random() * 4,
        vy: (Math.random() - 0.5) * 1.0,
        life: 0.6 + Math.random() * 0.3,
        color: "rgba(209, 213, 219, 0.22)",
        size: Math.random() * 3 + 2
      });

      particles.current.push({
        x: rx,
        y: ry2 + (Math.random() - 0.5) * 2,
        vx: -6 - Math.random() * 4,
        vy: (Math.random() - 0.5) * 1.0,
        life: 0.6 + Math.random() * 0.3,
        color: "rgba(209, 213, 219, 0.22)",
        size: Math.random() * 3 + 2
      });
    }

    if (hit) {
      ctx.save();
      const shake = Math.sin(now * 0.04) * 8;
      ctx.translate(shake, -shake * 0.5);
    }

    drawPlayerCar(carX, carY, tilt, hit ? (now % 200 < 100 ? 0.45 : 1) : 1);

    if (hit) ctx.restore();

    ctx.restore();

    // 7. Brushed-Steel / Dark Metallic Dashboard HUD (No Neon)
    ctx.save();

    // Circular Speedometer gauge drawing helper
    const drawSpeedometer = (x: number, y: number, r: number, currentSpeed: number) => {
      ctx.save();
      ctx.translate(x, y);

      // Gauge face (dark metallic dial)
      const dialGrad = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
      dialGrad.addColorStop(0, "#1e293b");
      dialGrad.addColorStop(1, "#0f172a");
      ctx.fillStyle = dialGrad;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();

      // Beveled rim
      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 3;
      ctx.stroke();

      // Dial ticks (from -135deg to +135deg)
      ctx.strokeStyle = "#64748b";
      ctx.lineWidth = 1.5;
      for (let i = 0; i <= 10; i++) {
        const angle = -Math.PI * 1.25 + (Math.PI * 1.5 * i) / 10;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * (r - 6), Math.sin(angle) * (r - 6));
        ctx.lineTo(Math.cos(angle) * (r - 2), Math.sin(angle) * (r - 2));
        ctx.stroke();
      }

      // Pointer Needle (Solid orange)
      const maxKmh = 180;
      const kmh = currentSpeed * 175;
      const angle = -Math.PI * 1.25 + (Math.PI * 1.5 * Math.min(kmh, maxKmh)) / maxKmh;
      ctx.strokeStyle = "#ea580c";
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(angle) * (r - 9), Math.sin(angle) * (r - 9));
      ctx.stroke();

      // Center peg
      ctx.fillStyle = "#cbd5e1";
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();

      // Numeric speed text
      ctx.fillStyle = "#f8fafc";
      ctx.font = 'bold 15px "Outfit", "Inter", sans-serif';
      ctx.textAlign = "center";
      ctx.fillText(`${Math.floor(kmh)}`, 0, r * 0.5);
      ctx.fillStyle = "#64748b";
      ctx.font = '900 8px "Outfit", "Inter", sans-serif';
      ctx.fillText("KM/H", 0, r * 0.72);

      ctx.restore();
    };

    const drawHudBox = (
      x: number,
      y: number,
      w: number,
      h: number,
      label: string,
      value: string,
      valColor = "#ffffff"
    ) => {
      // Brushed carbon-metal backing
      const backGrad = ctx.createLinearGradient(x, y, x, y + h);
      backGrad.addColorStop(0, "#1e293b");
      backGrad.addColorStop(1, "#0f172a");
      ctx.fillStyle = backGrad;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 6);
      ctx.fill();

      // Steel border outline
      ctx.strokeStyle = "#334155";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Accent metal rivets
      ctx.fillStyle = "#475569";
      [
        [x + 5, y + 5],
        [x + w - 5, y + 5],
        [x + 5, y + h - 5],
        [x + w - 5, y + h - 5]
      ].forEach((rv) => {
        ctx.beginPath();
        ctx.arc(rv[0], rv[1], 1.5, 0, Math.PI * 2);
        ctx.fill();
      });

      // Label Text
      ctx.fillStyle = "#94a3b8";
      ctx.font = '900 9px "Outfit", "Inter", sans-serif';
      ctx.textAlign = "left";
      ctx.fillText(label, x + 14, y + 17);

      // Value Text
      ctx.fillStyle = valColor;
      ctx.font = '900 20px "Outfit", "Inter", sans-serif';
      ctx.fillText(value, x + 14, y + h - 13);
    };

    // Draw dashboard items
    drawHudBox(20, 20, 115, 54, "TEMPO", `${cartHudTimeRef.current}s`, "#cbd5e1");
    drawHudBox(148, 20, 115, 54, "PONTOS", `${Number(state.score) || 0}`, "#f59e0b");

    // Draw Speedometer in center-left dashboard
    drawSpeedometer(315, 47, 36, serverRoadSpeed);

    // Draw Health/Fuel cells instead of heart icons (realistic dash gauge)
    const renderFuelCell = (x: number, y: number, w: number, h: number, hp: number) => {
      ctx.save();
      // Backing
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "#334155";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);
      // Fills
      for (let i = 0; i < 3; i++) {
        if (i < hp) {
          ctx.fillStyle = hp === 1 ? "#ef4444" : "#10b981"; // Green cells, Red if critical
          ctx.fillRect(x + 3 + i * 11, y + 3, 8, h - 6);
        } else {
          ctx.fillStyle = "#334155";
          ctx.fillRect(x + 3 + i * 11, y + 3, 8, h - 6);
        }
      }
      ctx.restore();
    };

    // HUD Box for Fuel/Health
    const healthX = CART_LOGICAL_WIDTH - 275;
    drawHudBox(healthX, 20, 115, 54, "INTEGRIDADE", "", "#ffffff");
    renderFuelCell(healthX + 14, 38, 38, 24, Math.max(0, Number(state.health) || 0));

    drawHudBox(
      CART_LOGICAL_WIDTH - 145,
      20,
      125,
      54,
      "DISTÂNCIA",
      `${Math.floor(Number(state.distance) || 0)}m`,
      "#f8fafc"
    );

    // Progress bar container (Clean metallic groove)
    ctx.fillStyle = "#1e293b";
    ctx.beginPath();
    ctx.roundRect(CART_LOGICAL_WIDTH / 2 - 150, CART_LOGICAL_HEIGHT - 22, 300, 6, 2);
    ctx.fill();
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1.0;
    ctx.stroke();

    // Progress bar fill (Amber orange steel bar)
    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.roundRect(CART_LOGICAL_WIDTH / 2 - 150, CART_LOGICAL_HEIGHT - 22, 300 * missionProgress, 6, 2);
    ctx.fill();

    // Mission description text (Modern HUD look)
    ctx.fillStyle = "#f8fafc";
    ctx.textAlign = "center";
    ctx.font = '900 22px "Outfit", "Inter", sans-serif';
    ctx.fillText("MISSION: 750", CART_LOGICAL_WIDTH / 2, 50);
    ctx.font = '700 11px "Outfit", "Inter", sans-serif';
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(`1 BTC = 50 pontos  •  10 metros = 1 ponto  •  Meta ${state.targetScore}`, CART_LOGICAL_WIDTH / 2, 70);

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
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        gameLoopRef.current = requestAnimationFrame(render);
        return;
      }
      const cartState = cartStateRef.current;
      let deltaSeconds = 1 / 60;
      if (activeGame === "cart") {
        const lastFrameAt = Number(cartState.lastFrameAt) || frameTime;
        deltaSeconds = Math.max(0.001, Math.min(0.05, (frameTime - lastFrameAt) / 1000 || 1 / 60));
        cartState.lastFrameAt = frameTime;
      }

      ctx.clearRect(0, 0, logicalSize.width, logicalSize.height);

      if (activeGame === "cart") {
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
          Math.max(logicalSize.width, logicalSize.height) * 0.72
        );
        bgGrad.addColorStop(0, "#0d1526");
        bgGrad.addColorStop(1, "#020617");
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, logicalSize.width, logicalSize.height);

        ctx.strokeStyle = "rgba(30,58,138,0.18)";
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

        if (activeGame === "memory") drawMemory(ctx);
        if (activeGame === "match-3") drawMatch3(ctx);

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

      if (!isTouchDevice.current && activeGame !== "cart") {
        const mx = pointer.current.x;
        const my = pointer.current.y;
        ctx.strokeStyle = pointer.current.isDown ? "#ef4444" : "#3b82f6";
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
    [activeGame]
  );

  const moveCartToPointerLane = useCallback(
    (y: number) => {
      if (!socket) return;
      const current = cartStateRef.current;
      const lanes = Math.max(3, Number(current.lanes) || 3);
      const nextLane = getCartLaneFromPointer(y, lanes, CART_LOGICAL_WIDTH, CART_LOGICAL_HEIGHT);
      if (nextLane === current.lane) return;
      if (!socketEmitGuardRef.current.tryEmitLane()) return;
      lastLaneActionTimeRef.current = performance.now();
      cartStateRef.current = {
        ...current,
        lane: nextLane,
        renderLane: Number.isFinite(current.renderLane) ? current.renderLane : current.lane
      };
      socket.emit("game:action", { type: "lane", lane: nextLane });
    },
    [socket]
  );

  const moveCartByStep = useCallback(
    (step: number) => {
      if (!socket) return;
      const current = cartStateRef.current;
      const lanes = Math.max(3, Number(current.lanes) || 3);
      const nextLane = clampCartLane(current.lane + step, lanes);
      if (nextLane === current.lane) return;
      if (!socketEmitGuardRef.current.tryEmitLane()) return;
      lastLaneActionTimeRef.current = performance.now();
      cartStateRef.current = {
        ...current,
        lane: nextLane,
        renderLane: Number.isFinite(current.renderLane) ? current.renderLane : current.lane
      };
      socket.emit("game:action", { type: "lane", lane: nextLane });
    },
    [socket]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (e.type === "mousedown" && isTouchDevice.current) return;
      if (isGameOver || isProcessing) return;
      pointer.current.isDown = true;
      const { x, y } = syncMouse(e);
      if (!socket) return;

      if (activeGame === "memory") {
        const cardId = hitTestMemoryCardIndex(x, y, memoryLayout);
        if (cardId !== null) socket.emit("game:action", { type: "flip", cardId });
      } else if (activeGame === "match-3") {
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
                duration: 120
              };
              socket.emit("game:action", {
                type: "swap",
                from: { x: sel.cx, y: sel.cy },
                to: { x: cx, y: cy }
              });
              selectedCell.current = null;
              setIsProcessing(true);
            }
          } else {
            selectedCell.current = { cx, cy };
          }
        }
      } else if (activeGame === "cart") {
        if ("touches" in e && e.touches.length > 0) {
          cartTouchRef.current = { active: true, y };
          moveCartToPointerLane(y);
          return;
        }
        moveCartToPointerLane(y);
      }
    },
    [activeGame, isGameOver, isProcessing, socket, syncMouse, memoryLayout, match3Layout, moveCartToPointerLane]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      const { y } = syncMouse(e);
      if (activeGame === "cart" && pointer.current.isDown && !isGameOver && !isProcessing) {
        if ("touches" in e && e.touches.length > 0 && cartTouchRef.current.active) {
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
    [activeGame, isGameOver, isProcessing, syncMouse, moveCartToPointerLane, moveCartByStep]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      pointer.current.isDown = false;
      cartTouchRef.current.active = false;
      syncMouse(e);
    },
    [syncMouse]
  );

  const exitSession = useCallback(() => {
    clearTimeoutList(pendingTimeoutsRef);
    if (socket) socket.emit("game:end");
    setSessionReady(false);
    memoryBoardRef.current = null;
    navigate("/games");
  }, [socket, navigate]);


  const handleStackDrop = useCallback(() => {
    if (!socket || isGameOver) return;
    socket.emit("game:action", { type: "drop" });
  }, [socket, isGameOver]);

  /**
   * Flap telemetry — physics is fully client-side, so this is purely for the
   * server to update `lastFlapAt` (and reject suspicious flap-rate spam if it
   * ever wants to). The Arena applies the velocity change immediately.
   */
  const handleSkyFlap = useCallback(() => {
    if (!socket || isGameOver) return;
    socket.emit("game:action", { type: "flap" });
  }, [socket, isGameOver]);

  /**
   * Anti-cheat checkpoint: Arena reports its progress + elapsed time every
   * `checkpointEveryPipes`. Server validates timing vs minimum theoretical
   * pace and may kill the session if the client is faking pipes.
   */
  const handleSkyCheckpoint = useCallback(
    (info: { pipesPassed: number; elapsedMs: number; lives: number; score: number }) => {
      if (!socket) return;
      setHudScore(info.score);
      skyProgressRef.current = { pipesPassed: info.pipesPassed, target: skyState?.targetPipes ?? 15 };
      socket.emit("game:action", { type: "checkpoint", ...info });
    },
    [socket]
  );

  /**
   * End-of-run: Arena signals win or loss. Server validates the timing one
   * more time and runs `finishGame()` (which awards the reward or rejects).
   */
  const handleSkyFinish = useCallback(
    (info: { pipesPassed: number; elapsedMs: number; score: number; won: boolean }) => {
      if (!socket) return;
      setHudScore(info.score);
      skyProgressRef.current = { pipesPassed: info.pipesPassed, target: skyState?.targetPipes ?? 15 };
      socket.emit("game:action", { type: "finish", ...info });
    },
    [socket]
  );

  useEffect(() => {
    if (activeGame !== "cart" || isGameOver || !socket) return undefined;
    const onKey = (e: KeyboardEvent) => {
      const key = String(e.key || "").toLowerCase();
      const moveUp = e.key === "ArrowUp" || key === "w" || e.key === "ArrowLeft" || key === "a";
      const moveDown = e.key === "ArrowDown" || key === "s" || e.key === "ArrowRight" || key === "d";
      if (!moveUp && !moveDown) return;
      e.preventDefault();
      moveCartByStep(moveUp ? -1 : 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeGame, isGameOver, socket, moveCartByStep]);


  if (!activeGame) return null;

  return (
    <div className="fixed inset-0 flex flex-col bg-[#020617]" style={{ direction: "ltr" }}>
      {/* Loading overlay until game:started fires */}
      {!sessionReady && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-[#020617]">
          <div className="h-24 w-24 animate-spin rounded-full border-8 border-primary border-t-transparent" />
          <p className="animate-pulse text-center text-sm font-black uppercase tracking-[0.25em] text-white sm:tracking-[0.6em]">
            {t("minerGames.syncing")}
          </p>
        </div>
      )}
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-800 bg-black/70 px-2 py-2 sm:px-4">
            <div className="flex min-w-0 flex-col">
              <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">
                {t("minerGames.hash_score_label")}
              </span>
              <span className="max-w-[6rem] truncate text-lg font-black leading-none text-white sm:max-w-none sm:text-xl">
                {hudScore}
              </span>
            </div>
            <h1 className="min-w-0 flex-1 text-center text-xs font-black uppercase italic tracking-tight text-white sm:text-sm">
              {t("minerGames.brand_prefix")}
              <span className="text-primary">{t("minerGames.brand_suffix")}</span>
            </h1>
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <div className="flex flex-col items-end">
                <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">
                  {t("minerGames.time_sync_label")}
                </span>
                <div className="flex items-center gap-1 text-lg font-black leading-none text-primary sm:text-xl">
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  <span>{t("minerGames.time_value_seconds", { seconds: timeLeft })}</span>
                </div>
              </div>
              {!isGameOver && (
                <button
                  type="button"
                  onClick={exitSession}
                  aria-label={t("minerGames.exit_session_aria")}
                  className="rounded-lg border border-red-500/30 bg-red-500/20 p-2 text-red-400 transition-all hover:bg-red-500/40"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden />
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-1 items-center justify-center overflow-hidden p-2 sm:p-4">
            <div
              className="relative overflow-hidden rounded-2xl border-2 border-slate-700 bg-black shadow-[0_0_50px_rgba(0,0,0,0.5)]"
              style={getCanvasViewportStyle(activeGame)}
            >
              {/* Scanline overlay: skip for cart-rush (full-speed canvas + layered gradients = heavy compositing on mobile). */}
              {activeGame !== "cart" ? (
                <div className="pointer-events-none absolute inset-0 z-50 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.03),rgba(0,255,0,0.01),rgba(0,0,255,0.03))] bg-[length:100%_4px,3px_100%] opacity-20" />
              ) : null}

              {activeGame === "stack" ? (
                <BlockStackArena state={stackState} onDrop={handleStackDrop} isGameOver={isGameOver} t={t} />
              ) : activeGame === "sky" ? (
                <SkyRunnerArena
                  state={skyState}
                  onFlap={handleSkyFlap}
                  onCheckpoint={handleSkyCheckpoint}
                  onFinish={handleSkyFinish}
                  isGameOver={isGameOver}
                  t={t}
                />
              ) : (
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
                  style={{ cursor: isTouchDevice.current ? "default" : "none", touchAction: "none" }}
                />
              )}
            </div>
          </div>
    </div>
  );
}

