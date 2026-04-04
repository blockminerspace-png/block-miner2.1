import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAuthStore } from "../store/auth";
import Landing from "./Landing";

vi.mock("../store/auth", () => ({
  useAuthStore: vi.fn(() => ({ isAuthenticated: false })),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key) => key }),
}));

vi.mock("../components/BrandLogo", () => ({
  default: () => <div data-testid="brand-logo" />,
}));

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

  it("renders without crashing", () => {
    renderLanding();
  });

  it("shows brand logo", () => {
    renderLanding();
    expect(screen.getByTestId("brand-logo")).toBeInTheDocument();
  });

  it("renders h1 hero title", () => {
    renderLanding();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("renders hero title i18n key", () => {
    renderLanding();
    expect(screen.getByText("landing.hero.title")).toBeInTheDocument();
  });

  it("renders hero highlighted text", () => {
    renderLanding();
    expect(screen.getByText("landing.hero.title_highlight")).toBeInTheDocument();
  });

  it("renders nav login link", () => {
    renderLanding();
    expect(screen.getByText("landing.nav.login")).toBeInTheDocument();
  });

  it("renders nav register link at least once", () => {
    renderLanding();
    expect(screen.getAllByText("landing.nav.register").length).toBeGreaterThanOrEqual(1);
  });

  it("renders 4 stats cards", () => {
    renderLanding();
    expect(screen.getByText("landing.stats.block_value")).toBeInTheDocument();
    expect(screen.getByText("landing.stats.currency_value")).toBeInTheDocument();
    expect(screen.getByText("landing.stats.db_value")).toBeInTheDocument();
    expect(screen.getByText("landing.stats.auth_value")).toBeInTheDocument();
  });

  it("renders How it works section title", () => {
    renderLanding();
    expect(screen.getByText("landing.how.title")).toBeInTheDocument();
  });

  it("renders 3 step titles", () => {
    renderLanding();
    expect(screen.getByText("landing.how.step1_title")).toBeInTheDocument();
    expect(screen.getByText("landing.how.step2_title")).toBeInTheDocument();
    expect(screen.getByText("landing.how.step3_title")).toBeInTheDocument();
  });

  it("renders 6 feature cards as articles", () => {
    renderLanding();
    expect(screen.getAllByRole("article").length).toBeGreaterThanOrEqual(6);
  });

  it("renders all 6 feature titles", () => {
    renderLanding();
    for (let i = 1; i <= 6; i++) {
      expect(screen.getByText(`landing.features.f${i}_title`)).toBeInTheDocument();
    }
  });

  it("renders features section heading", () => {
    renderLanding();
    expect(screen.getByText("landing.features.title")).toBeInTheDocument();
  });

  it("renders FAQ section title", () => {
    renderLanding();
    expect(screen.getByText("landing.faq.title")).toBeInTheDocument();
  });

  it("renders 4 FAQ questions", () => {
    renderLanding();
    for (let i = 1; i <= 4; i++) {
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

  it("renders CTA title", () => {
    renderLanding();
    expect(screen.getByText("landing.cta.title")).toBeInTheDocument();
  });

  it("renders CTA register button", () => {
    renderLanding();
    expect(screen.getByText("landing.cta.register")).toBeInTheDocument();
  });

  it("CTA explore link points to polygonscan.com", () => {
    renderLanding();
    expect(
      screen.getByText("landing.cta.explore").closest("a")
    ).toHaveAttribute("href", "https://polygonscan.com/");
  });

  it("renders footer disclaimer", () => {
    renderLanding();
    expect(screen.getByText("landing.footer.disclaimer")).toBeInTheDocument();
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
    expect(document.title).toContain("Block Miner");
  });
});