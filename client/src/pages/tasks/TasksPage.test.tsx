import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import axios, { type InternalAxiosRequestConfig, type AxiosResponse } from "axios";
import { toast } from "sonner";
import { api } from "../../store/auth";
import TasksPage from "./TasksPage";

vi.mock("../../store/auth", () => ({
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
    t: (key: string, opts?: unknown) => {
      if (opts && typeof opts === "object") {
        return `${key}:${JSON.stringify(opts)}`;
      }
      return key;
    }
  })
}));

describe("TasksPage", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        ok: true,
        periodKey: "2026-04-10",
        nextResetAt: "2026-04-11T03:00:00.000Z",
        serverTime: "2026-04-10T12:00:00.000Z",
        tasks: [
          {
            id: 1,
            slug: "daily-login",
            taskType: "LOGIN_DAY",
            resetCadence: "DAILY",
            translationKey: "dailyTasks.tasks.login",
            targetValue: 1,
            currentValue: 1,
            periodKey: "2026-04-10",
            nextResetAt: "2026-04-11T03:00:00.000Z",
            status: "completed",
            reward: { kind: "BLK", amount: "0.01" },
            gameSlug: null
          }
        ]
      }
    });
    vi.mocked(api.post).mockResolvedValue({ data: { ok: true } });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("loads tasks and shows claim button for completed task", async () => {
    render(<TasksPage />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/daily-tasks"));
    expect(screen.getByText("dailyTasks.title")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "dailyTasks.claim" })).toBeEnabled();
  });

  it("posts claim and shows success toast", async () => {
    render(<TasksPage />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "dailyTasks.claim" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/daily-tasks/1/claim"));
    expect(toast.success).toHaveBeenCalledWith("dailyTasks.claim_ok");
  });

  it("shows load error panel and unauthorized toast on 401", async () => {
    const cfg = { headers: {} } as InternalAxiosRequestConfig;
    const resStub = { status: 401, data: {}, statusText: "Unauthorized", headers: {}, config: cfg } as AxiosResponse;
    const err = new axios.AxiosError("Unauthorized", "ERR_BAD_REQUEST", cfg, {}, resStub);
    // Strict Mode may run the effect twice; every GET in this test must fail the same way.
    vi.mocked(api.get).mockImplementation(() => Promise.reject(err));
    render(<TasksPage />);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("dailyTasks.errors.unauthorized"));
    expect(await screen.findByText("dailyTasks.load_error_body")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "dailyTasks.retry" })).toBeInTheDocument();
    expect(screen.queryByText("dailyTasks.empty")).not.toBeInTheDocument();
  });

  it("shows configured empty copy when API returns ok with zero tasks", async () => {
    vi.mocked(api.get).mockImplementation(() =>
      Promise.resolve({ data: { ok: true, periodKey: "2026-04-10", nextResetAt: null, tasks: [] } })
    );
    render(<TasksPage />);
    expect(await screen.findByText("dailyTasks.empty")).toBeInTheDocument();
    expect(screen.queryByText("dailyTasks.load_error_body")).not.toBeInTheDocument();
  });

  it("groups tasks by cadence and keeps all claim buttons visible", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        ok: true,
        periodKey: "2026-04-10",
        nextResetAt: "2026-04-11T03:00:00.000Z",
        tasks: [
          {
            id: 1,
            slug: "daily-a",
            taskType: "LOGIN_DAY",
            resetCadence: "DAILY",
            translationKey: "dailyTasks.tasks.login",
            targetValue: 1,
            currentValue: 0,
            periodKey: "2026-04-10",
            nextResetAt: "2026-04-11T03:00:00.000Z",
            status: "in_progress",
            reward: { kind: "BLK", amount: "0.01" },
            gameSlug: null
          },
          {
            id: 2,
            slug: "weekly-b",
            taskType: "PLAY_GAMES",
            resetCadence: "WEEKLY",
            translationKey: "dailyTasks.tasks.play_games",
            targetValue: 3,
            currentValue: 0,
            periodKey: "2026-W15",
            nextResetAt: "2026-04-20T03:00:00.000Z",
            status: "in_progress",
            reward: { kind: "BLK", amount: "0.02" },
            gameSlug: null
          }
        ]
      }
    });
    render(<TasksPage />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "dailyTasks.section_DAILY" })).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "dailyTasks.section_WEEKLY" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "dailyTasks.claim" })).toHaveLength(2);
  });
});
