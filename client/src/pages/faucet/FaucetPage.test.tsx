/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Faucet, { __resetFaucetStatusBootstrapForTests } from "./FaucetPage";

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn()
}));

vi.mock("../../store/auth", () => ({
  api
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key
  }),
  initReactI18next: { type: "3rdParty", init: () => undefined }
}));

function statusPayload(overrides: { reward?: Record<string, unknown> } & Record<string, unknown> = {}) {
  const { reward: rewardPatch, ...rest } = overrides;
  return {
    ok: true,
    available: true,
    remainingMs: 0,
    nextClaimAt: null,
    totalClaims: 0,
    canClaim: false,
    reward: {
      id: 1,
      minerId: 2,
      name: "Test Miner",
      hashRate: 10,
      slotSize: 1,
      imageUrl: "/machines/reward1.png",
      inventoryPermanent: true,
      inventoryExpiresAt: null,
      ...(rewardPatch ?? {}),
    },
    ...rest,
  };
}

describe("Faucet page", () => {
  beforeEach(() => {
    __resetFaucetStatusBootstrapForTests();
    vi.clearAllMocks();
    api.post.mockResolvedValue({ data: { ok: true } });
  });

  it("shows permanent reward label when API marks inventory as permanent", async () => {
    api.get.mockResolvedValue({ data: statusPayload() });

    render(<Faucet />);

    await waitFor(() => {
      expect(screen.getByText("faucet.reward_permanent")).toBeInTheDocument();
    });
    expect(api.get).toHaveBeenCalledWith("/faucet/status");
  });

  it("defaults to permanent label when inventoryPermanent is omitted (legacy responses)", async () => {
    api.get.mockResolvedValue({
      data: {
        ok: true,
        available: true,
        remainingMs: 0,
        nextClaimAt: null,
        totalClaims: 0,
        canClaim: false,
        reward: {
          id: 1,
          minerId: 2,
          name: "Legacy Miner",
          hashRate: 5,
          slotSize: 1,
          imageUrl: "/x.png"
        }
      }
    });

    render(<Faucet />);

    await waitFor(() => {
      expect(screen.getByText("faucet.reward_permanent")).toBeInTheDocument();
    });
  });

  it("shows sponsor step when API partnerReady is stale until session unlock", async () => {
    api.get.mockResolvedValue({
      data: statusPayload({
        partnerReady: true,
        partnerVisitActive: true,
        partnerWaitRemainingMs: 0,
        canClaim: true,
      }),
    });

    render(<Faucet />);

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "faucet.partner_open_btn" }).length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("faucet.unlocked")).not.toBeInTheDocument();
  });

  it("starts partner visit when open-sponsor button is clicked", async () => {
    api.get.mockResolvedValue({ data: statusPayload() });
    api.post.mockResolvedValue({ data: { ok: true, waitMs: 10000 } });
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    render(<Faucet />);

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "faucet.partner_open_btn" }).length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getAllByRole("button", { name: "faucet.partner_open_btn" })[0]);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/faucet/partner/start");
    });
    expect(openSpy).toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it("keeps partner countdown when a stale status response arrives after partner/start", async () => {
    let resolveLateStatus: (value: { data: ReturnType<typeof statusPayload> }) => void = () => undefined;
    const lateStatus = new Promise<{ data: ReturnType<typeof statusPayload> }>((resolve) => {
      resolveLateStatus = resolve;
    });
    api.get
      .mockResolvedValueOnce({ data: statusPayload() })
      .mockImplementationOnce(() => lateStatus);
    api.post.mockResolvedValue({ data: { ok: true, waitMs: 10000 } });
    vi.spyOn(window, "open").mockImplementation(() => null);

    render(<Faucet />);

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "faucet.partner_open_btn" }).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByRole("button", { name: "faucet.partner_open_btn" })[0]);

    await waitFor(() => {
      expect(screen.getAllByText("faucet.wait_seconds").length).toBeGreaterThan(0);
    });

    resolveLateStatus({
      data: statusPayload({
        partnerReady: false,
        partnerVisitActive: false,
        partnerWaitRemainingMs: 0,
        canClaim: false,
      }),
    });

    await waitFor(() => {
      expect(screen.getAllByText("faucet.wait_seconds").length).toBeGreaterThan(0);
    });
  });

  it("shows temporary label when API sets inventoryPermanent to false", async () => {
    api.get.mockResolvedValue({
      data: statusPayload({
        reward: { inventoryPermanent: false, inventoryExpiresAt: new Date().toISOString() }
      })
    });

    render(<Faucet />);

    await waitFor(() => {
      expect(screen.getByText("faucet.reward_temporary")).toBeInTheDocument();
    });
  });
});
