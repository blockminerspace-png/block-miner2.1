type EthereumEventHandler = (...args: unknown[]) => void;

type ProviderWithEvents = {
  on?: (event: string, fn: EthereumEventHandler) => void;
  off?: (event: string, fn: EthereumEventHandler) => void;
  removeListener?: (event: string, fn: EthereumEventHandler) => void;
};

/**
 * Subscribe to common EIP-1193 events and return a cleanup that never throws
 * if the vendor uses a non-standard provider (fixes removeListener crashes on some wallets).
 */
export function subscribeInjectedEthereumEvents(
  provider: unknown,
  handlers:
    | {
        onAccountsChanged?: EthereumEventHandler;
        onChainChanged?: EthereumEventHandler;
      }
    | null
    | undefined,
): () => void {
  const p = provider as ProviderWithEvents | null | undefined;
  if (!p || typeof p.on !== "function") {
    return () => {};
  }
  const { onAccountsChanged, onChainChanged } = handlers || {};
  if (typeof onAccountsChanged === "function") {
    p.on("accountsChanged", onAccountsChanged);
  }
  if (typeof onChainChanged === "function") {
    p.on("chainChanged", onChainChanged);
  }
  return () => {
    const detach = (event: string, fn: EthereumEventHandler | undefined) => {
      if (typeof fn !== "function") return;
      try {
        if (typeof p.removeListener === "function") {
          p.removeListener(event, fn);
          return;
        }
        if (typeof p.off === "function") {
          p.off(event, fn);
        }
      } catch {
        /* non-standard provider */
      }
    };
    detach("accountsChanged", onAccountsChanged);
    detach("chainChanged", onChainChanged);
  };
}
