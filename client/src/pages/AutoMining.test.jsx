/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AutoMining from "./AutoMining";

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn()
}));

vi.mock("../store/auth", () => ({
  api
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => key
  })
}));

vi.mock("../utils/security", () => ({
  validateTrustedEvent: () => true,
  generateSecurityPayload: () => ({})
}));

describe("AutoMining v2 page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({
      data: {
        success: true,
        session: null,
        dailyUsedHash: 0,
        dailyRemainingHash: 1000,
        dailyLimitHash: 1000,
        cycleSeconds: 60,
        activeGrants: [],
        recentGrants: [],
        sessionEarningsHash: 0,
        bannerStatsToday: { impressions: 0, clicks: 0 }
      }
    });
  });

  it("loads v2 status and shows mode selection when no session", async () => {
    render(<AutoMining />);
    expect(screen.getByText("autoMiningGpuPage.loading")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("autoMiningGpuPage.mode_title")).toBeInTheDocument();
    });
    expect(api.get).toHaveBeenCalledWith("/auto-mining-gpu/v2/status");
  });
});
