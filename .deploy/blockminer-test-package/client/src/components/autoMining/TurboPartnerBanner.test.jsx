/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import TurboPartnerBanner, { TURBO_ZERADS_IFRAME_SRC } from "./TurboPartnerBanner.jsx";

vi.mock("../../utils/security", () => ({
  validateTrustedEvent: () => true,
}));

describe("TurboPartnerBanner", () => {
  const t = (k) => k;

  afterEach(() => {
    cleanup();
  });

  it("renders ZerAds iframe with required src and size when impression is ready", () => {
    render(
      <TurboPartnerBanner
        impression={{ id: "imp-1", title: "Ad" }}
        loading={false}
        error={false}
        disabled={false}
        onRegisterClick={vi.fn().mockResolvedValue(undefined)}
        onTracked={vi.fn()}
        t={t}
      />
    );
    const iframe = screen.getByTitle("autoMiningGpuPage.turbo_zerads_iframe_title");
    expect(iframe).toHaveAttribute("src", TURBO_ZERADS_IFRAME_SRC);
    expect(iframe).toHaveAttribute("width", "300");
    expect(iframe).toHaveAttribute("height", "250");
  });

  it("calls register click, opens ZerAds in a new tab, and marks tracked", async () => {
    const onRegisterClick = vi.fn().mockResolvedValue(undefined);
    const onTracked = vi.fn();
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    render(
      <TurboPartnerBanner
        impression={{ id: "imp-99" }}
        loading={false}
        error={false}
        disabled={false}
        onRegisterClick={onRegisterClick}
        onTracked={onTracked}
        t={t}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "autoMiningGpuPage.banner_open" }));
    await waitFor(() => {
      expect(onRegisterClick).toHaveBeenCalledWith("imp-99");
      expect(openSpy).toHaveBeenCalledWith(
        TURBO_ZERADS_IFRAME_SRC,
        "_blank",
        "noopener,noreferrer"
      );
      expect(onTracked).toHaveBeenCalled();
    });
    openSpy.mockRestore();
  });
});
