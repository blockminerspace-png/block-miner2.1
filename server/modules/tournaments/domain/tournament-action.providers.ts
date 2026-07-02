/** Normalized action providers — integrations map callbacks to these values only. */
export const TOURNAMENT_ACTION_PROVIDER = {
  INTERNAL: "internal",
  OFFERWALLME: "offerwallme",
  ZERADS: "zerads",
} as const;

export type TournamentActionProvider =
  (typeof TOURNAMENT_ACTION_PROVIDER)[keyof typeof TOURNAMENT_ACTION_PROVIDER];

export const OFFERS_INCREMENTAL_METRICS = [
  "OFFERS_INTERNAL",
  "OFFERS_EXTERNAL",
  "OFFERS_ALL",
] as const;

const PROVIDERS_BY_METRIC: Record<string, readonly TournamentActionProvider[]> = {
  OFFERS_INTERNAL: [TOURNAMENT_ACTION_PROVIDER.INTERNAL],
  OFFERS_EXTERNAL: [
    TOURNAMENT_ACTION_PROVIDER.OFFERWALLME,
    TOURNAMENT_ACTION_PROVIDER.ZERADS,
  ],
  OFFERS_ALL: [
    TOURNAMENT_ACTION_PROVIDER.INTERNAL,
    TOURNAMENT_ACTION_PROVIDER.OFFERWALLME,
    TOURNAMENT_ACTION_PROVIDER.ZERADS,
  ],
};

export function providersForOfferwallMetric(metric: string): readonly TournamentActionProvider[] {
  return PROVIDERS_BY_METRIC[metric] ?? [];
}

export function providerAllowedForMetric(
  provider: string,
  metric: string,
): boolean {
  const allowed = PROVIDERS_BY_METRIC[metric];
  if (!allowed) return false;
  return allowed.includes(provider as TournamentActionProvider);
}

export function contributionSourceId(
  provider: string,
  sourceId: string,
): string {
  return `${provider}:${sourceId}`;
}
