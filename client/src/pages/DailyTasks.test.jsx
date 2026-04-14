import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { toast } from "sonner";
import { api } from "../store/auth";
import DailyTasks from "./DailyTasks";

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
    t: (key, opts) => {
      if (opts && typeof opts === "object") {
        return `${key}:${JSON.stringify(opts)}`;
      }
      return key;
    }
  })
}));

describe("DailyTasks page", () => {
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
            translationKey: "dailyTasks.tasks.login",
            targetValue: 1,
            currentValue: 1,
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
    render(<DailyTasks />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/daily-tasks"));
    expect(screen.getByText("dailyTasks.title")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "dailyTasks.claim" })).toBeEnabled();
  });

  it("posts claim and shows success toast", async () => {
    render(<DailyTasks />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "dailyTasks.claim" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/daily-tasks/1/claim"));
    expect(toast.success).toHaveBeenCalledWith("dailyTasks.claim_ok");
  });
});
