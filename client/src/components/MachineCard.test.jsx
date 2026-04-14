/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import MachineCard from "./MachineCard.jsx";
import { MachinePlacementStatus } from "../constants/machinePlacement";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => key,
  }),
}));

describe("MachineCard", () => {
  afterEach(() => {
    cleanup();
  });

  const baseMachine = {
    id: 1,
    minerName: "Test Miner",
    level: 3,
    hashRate: 1000,
    status: MachinePlacementStatus.VAULT,
  };

  it("stacks action below content and invokes retrieve handler", () => {
    const onRetrieve = vi.fn();
    render(
      <MachineCard
        machine={baseMachine}
        showActions
        isVault
        onRetrieve={onRetrieve}
        retrieveLabel="vault.retrieve_from_vault"
      />,
    );
    expect(screen.getByText("vault.machine_status_vault")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "vault.retrieve_from_vault" }));
    expect(onRetrieve).toHaveBeenCalledTimes(1);
  });

  it("disables retrieve button when actionDisabled is true", () => {
    const onRetrieve = vi.fn();
    render(
      <MachineCard
        machine={baseMachine}
        showActions
        onRetrieve={onRetrieve}
        actionDisabled
      />,
    );
    const btn = screen.getByRole("button", { name: "vault.retrieve_from_vault" });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onRetrieve).not.toHaveBeenCalled();
  });
});
