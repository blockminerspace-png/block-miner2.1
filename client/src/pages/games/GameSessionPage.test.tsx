import "@testing-library/jest-dom/vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Socket } from "socket.io-client";
import { io } from "socket.io-client";
import { toast } from "sonner";
import { useAuthStore } from "../../store/auth";
import GameSessionPage from "./GameSessionPage";

const socketHandlers: Record<string, (payload: unknown) => void> = {};
const mockNavigate = vi.fn();

vi.mock("../../store/auth", () => ({
  useAuthStore: vi.fn(),
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock("socket.io-client", () => ({
  io: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
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
    useParams: () => ({ slug: "match-3" }),
  };
});

function createMockSocket(): Socket {
  const socketStub = {
    on: vi.fn((event: string, fn: (payload: unknown) => void) => {
      socketHandlers[event] = fn;
      return socketStub;
    }),
    emit: vi.fn(),
    disconnect: vi.fn(),
  };
  return socketStub as unknown as Socket;
}

describe("GameSessionPage", () => {
  beforeEach(() => {
    Object.keys(socketHandlers).forEach((k) => delete socketHandlers[k]);
    mockNavigate.mockClear();
    vi.mocked(useAuthStore).mockReturnValue({ token: "test-token" } as ReturnType<typeof useAuthStore>);
    vi.mocked(io).mockReturnValue(createMockSocket());
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={["/games/match-3"]}>
        <GameSessionPage />
      </MemoryRouter>
    );
  }

  it("shows translated toast for coded game:error and returns to the arena", async () => {
    renderPage();
    await waitFor(() => expect(socketHandlers["game:error"]).toBeTypeOf("function"));
    socketHandlers["game:error"]({ code: "invalid_session" });
    expect(toast.error).toHaveBeenCalledWith("minerGames.socket_errors.invalid_session");
    expect(mockNavigate).toHaveBeenCalledWith("/games");
  });

  it("hands off a successful game:finished to /games/verify with the resolved reward — no popup", async () => {
    renderPage();
    await waitFor(() => expect(socketHandlers["game:finished"]).toBeTypeOf("function"));
    socketHandlers["game:finished"]({
      success: true,
      rewardCode: "full_term",
      rewardParams: { days: 7 },
      cooldownSeconds: 60,
    });

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith("/games/verify", { replace: true })
    );

    const raw = sessionStorage.getItem("bm.gameVerify.v1");
    expect(raw).toBeTruthy();
    const record = JSON.parse(raw as string);
    expect(record.resolution.outcome).toBe("success");
    expect(record.resolution.rewardMessage).toBe('minerGames.game_reward.full_term:{"days":7}');
    expect(record.playAgainPath).toBe("/games/match-3");
    // The reward is already granted server-side — the verify page never re-claims.
    expect(record.claim).toBeNull();
  });

  it("hands off a failed game:finished to /games/verify with the failure reason", async () => {
    renderPage();
    await waitFor(() => expect(socketHandlers["game:finished"]).toBeTypeOf("function"));
    socketHandlers["game:finished"]({
      success: false,
      messageCode: "session_ended",
      cooldownSeconds: 60,
    });

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith("/games/verify", { replace: true })
    );

    const raw = sessionStorage.getItem("bm.gameVerify.v1");
    expect(raw).toBeTruthy();
    const record = JSON.parse(raw as string);
    expect(record.resolution.outcome).toBe("failure");
    expect(record.resolution.reasonKey).toBe("session_ended");
    expect(record.claim).toBeNull();
  });
});
