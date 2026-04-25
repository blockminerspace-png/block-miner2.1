/**
 * Subscribe to common EIP-1193 events and return a cleanup that never throws
 * if the vendor uses a non-standard provider (fixes removeListener crashes on some wallets).
 */
export function subscribeInjectedEthereumEvents(provider, handlers) {
  if (!provider || typeof provider.on !== "function") {
    return () => {};
  }
  const { onAccountsChanged, onChainChanged } = handlers || {};
  if (typeof onAccountsChanged === "function") {
    provider.on("accountsChanged", onAccountsChanged);
  }
  if (typeof onChainChanged === "function") {
    provider.on("chainChanged", onChainChanged);
  }
  return () => {
    const detach = (event, fn) => {
      if (typeof fn !== "function") return;
      try {
        if (typeof provider.removeListener === "function") {
          provider.removeListener(event, fn);
          return;
        }
        if (typeof provider.off === "function") {
          provider.off(event, fn);
        }
      } catch {
        /* non-standard provider */
      }
    };
    detach("accountsChanged", onAccountsChanged);
    detach("chainChanged", onChainChanged);
  };
}
