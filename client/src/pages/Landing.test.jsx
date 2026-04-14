import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useAuthStore } from "../store/auth";
import Landing from "./Landing";

const mockI18n = vi.hoisted(() => ({
  language: "en",
  resolvedLanguage: "en",
  changeLanguage: vi.fn(() => Promise.resolve()),
}));

vi.mock("../store/auth", () => ({
  useAuthStore: vi.fn(() => ({ isAuthenticated: false })),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key) => key, i18n: mockI18n }),
}));

vi.mock("../components/BrandLogo", () => ({
  default: () => <div data-testid="brand-logo" />,
}));

global.IntersectionObserver = class {
  constructor(cb) {
    this.cb = cb;
  }
  observe() {
    this.cb([{ isIntersecting: true }]);
  }
  disconnect() {}
  unobserve() {}
};

global.fetch = vi.fn(() => Promise.resolve({ json: () => Promise.resolve({ ok: false }) }));

const renderLanding = () =>
  render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  );

describe("Landing page", () => {
  beforeEach(() => {
    useAuthStore.mockReturnValue({ isAuthenticated: false });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders without crashing", () => {
    renderLanding();
  });

  it("shows brand logo in header and footer", () => {
    renderLanding();
    expect(screen.getAllByTestId("brand-logo").length).toBeGreaterThanOrEqual(1);
  });

  it("renders skip link to main content", () => {
    renderLanding();
    const skip = screen.getByRole("link", { name: "landing.skip" });
    expect(skip).toHaveAttribute("href", "#main-content");
  });

  it("renders h1 hero headline parts", () => {
    renderLanding();
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("landing.hero.headline_line1");
    expect(h1).toHaveTextContent("landing.hero.headline_highlight");
    expect(h1).toHaveTextContent("landing.hero.headline_line2");
  });

  it("hero secondary CTA links to login", () => {
    renderLanding();
    const link = screen.getByRole("link", { name: "landing.hero.cta_secondary" });
    expect(link).toHaveAttribute("href", "/login");
  });

  it("renders nav register link at least once", () => {
    renderLanding();
    expect(screen.getAllByText("landing.nav.register").length).toBeGreaterThanOrEqual(1);
  });

  it("renders community stats labels", () => {
    renderLanding();
    expect(screen.getByText("landing.stats.users_label")).toBeInTheDocument();
    expect(screen.getByText("landing.stats.withdrawn_label")).toBeInTheDocument();
    expect(screen.getByText("landing.stats.uptime_label")).toBeInTheDocument();
    expect(screen.getByText("landing.stats.miners_label")).toBeInTheDocument();
    expect(screen.getByText("landing.stats.network_label")).toBeInTheDocument();
    expect(screen.getByText("landing.stats.activity_label")).toBeInTheDocument();
  });

  it("renders How it works kicker and title", () => {
    renderLanding();
    expect(screen.getByText("landing.how.kicker")).toBeInTheDocument();
    expect(screen.getByText("landing.how.title")).toBeInTheDocument();
  });

  it("renders 3 step titles", () => {
    renderLanding();
    expect(screen.getByText("landing.how.step1_title")).toBeInTheDocument();
    expect(screen.getByText("landing.how.step2_title")).toBeInTheDocument();
    expect(screen.getByText("landing.how.step3_title")).toBeInTheDocument();
  });

  it("renders 6 feature cards in the features grid", () => {
    renderLanding();
    for (let i = 1; i <= 6; i++) {
      expect(screen.getByText(`landing.features.f${i}_title`)).toBeInTheDocument();
    }
  });

  it("renders features section heading", () => {
    renderLanding();
    expect(screen.getByText("landing.features.title")).toBeInTheDocument();
  });

  it("renders calculator link in footer", () => {
    renderLanding();
    const link = screen.getByRole("link", { name: "landing.footer.link_calc" });
    expect(link).toHaveAttribute("href", "/calculator");
  });

  it("renders FAQ section title", () => {
    renderLanding();
    expect(screen.getByText("landing.faq.title")).toBeInTheDocument();
  });

  it("renders 5 FAQ questions", () => {
    renderLanding();
    for (let i = 1; i <= 5; i++) {
      expect(screen.getByText(`landing.faq.q${i}`)).toBeInTheDocument();
    }
  });

  it("FAQ answer hidden by default, opens on click", () => {
    renderLanding();
    expect(screen.queryByText("landing.faq.a1")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("landing.faq.q1").closest("button"));
    expect(screen.getByText("landing.faq.a1")).toBeInTheDocument();
  });

  it("FAQ answer closes on second click", () => {
    renderLanding();
    const btn = screen.getByText("landing.faq.q1").closest("button");
    fireEvent.click(btn);
    expect(screen.getByText("landing.faq.a1")).toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.queryByText("landing.faq.a1")).not.toBeInTheDocument();
  });

  it("renders final CTA title", () => {
    renderLanding();
    expect(screen.getByText("landing.final_cta.title")).toBeInTheDocument();
  });

  it("renders final CTA primary button", () => {
    renderLanding();
    expect(screen.getByText("landing.final_cta.primary")).toBeInTheDocument();
  });

  it("renders footer tagline", () => {
    renderLanding();
    expect(screen.getByText("landing.footer.tagline")).toBeInTheDocument();
  });

  it("redirects authenticated users (renders nothing)", () => {
    useAuthStore.mockReturnValue({ isAuthenticated: true });
    const { container } = render(
      <MemoryRouter initialEntries={["/"]}>
        <Landing />
      </MemoryRouter>,
    );
    expect(container.firstChild).toBeNull();
  });

  it("sets document title on mount", () => {
    renderLanding();
    expect(document.title).toBe("landing.meta.title");
  });
});
