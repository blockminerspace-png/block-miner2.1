import type { MutableRefObject } from "react";
import type React from "react";
import type { TFunction } from "i18next";
import type { GameFlowResolution, GameFlowStat } from "../../../games/finish";
import type { ActiveGame } from "./gameSession.types";
import { CART_LOGICAL_HEIGHT, CART_LOGICAL_WIDTH, LOGICAL } from "./gameSession.constants";

export function scheduleUiUpdate(fn: () => void) {
  if (typeof queueMicrotask === "function") queueMicrotask(fn);
  else void Promise.resolve().then(fn);
}

export function clearTimeoutList(listRef: MutableRefObject<ReturnType<typeof setTimeout>[]>) {
  listRef.current.forEach((id) => clearTimeout(id));
  listRef.current = [];
}

export function clampCartLane(value: number, lanes: number) {
  return Math.max(0, Math.min(lanes - 1, value));
}

export function getCanvasLogicalSize(activeGame: ActiveGame) {
  return activeGame === "cart"
    ? { width: CART_LOGICAL_WIDTH, height: CART_LOGICAL_HEIGHT }
    : { width: LOGICAL, height: LOGICAL };
}

export function getCanvasViewportStyle(activeGame: ActiveGame): React.CSSProperties {
  if (activeGame === "cart") {
    return {
      width: "min(96vw, 1600px)",
      aspectRatio: `${CART_LOGICAL_WIDTH} / ${CART_LOGICAL_HEIGHT}`,
      maxWidth: "1600px",
      maxHeight: "calc(100dvh - 220px)"
    };
  }
  if (activeGame === "stack") {
    return {
      width: "min(calc(100vw - 16px), 540px)",
      aspectRatio: "3 / 4",
      maxWidth: "540px",
      maxHeight: "calc(100dvh - 52px)"
    };
  }
  if (activeGame === "sky") {
    return {
      width: "min(calc(100vw - 16px), 540px)",
      aspectRatio: "3 / 4",
      maxWidth: "540px",
      maxHeight: "calc(100dvh - 52px)"
    };
  }

  return {
    width: "min(calc(100vw - 16px), calc(100dvh - 52px), 500px)",
    aspectRatio: "1 / 1",
    maxWidth: "500px",
    maxHeight: "calc(100dvh - 52px)"
  };
}

export function getCartTrackLayout(lanes: number, logicalWidth = CART_LOGICAL_WIDTH, logicalHeight = CART_LOGICAL_HEIGHT) {
  const roadX = 0;
  const roadY = 50;
  const roadW = logicalWidth;
  const roadH = logicalHeight - 100;
  const laneH = roadH / lanes;
  return { roadX, roadY, roadW, roadH, laneH };
}

export function getCartLaneFromPointer(
  y: number,
  lanes: number,
  logicalWidth = CART_LOGICAL_WIDTH,
  logicalHeight = CART_LOGICAL_HEIGHT
) {
  const { roadY, roadH, laneH } = getCartTrackLayout(lanes, logicalWidth, logicalHeight);
  const boundedY = Math.max(roadY, Math.min(roadY + roadH - 1, y));
  return clampCartLane(Math.floor((boundedY - roadY) / laneH), lanes);
}

export function pointerClientXY(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>): {
  clientX: number;
  clientY: number;
} {
  if ("touches" in e && e.touches.length > 0) {
    return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
  }
  const m = e as React.MouseEvent<HTMLCanvasElement>;
  return { clientX: m.clientX, clientY: m.clientY };
}

export function formatMs(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m.toString().padStart(2, "0")}:${rem.toString().padStart(2, "0")}`;
}

/**
 * Assemble per-game stat rows for the end-of-match overlay. Pure function —
 * takes a snapshot of gameplay refs and turns them into localised label/value
 * pairs. Any missing datum is silently omitted.
 */
export function buildGameStats(
  game: ActiveGame,
  snap: {
    score: number;
    durationMs: number;
    cart: CartStateRef | null;
    stack: { blocksPlaced: number; target: number } | null;
    sky: { pipesPassed: number; target: number } | null;
    memory: { pairs: number; totalPairs: number; attempts: number } | null;
    match3: { swaps: number; cascades: number } | null;
  },
  t: TFunction,
): GameFlowStat[] {
  const rows: GameFlowStat[] = [];
  const durationLabel = formatMs(snap.durationMs);
  const push = (label: string, value: string | number) => rows.push({ label, value: String(value) });

  push(t("gameResult.stats.score"), snap.score);
  push(t("gameResult.stats.duration"), durationLabel);

  if (game === "cart" && snap.cart) {
    push(t("gameResult.stats.btc"), snap.cart.btcCount || 0);
    push(t("gameResult.stats.distance"), `${Math.floor(snap.cart.distance || 0)}m`);
  } else if (game === "stack" && snap.stack) {
    push(t("gameResult.stats.blocks"), `${snap.stack.blocksPlaced} / ${snap.stack.target}`);
  } else if (game === "sky" && snap.sky) {
    push(t("gameResult.stats.pipes"), `${snap.sky.pipesPassed} / ${snap.sky.target}`);
    push(t("gameResult.stats.flight_time"), durationLabel);
  } else if (game === "memory" && snap.memory) {
    push(t("gameResult.stats.pairs"), `${snap.memory.pairs} / ${snap.memory.totalPairs}`);
    if (snap.memory.attempts > 0) {
      const acc = Math.round((snap.memory.pairs / snap.memory.attempts) * 100);
      push(t("gameResult.stats.accuracy"), `${acc}%`);
    }
  } else if (game === "match-3" && snap.match3) {
    push(t("gameResult.stats.combos"), snap.match3.swaps);
    push(t("gameResult.stats.cascades"), snap.match3.cascades);
  }

  return rows;
}

