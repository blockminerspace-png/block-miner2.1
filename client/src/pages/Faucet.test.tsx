/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Faucet from "./Faucet";

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn()
}));

vi.mock("../store/auth", () => ({
  api
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
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
