import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api } from "../store/auth";
import Game2048Page from "./Game2048Page";

vi.mock("../store/auth", () => ({
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
    t: (key) => key
  })
}));

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
  minScore: 1000,
  timeLimitSeconds: 0,
  startedAt: new Date().toISOString(),
  canClaim: false,
};

describe("Game2048Page", () => {
  beforeEach(() => {
    let roundStarted = false;
    vi.mocked(api.get).mockImplementation(async () => ({
      data: {
        ok: true,
        allowNewStart: true,
        cooldownSecondsRemaining: 0,
        activeSession: roundStarted ? activeSessionPayload : null,
        rewardHashRate: 25,
        winTile: 2048,
        minScore: 1000,
        powerDays: 7,
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
});
