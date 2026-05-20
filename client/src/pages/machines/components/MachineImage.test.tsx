/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import { MachineImage } from "./MachineImage";

describe("MachineImage", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows placeholder when imageUrl is null", () => {
    render(<MachineImage imageUrl={null} name="Miner A" />);
    expect(screen.getByRole("img", { name: "Miner A" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { hidden: true })).toBeTruthy();
    expect(screen.getByText("GPU")).toBeInTheDocument();
  });

  it("renders real image src when provided", () => {
    render(<MachineImage imageUrl="/uploads/miners/a.png" name="Miner A" />);
    const img = screen.getByRole("img", { name: "Miner A" });
    expect(img).toHaveAttribute("src", "/uploads/miners/a.png");
  });

  it("does not treat stock placeholder path as a real image", () => {
    render(<MachineImage imageUrl="/machines/reward1.png" name="Miner A" />);
    expect(screen.getByText("GPU")).toBeInTheDocument();
  });

  it("falls back to placeholder on load error without mutating src to reward1", () => {
    render(<MachineImage imageUrl="/uploads/miners/missing.png" name="Miner A" />);
    const img = screen.getByRole("img", { name: "Miner A" });
    fireEvent.error(img);
    expect(screen.getByText("GPU")).toBeInTheDocument();
    expect(img).not.toHaveAttribute("src", "/machines/reward1.png");
  });
});
