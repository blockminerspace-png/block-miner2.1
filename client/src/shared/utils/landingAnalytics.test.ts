import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  persistUtmParams,
  readStoredUtm,
  trackLandingEvent,
  LANDING_SCROLL_MILESTONES,
} from "./landingAnalytics";

describe("landingAnalytics", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.stubEnv("VITE_GA_ID", "G-TEST123");
    delete window.gtag;
    delete window.fbq;
    delete window.__blockminerMetaPixelLoaded;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("persistUtmParams stores UTM keys from search string", () => {
    persistUtmParams("?utm_source=ig&utm_medium=social&utm_campaign=spring");
    const u = readStoredUtm();
    expect(u.utm_source).toBe("ig");
    expect(u.utm_medium).toBe("social");
    expect(u.utm_campaign).toBe("spring");
  });

  it("trackLandingEvent calls gtag when configured", () => {
    const gtag = vi.fn();
    window.gtag = gtag;
    trackLandingEvent("landing_cta_click", { cta_id: "primary" });
    expect(gtag).toHaveBeenCalledWith("event", "landing_cta_click", expect.objectContaining({ cta_id: "primary" }));
  });

  it("LANDING_SCROLL_MILESTONES includes 25 through 100", () => {
    expect(LANDING_SCROLL_MILESTONES).toEqual([25, 50, 75, 100]);
  });
});
