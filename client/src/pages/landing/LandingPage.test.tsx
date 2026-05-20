import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Landing from "./LandingPage";

const mockUseAuthStore = vi.hoisted(() =>
  vi.fn(() => ({ isAuthenticated: false })),
);

vi.mock("../../store/auth", () => ({
  useAuthStore: mockUseAuthStore,
}));

const mockI18n = vi.hoisted(() => ({
  language: "en",
  resolvedLanguage: "en",
  changeLanguage: vi.fn(() => Promise.resolve()),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: mockI18n }),
}));

vi.mock("../../shared/components/BrandLogo", () => ({
  default: () => <div data-testid="brand-logo" />,
}));

class TestIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin = "";
  readonly thresholds: ReadonlyArray<number> = [0];
  private readonly cb: IntersectionObserverCallback;

  constructor(cb: IntersectionObserverCallback) {
    this.cb = cb;
  }

  observe(target: Element): void {
    this.cb(
      [
        {
          boundingClientRect: target.getBoundingClientRect(),
          intersectionRatio: 1,
          intersectionRect: target.getBoundingClientRect(),
          isIntersecting: true,
          rootBounds: null,
          target,
          time: Date.now(),
        } as IntersectionObserverEntry,
      ],
      this,
    );
  }

  disconnect(): void {}

  unobserve(): void {}

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

global.IntersectionObserver = TestIntersectionObserver as unknown as typeof IntersectionObserver;

global.fetch = vi.fn(() =>
  Promise.resolve(
    new Response(JSON.stringify({ ok: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  ),
);

const renderLanding = () =>
  render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  );

describe("Landing page", () => {
  beforeEach(() => {
    mockUseAuthStore.mockReturnValue({ isAuthenticated: false });
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
    const btn = screen.getByText("landing.faq.q1").closest("button");
    expect(btn).toBeInstanceOf(HTMLButtonElement);
    fireEvent.click(btn as HTMLButtonElement);
    expect(screen.getByText("landing.faq.a1")).toBeInTheDocument();
  });

  it("FAQ answer closes on second click", () => {
    renderLanding();
    const btn = screen.getByText("landing.faq.q1").closest("button");
    expect(btn).toBeInstanceOf(HTMLButtonElement);
    fireEvent.click(btn as HTMLButtonElement);
    expect(screen.getByText("landing.faq.a1")).toBeInTheDocument();
    fireEvent.click(btn as HTMLButtonElement);
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
    mockUseAuthStore.mockReturnValue({ isAuthenticated: true });
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
