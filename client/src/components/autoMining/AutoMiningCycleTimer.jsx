import { useEffect, useRef, useState } from "react";

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Countdown to server-provided nextClaimAt. Updates are skipped while the tab is hidden
 * so background throttling does not desync the UI; on focus the remaining time snaps to server truth.
 *
 * @param {{ nextClaimAtIso: string | null, cycleSeconds: number, isRunning: boolean, labelReady: string, labelNext: string }} props
 */
export default function AutoMiningCycleTimer({
  nextClaimAtIso,
  cycleSeconds,
  isRunning,
  labelReady,
  labelNext
}) {
  const [remain, setRemain] = useState(cycleSeconds);
  const targetMsRef = useRef(null);

  useEffect(() => {
    if (!nextClaimAtIso || !isRunning) {
      setRemain(cycleSeconds);
      targetMsRef.current = null;
      return;
    }

    targetMsRef.current = new Date(nextClaimAtIso).getTime();

    const tick = () => {
      if (document.hidden) return;
      if (targetMsRef.current == null) return;
      const r = Math.max(0, Math.ceil((targetMsRef.current - Date.now()) / 1000));
      setRemain(r);
    };

    tick();
    const id = setInterval(tick, 500);

    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [nextClaimAtIso, isRunning, cycleSeconds]);

  const ready = remain <= 0;
  const total = cycleSeconds;
  const dash = 440;
  const offset = ready ? 0 : dash - (dash * remain) / total;

  return (
    <div className="relative w-40 h-40 flex items-center justify-center mx-auto md:mx-0">
      <svg className="w-full h-full -rotate-90" aria-hidden>
        <circle cx="80" cy="80" r="70" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-gray-800" />
        <circle
          cx="80"
          cy="80"
          r="70"
          stroke="currentColor"
          strokeWidth="8"
          fill="transparent"
          className="text-primary transition-all duration-500 ease-linear"
          strokeDasharray={dash}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-2">
        <span className="text-3xl font-black text-white italic tabular-nums">{formatTime(remain)}</span>
        <span className="text-[8px] font-bold text-gray-500 uppercase tracking-widest mt-1 text-center leading-tight">
          {ready ? labelReady : labelNext}
        </span>
      </div>
    </div>
  );
}
