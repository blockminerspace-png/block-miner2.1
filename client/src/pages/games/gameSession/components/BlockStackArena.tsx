import React, { memo, useEffect, useRef, useState } from "react";
import type { TFunction } from "i18next";

export const BlockStackArena = memo(function BlockStackArena({
  state,
  onDrop,
  isGameOver,
  t,
}: {
  state:
    | {
        target: number;
        playWidth: number;
        blocksPlaced: number;
        block: { width: number; travelMs: number; startedAt: number };
        base: { leftPx: number; width: number };
        tower: Array<{ leftPx: number; width: number }>;
      }
    | null;
  onDrop: () => void;
  isGameOver: boolean;
  t: TFunction;
}) {
  const [blockLeftPx, setBlockLeftPx] = useState(0);
  const rafRef = useRef<number | null>(null);

  // Drive the block animation locally from the server's startedAt + travelMs.
  useEffect(() => {
    if (!state || isGameOver) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      return;
    }
    const tick = () => {
      const now = Date.now();
      const elapsed = Math.max(0, now - state.block.startedAt);
      const travel = Math.max(1, state.block.travelMs);
      const cyclePos = (elapsed % (travel * 2)) / travel;
      const phase = cyclePos <= 1 ? cyclePos : 2 - cyclePos;
      const maxLeft = state.playWidth - state.block.width;
      setBlockLeftPx(phase * maxLeft);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [state, isGameOver]);

  if (!state) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs font-bold uppercase tracking-widest text-slate-500">
        {t("minerGames.loading")}
      </div>
    );
  }

  // Tower height: each block stacked grows upward from the bottom.
  const BLOCK_H = 22;
  const towerHeight = state.tower.length * BLOCK_H;
  const trackHeight = 360; // visual play height for the moving block area

  return (
    <div className="relative flex h-full w-full flex-col bg-gradient-to-b from-slate-900 to-black">
      {/* Progress bar */}
      <div className="px-3 pt-3">
        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
          <span>{t("minerGames.block_stack.progress", { current: state.blocksPlaced, total: state.target })}</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-200"
            style={{ width: `${(state.blocksPlaced / state.target) * 100}%` }}
          />
        </div>
      </div>

      {/* Play area — relative coords scaled to state.playWidth */}
      <div
        className="relative mx-auto mt-4 mb-2 overflow-hidden rounded-xl border border-slate-700/60 bg-slate-950/80"
        style={{ width: state.playWidth, maxWidth: "100%", height: trackHeight }}
      >
        {/* Moving block */}
        <div
          className="absolute h-[22px] rounded-md bg-gradient-to-r from-amber-300 to-orange-500 shadow-lg"
          style={{
            top: 8,
            left: blockLeftPx,
            width: state.block.width,
            transform: "translateZ(0)", // GPU-accel; smooth motion
          }}
        />
        {/* Stacked tower (built bottom-up) */}
        {state.tower.map((b, idx) => (
          <div
            key={idx}
            className="absolute h-[22px] rounded-sm bg-gradient-to-r from-emerald-400 to-cyan-500 shadow"
            style={{
              left: b.leftPx,
              width: b.width,
              bottom: idx * BLOCK_H,
            }}
          />
        ))}
        {/* Aim guide on the next-base position */}
        <div
          className="absolute border-x-2 border-dashed border-emerald-400/30"
          style={{
            left: state.base.leftPx,
            width: state.base.width,
            top: 8,
            bottom: towerHeight,
          }}
        />
      </div>

      {/* Drop button */}
      <button
        type="button"
        onClick={onDrop}
        disabled={isGameOver}
        className="mx-auto mb-4 mt-auto rounded-2xl bg-primary px-8 py-4 text-sm font-black uppercase tracking-widest text-white shadow-xl active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {t("minerGames.block_stack.drop_button")}
      </button>
    </div>
  );
});

