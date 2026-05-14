import { describe, it, expect, vi } from "vitest";
import { subscribeInjectedEthereumEvents } from "./eip1193ProviderEvents";

describe("subscribeInjectedEthereumEvents", () => {
  it("returns no-op unsubscribe when provider is missing", () => {
    const u = subscribeInjectedEthereumEvents(null, {});
    expect(() => u()).not.toThrow();
  });

  it("subscribes and removes via removeListener when available", () => {
    const rm = vi.fn();
    const provider = {
      on: vi.fn(),
      removeListener: rm,
    };
    const h1 = () => {};
    const h2 = () => {};
    const unsub = subscribeInjectedEthereumEvents(provider, {
      onAccountsChanged: h1,
      onChainChanged: h2,
    });
    expect(provider.on).toHaveBeenCalledWith("accountsChanged", h1);
    expect(provider.on).toHaveBeenCalledWith("chainChanged", h2);
    unsub();
    expect(rm).toHaveBeenCalledWith("accountsChanged", h1);
    expect(rm).toHaveBeenCalledWith("chainChanged", h2);
  });

  it("unsubscribe does not throw when removeListener is not a function", () => {
    const provider = {
      on: vi.fn(),
      removeListener: "not-a-function",
    };
    const unsub = subscribeInjectedEthereumEvents(provider, {
      onAccountsChanged: () => {},
      onChainChanged: () => {},
    });
    expect(() => unsub()).not.toThrow();
  });

  it("falls back to off() when removeListener is absent", () => {
    const off = vi.fn();
    const h = () => {};
    const provider = { on: vi.fn(), off };
    const unsub = subscribeInjectedEthereumEvents(provider, { onAccountsChanged: h });
    unsub();
    expect(off).toHaveBeenCalledWith("accountsChanged", h);
  });
});
