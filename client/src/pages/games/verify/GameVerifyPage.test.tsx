import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api } from "../../../store/auth";
import GameVerifyPage from "./GameVerifyPage";

const mockNavigate = vi.fn();

vi.mock("../../../store/auth", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: unknown) => (opts != null ? `${key}:${JSON.stringify(opts)}` : key),
  }),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const mod = (await importOriginal()) as typeof import("react-router-dom");
  return {
    ...mod,
    useNavigate: () => mockNavigate,
  };
});

const STORAGE_KEY = "bm.gameVerify.v1";

function seedRecord(overrides: Record<string, unknown> = {}) {
  sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      createdAt: Date.now(),
      gameKey: "2048",
      gameLabelKey: "game2048.title",
      playAgainPath: "/games/2048",
      stats: [{ label: "Score", value: "1540" }],
      claim: null,
      resolution: null,
      cooldownUntil: null,
      validatedAt: null,
      ...overrides,
    })
  );
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/games/verify"]}>
      <GameVerifyPage />
    </MemoryRouter>
  );
}

describe("GameVerifyPage", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it("redirects to /games when there is no hand-off record", async () => {
    renderPage();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(mockNavigate).toHaveBeenCalledWith("/games", { replace: true });
  });

  it("runs the pending 2048 claim exactly once during validation, then shows the result", async () => {
    seedRecord({ claim: { kind: "game2048", sessionId: 42 } });
    vi.mocked(api.post).mockResolvedValue({
      data: {
        ok: true,
        idempotent: false,
        rewardHashRate: 25,
        rewardPowerDays: 7,
        rewardPowerHours: null,
        powerDays: 7,
        cooldownSecondsRemaining: 60,
      },
    });

    renderPage();
    expect(screen.getByText("gameFlow.submitting_label")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10500);
    });

    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith("/games/2048/claim", { sessionId: 42 });

    // Let the card exit/enter animation settle, then assert the result.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(screen.getByText("gameFlow.success_title")).toBeInTheDocument();

    // The resolved outcome is persisted so a reload never re-claims.
    const record = JSON.parse(sessionStorage.getItem(STORAGE_KEY) as string);
    expect(record.resolution.outcome).toBe("success");
    expect(record.validatedAt).toBeTruthy();
  }, 15000);

  it("skips validation and claiming on reload when the record is already resolved", async () => {
    seedRecord({
      claim: { kind: "game2048", sessionId: 42 },
      resolution: { outcome: "success", rewardMessage: "+25 H/s", cooldownSeconds: 60 },
      validatedAt: Date.now(),
      cooldownUntil: Date.now() + 60_000,
    });

    renderPage();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    // Straight to the result — no claim request, no double reward.
    expect(screen.getByText("gameFlow.success_title")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });
});
