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

describe("Game2048Page", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        ok: true,
        allowNewStart: true,
        cooldownSecondsRemaining: 0,
        activeSession: null,
        rewardHashRate: 25,
        winTile: 2048,
        minScore: 1000,
        powerDays: 7,
        cooldownMinutesHint: 3
      }
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
});
