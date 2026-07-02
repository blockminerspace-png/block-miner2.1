import test from "node:test";
import assert from "node:assert/strict";
import {
  providerAllowedForMetric,
  TOURNAMENT_ACTION_PROVIDER,
  contributionSourceId,
} from "../dist/server/modules/tournaments/domain/tournament-action.providers.js";
import { OffersMetricScorer } from "../dist/server/modules/tournaments/domain/metrics/offerwall.scorer.js";

test("providerAllowedForMetric maps metrics to providers", () => {
  assert.equal(providerAllowedForMetric(TOURNAMENT_ACTION_PROVIDER.INTERNAL, "OFFERS_INTERNAL"), true);
  assert.equal(providerAllowedForMetric(TOURNAMENT_ACTION_PROVIDER.ZERADS, "OFFERS_INTERNAL"), false);
  assert.equal(providerAllowedForMetric(TOURNAMENT_ACTION_PROVIDER.OFFERWALLME, "OFFERS_EXTERNAL"), true);
  assert.equal(providerAllowedForMetric(TOURNAMENT_ACTION_PROVIDER.INTERNAL, "OFFERS_ALL"), true);
});

test("OffersMetricScorer projects actionCount inside UTC window", () => {
  const scorer = new OffersMetricScorer("OFFERS_ALL");
  const tournament = {
    id: 1,
    name: "Test",
    metric: "OFFERS_ALL",
    startsAt: new Date("2026-06-29T00:00:00.000Z"),
    endsAt: new Date("2026-07-06T00:00:00.000Z"),
    status: "ACTIVE",
  };

  const delta = scorer.onTournamentAction(
    {
      actionId: "1",
      userId: 42,
      provider: TOURNAMENT_ACTION_PROVIDER.ZERADS,
      actionCount: 4,
      executedAtUTC: "2026-07-01T12:00:00.000Z",
      sourceId: "abc",
      tournamentEligible: true,
    },
    tournament,
  );

  assert.ok(delta);
  assert.equal(delta.userId, 42);
  assert.equal(delta.metricValue, 4);
  assert.equal(delta.sourceId, contributionSourceId(TOURNAMENT_ACTION_PROVIDER.ZERADS, "abc"));
});

test("OffersMetricScorer rejects actions outside window", () => {
  const scorer = new OffersMetricScorer("OFFERS_EXTERNAL");
  const tournament = {
    id: 2,
    name: "Test",
    metric: "OFFERS_EXTERNAL",
    startsAt: new Date("2026-06-29T00:00:00.000Z"),
    endsAt: new Date("2026-07-06T00:00:00.000Z"),
    status: "ACTIVE",
  };

  const delta = scorer.onTournamentAction(
    {
      actionId: "2",
      userId: 7,
      provider: TOURNAMENT_ACTION_PROVIDER.OFFERWALLME,
      actionCount: 1,
      executedAtUTC: "2026-07-07T00:00:01.000Z",
      sourceId: "tx-1",
      tournamentEligible: true,
    },
    tournament,
  );

  assert.equal(delta, null);
});
