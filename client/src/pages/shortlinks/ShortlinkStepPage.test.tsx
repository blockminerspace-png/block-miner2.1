/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ShortlinkStep from "./ShortlinkStepPage";

vi.mock("../../store/auth", () => ({
  api: { post: vi.fn() },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { step?: number; total?: number }) => {
      if (key === "shortlinks.step_title" && opts) {
        return `step ${opts.step}/${opts.total}`;
      }
      return key;
    },
  }),
}));

function renderStep(step = "2") {
  sessionStorage.setItem(
    "sl_session",
    JSON.stringify({ token: "tok", currentStep: Number(step) }),
  );
  return render(
    <MemoryRouter initialEntries={[`/shortlink/internal-shortlink/step/${step}`]}>
      <Routes>
        <Route path="/shortlink/internal-shortlink/step/:step" element={<ShortlinkStep />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ShortlinkStep page", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("renders translated step title and ZerAds banners", () => {
    renderStep("2");
    expect(screen.getByText("step 2/3")).toBeInTheDocument();
    expect(screen.getByText("shortlinks.step_subtitle")).toBeInTheDocument();
    expect(screen.getAllByTitle(/ZerAds/).length).toBe(2);
  });
});
