import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { io } from "socket.io-client";
import { toast } from "sonner";
import { useAuthStore, api } from "../store/auth";
import Games from "./Games";

const socketHandlers = {};

vi.mock("../store/auth", () => ({
  useAuthStore: vi.fn(),
  api: {
    get: vi.fn(() => Promise.resolve({ data: { ok: true, totalHashRate: 0 } })),
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
    t: (key, opts) => (opts != null ? `${key}:${JSON.stringify(opts)}` : key),
  }),
}));

function renderWithRouter(ui) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

function createMockSocket() {
  const socketStub = {
    on: vi.fn((event, fn) => {
      socketHandlers[event] = fn;
      return socketStub;
    }),
    emit: vi.fn(),
    disconnect: vi.fn(),
  };
  return socketStub;
}

describe("Games page", () => {
  beforeEach(() => {
    Object.keys(socketHandlers).forEach((k) => delete socketHandlers[k]);
    useAuthStore.mockReturnValue({ token: "test-token" });
    vi.mocked(io).mockReturnValue(createMockSocket());
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders Miner Games headings and game cards", async () => {
    renderWithRouter(<Games />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/games/active-powers"));
    expect(screen.getAllByText("minerGames.brand_prefix").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("minerGames.brand_suffix").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("minerGames.memory_sync_title")).toBeInTheDocument();
    expect(screen.getByText("minerGames.power_match_title")).toBeInTheDocument();
    expect(screen.getByText("game2048.title")).toBeInTheDocument();
  });

  it("shows translated toast for coded game:error", async () => {
    renderWithRouter(<Games />);
    await waitFor(() => expect(socketHandlers["game:error"]).toBeTypeOf("function"));
    socketHandlers["game:error"]({ code: "invalid_session" });
    expect(toast.error).toHaveBeenCalledWith("minerGames.socket_errors.invalid_session");
  });

  it("passes legacy string game:error to toast unchanged", async () => {
    renderWithRouter(<Games />);
    await waitFor(() => expect(socketHandlers["game:error"]).toBeTypeOf("function"));
    socketHandlers["game:error"]("Legacy message");
    expect(toast.error).toHaveBeenCalledWith("Legacy message");
  });

  it("shows translated toast for coded game:finished failure", async () => {
    renderWithRouter(<Games />);
    await waitFor(() => expect(socketHandlers["game:finished"]).toBeTypeOf("function"));
    socketHandlers["game:finished"]({
      success: false,
      messageCode: "session_ended",
      cooldownSeconds: 60,
    });
    expect(toast.error).toHaveBeenCalledWith("minerGames.game_finish.session_ended");
  });

  it("shows translated reward for coded game:finished success", async () => {
    renderWithRouter(<Games />);
    await waitFor(() => expect(socketHandlers["game:finished"]).toBeTypeOf("function"));
    socketHandlers["game:finished"]({
      success: true,
      rewardCode: "full_term",
      rewardParams: { days: 7 },
      cooldownSeconds: 60,
    });
    expect(toast.success).toHaveBeenCalledWith('minerGames.game_reward.full_term:{"days":7}');
  });
});
