import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api } from "../../../store/auth";
import Game2048Page from "./Game2048Page";

vi.mock("../../../store/auth", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn()
  }
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn()
  }
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const mod = (await importOriginal()) as typeof import("react-router-dom");
  return {
    ...mod,
    useNavigate: () => mockNavigate,
  };
});

const activeSessionPayload = {
  id: 1,
  status: "ACTIVE",
  gameOver: false,
  hasMoves: true,
  board: [
    [2, 0, 0, 0],
    [0, 2, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  score: 0,
  winTile: 2048,
  minScore: 500,
  timeLimitSeconds: 0,
  startedAt: new Date().toISOString(),
  canClaim: false,
  rewardPowerDays: 7,
  rewardPowerHours: null,
  powerDaysFull: 7,
};

describe("Game2048Page", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    let roundStarted = false;
    vi.mocked(api.get).mockImplementation(async () => ({
      data: {
        ok: true,
        allowNewStart: true,
        cooldownSecondsRemaining: 0,
        activeSession: roundStarted ? activeSessionPayload : null,
        rewardHashRate: 25,
        winTile: 2048,
        minScore: 500,
        powerDays: 7,
        powerDaysFull: 7,
        rewardPowerDays: 7,
        rewardPowerHours: null,
        cooldownMinutesHint: 3,
      },
    }));
    vi.mocked(api.post).mockImplementation(async (path) => {
      if (path === "/games/2048/start") {
        roundStarted = true;
        return { data: { ok: true, session: activeSessionPayload } };
      }
      return { data: { ok: false } };
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it("loads status from games 2048 API", async () => {
    render(
      <MemoryRouter>
        <Game2048Page />
      </MemoryRouter>
    );
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/games/2048/status"));
    expect(screen.getByText("game2048.title")).toBeInTheDocument();
  });

  it("auto-starts a round when status has no active session", async () => {
    render(
      <MemoryRouter>
        <Game2048Page />
      </MemoryRouter>
    );
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/games/2048/start"));
    await waitFor(() => expect(screen.getByRole("grid", { name: "game2048.grid_aria" })).toBeInTheDocument());
    expect(screen.queryByText("game2048.new_game")).not.toBeInTheDocument();
  });

  it("hands off an ended claimable session to /games/verify without claiming in-page", async () => {
    const claimableSession = {
      id: 42,
      status: "ENDED",
      gameOver: true,
      hasMoves: true,
      won: true,
      board: [
        [2, 2, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
      score: 500,
      winTile: 2048,
      minScore: 500,
      timeLimitSeconds: 0,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      canClaim: true,
      rewardPowerDays: 7,
      rewardPowerHours: null,
      powerDaysFull: 7,
    };

    vi.mocked(api.get).mockResolvedValue({
      data: {
        ok: true,
        allowNewStart: false,
        cooldownSecondsRemaining: 0,
        activeSession: claimableSession,
        rewardHashRate: 25,
        winTile: 2048,
        minScore: 500,
        powerDays: 7,
        powerDaysFull: 7,
        rewardPowerDays: 7,
        rewardPowerHours: null,
        cooldownMinutesHint: 3,
      },
    });

    vi.mocked(api.post).mockImplementation(async () => ({ data: { ok: false } }));

    render(
      <MemoryRouter>
        <Game2048Page />
      </MemoryRouter>
    );

    // The page hands off to the full-page verify route (RollerCoin-style).
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith("/games/verify", { replace: true })
    );
    // The claim must NOT run in-page — it runs once on the verify page
    // (idempotent server-side), so reloads can never double-claim.
    expect(api.post).not.toHaveBeenCalledWith("/games/2048/claim", expect.anything());

    // The hand-off record carries the pending claim for the verify page.
    const raw = sessionStorage.getItem("bm.gameVerify.v1");
    expect(raw).toBeTruthy();
    const record = JSON.parse(raw as string);
    expect(record.claim).toEqual({ kind: "game2048", sessionId: 42 });
    expect(record.playAgainPath).toBe("/games/2048");
    expect(record.resolution).toBeNull();
  });
});
