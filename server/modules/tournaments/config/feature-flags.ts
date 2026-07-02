export function isTournamentEngineV2Enabled(): boolean {
  const v = String(process.env.TOURNAMENT_ENGINE_V2 || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function isTournamentSkipGetRecomputeEnabled(): boolean {
  if (isTournamentEngineV2Enabled()) return true;
  const v = String(process.env.TOURNAMENT_SKIP_GET_RECOMPUTE || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function isTournamentIncrementalScoringEnabled(): boolean {
  return isTournamentEngineV2Enabled();
}
