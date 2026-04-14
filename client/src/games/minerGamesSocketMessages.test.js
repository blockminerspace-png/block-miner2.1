import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  translateGameSocketError,
  translateGameFinishedFailure,
  translateGameReward,
} from "./minerGamesSocketMessages.js";

const t = vi.fn((key, opts) => (opts != null ? `${key}|${JSON.stringify(opts)}` : key));

describe("minerGamesSocketMessages", () => {
  beforeEach(() => {
    t.mockClear();
  });

  it("translateGameSocketError passes through legacy strings", () => {
    expect(translateGameSocketError(t, "raw")).toBe("raw");
    expect(t).not.toHaveBeenCalled();
  });

  it("translateGameSocketError uses i18n key for coded cooldown", () => {
    expect(translateGameSocketError(t, { code: "cooldown", seconds: 42 })).toBe(
      'minerGames.socket_errors.cooldown|{"seconds":42}',
    );
  });

  it("translateGameFinishedFailure prefers messageCode", () => {
    expect(
      translateGameFinishedFailure(t, { messageCode: "session_ended", message: "legacy" }),
    ).toBe("minerGames.game_finish.session_ended");
  });

  it("translateGameFinishedFailure falls back to message", () => {
    expect(translateGameFinishedFailure(t, { message: "legacy only" })).toBe("legacy only");
  });

  it("translateGameReward uses rewardCode and rewardParams", () => {
    expect(
      translateGameReward(t, { rewardCode: "full_term", rewardParams: { days: 7 } }),
    ).toBe('minerGames.game_reward.full_term|{"days":7}');
  });

  it("translateGameReward falls back to reward string", () => {
    expect(translateGameReward(t, { reward: "legacy reward" })).toBe("legacy reward");
  });
});
