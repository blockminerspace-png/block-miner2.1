export type TournamentActionPayload = {
  actionId: string;
  userId: number;
  provider: string;
  actionCount: number;
  executedAtUTC: string;
  sourceId: string;
  tournamentEligible: boolean;
  metadata?: Record<string, unknown> | null;
};

export const TOURNAMENT_EVENT_ACTION_RECORDED = "tournament_action_recorded";

export function tournamentActionIdempotencyKey(
  provider: string,
  sourceId: string,
): string {
  return `tournament_action:${provider}:${sourceId}`;
}

export function tournamentActionOutboxPayload(row: {
  id: bigint | number;
  userId: number;
  provider: string;
  actionCount: number;
  executedAtUTC: Date;
  sourceId: string;
  tournamentEligible: boolean;
  metadata: unknown;
}): TournamentActionPayload {
  return {
    actionId: String(row.id),
    userId: row.userId,
    provider: row.provider,
    actionCount: row.actionCount,
    executedAtUTC: row.executedAtUTC.toISOString(),
    sourceId: row.sourceId,
    tournamentEligible: row.tournamentEligible,
    metadata:
      row.metadata != null && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : null,
  };
}
