/**
 * GameVerifyPage — RollerCoin-style post-match page at /games/verify.
 *
 * Rendered inside the normal app layout (sidebar + navbar). Game pages save a
 * hand-off record (gameVerifyStorage) and navigate here when a match ends.
 *
 * Flow: SUBMITTING animation (+ server claim when pending) → RESULT hero.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { AnimatePresence } from "framer-motion";
import { api } from "../../../store/auth";
import { setGameCooldown } from "../../../games/gameCooldownStore";
import type { GameFlowResolution } from "../../../games/finish/types";
import {
  clearGameVerifyRecord,
  loadGameVerifyRecord,
  updateGameVerifyRecord,
  type GameVerifyClaim,
  type GameVerifyRecord,
} from "../../../games/finish/gameVerifyStorage";
import { ResultScene, SubmittingScene } from "./GameVerifyScenes";

/** Minimum time the submitting animation stays on screen, even if the server is fast. */
const VALIDATION_MS = 10000;

const FALLBACK_FAILURE: GameFlowResolution = {
  outcome: "failure",
  rewardMessage: null,
  cooldownSeconds: 0,
  reasonKey: null,
  reasonMessage: null,
};

interface Game2048ClaimResponse {
  ok?: boolean;
  code?: string;
  idempotent?: boolean;
  rewardPowerHours?: number | null;
  rewardHashRate?: number | string;
  rewardPowerDays?: number | null;
  powerDays?: number | null;
  cooldownSecondsRemaining?: number;
}

async function runClaim(claim: GameVerifyClaim, t: TFunction): Promise<GameFlowResolution> {
  if (claim.kind !== "game2048") return FALLBACK_FAILURE;
  try {
    const { data } = await api.post<Game2048ClaimResponse>("/games/2048/claim", {
      sessionId: claim.sessionId,
    });
    if (!data?.ok) {
      return {
        outcome: "failure",
        rewardMessage: null,
        cooldownSeconds: Math.max(0, Number(data?.cooldownSecondsRemaining) || 0),
        reasonKey: data?.code ?? null,
        reasonMessage: null,
      };
    }
    const rewardText =
      data.rewardPowerHours != null && Number(data.rewardPowerHours) > 0
        ? t("game2048.claimed_toast_hours", { hr: data.rewardHashRate, hours: data.rewardPowerHours })
        : t("game2048.claimed_toast", { hr: data.rewardHashRate, days: data.rewardPowerDays ?? data.powerDays });
    return {
      outcome: "success",
      rewardMessage: rewardText,
      cooldownSeconds: Math.max(0, Number(data.cooldownSecondsRemaining) || 0),
    };
  } catch {
    return FALLBACK_FAILURE;
  }
}

function secondsLeft(until: number | null | undefined): number {
  if (!until) return 0;
  return Math.max(0, Math.ceil((until - Date.now()) / 1000));
}

export default function GameVerifyPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [record, setRecord] = useState<GameVerifyRecord | null>(() => loadGameVerifyRecord());
  const alreadyValidated = Boolean(record?.validatedAt && record?.resolution);
  const [phase, setPhase] = useState<"validating" | "result">(alreadyValidated ? "result" : "validating");
  const [progress, setProgress] = useState(alreadyValidated ? 1 : 0);
  const [cooldownSec, setCooldownSec] = useState(() => secondsLeft(record?.cooldownUntil));
  const claimPromiseRef = useRef<Promise<GameFlowResolution> | null>(null);

  useEffect(() => {
    if (!record) navigate("/games", { replace: true });
  }, [record, navigate]);

  useEffect(() => {
    if (record?.gameKey && record.cooldownUntil) {
      setGameCooldown(record.gameKey, secondsLeft(record.cooldownUntil));
    }
  }, [record?.gameKey, record?.cooldownUntil]);

  useEffect(() => {
    if (!record || phase !== "validating") return undefined;
    let cancelled = false;
    const startedAt = Date.now();

    const timer = window.setInterval(() => {
      if (!cancelled) setProgress(Math.min(1, (Date.now() - startedAt) / VALIDATION_MS));
    }, 80);

    const resolve = async (): Promise<GameFlowResolution> => {
      if (record.resolution) return record.resolution;
      if (record.claim) {
        if (!claimPromiseRef.current) claimPromiseRef.current = runClaim(record.claim, t);
        return claimPromiseRef.current;
      }
      return FALLBACK_FAILURE;
    };

    void resolve()
      .catch(() => FALLBACK_FAILURE)
      .then((resolution) => {
        const remaining = Math.max(0, VALIDATION_MS - (Date.now() - startedAt));
        window.setTimeout(() => {
          if (cancelled) return;
          window.clearInterval(timer);
          setProgress(1);
          const cooldownUntil =
            resolution.cooldownSeconds > 0
              ? Date.now() + resolution.cooldownSeconds * 1000
              : record.cooldownUntil;
          const patched =
            updateGameVerifyRecord({ resolution, validatedAt: Date.now(), cooldownUntil }) ?? {
              ...record,
              resolution,
              validatedAt: Date.now(),
              cooldownUntil,
            };
          setRecord(patched);
          setCooldownSec(secondsLeft(cooldownUntil));
          setPhase("result");
        }, remaining);
      });

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [record, phase, t]);

  useEffect(() => {
    if (phase !== "result") return undefined;
    const until = record?.cooldownUntil;
    if (!until || secondsLeft(until) <= 0) return undefined;
    const id = window.setInterval(() => {
      const left = secondsLeft(until);
      setCooldownSec(left);
      if (left <= 0) window.clearInterval(id);
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase, record?.cooldownUntil]);

  const onPlayAgain = useCallback(() => {
    if (!record) return;
    clearGameVerifyRecord();
    navigate(record.playAgainPath);
  }, [record, navigate]);

  const onExit = useCallback(() => {
    clearGameVerifyRecord();
    navigate("/games");
  }, [navigate]);

  const gameLabel = record?.gameLabelKey ? t(record.gameLabelKey) : "";

  if (!record) return null;

  return (
    <div className="relative mx-auto w-full max-w-4xl py-4 sm:py-8" style={{ direction: "ltr" }}>
      <div className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-primary/10 blur-[100px]" aria-hidden />
      <div className="pointer-events-none absolute -right-16 bottom-0 h-64 w-64 rounded-full bg-accent/10 blur-[90px]" aria-hidden />
      <AnimatePresence mode="wait">
        {phase === "validating" ? (
          <SubmittingScene
            key="submitting"
            progress={progress}
            gameLabel={gameLabel}
            gameKey={record.gameKey}
            t={t}
          />
        ) : (
          <ResultScene
            key="result"
            record={record}
            gameLabel={gameLabel}
            cooldownSeconds={cooldownSec}
            onPlayAgain={onPlayAgain}
            onExit={onExit}
            t={t}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
