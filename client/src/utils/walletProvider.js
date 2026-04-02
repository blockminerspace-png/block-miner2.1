/**
 * Resolve EIP-1193 provider when multiple wallets are installed.
 * Trust Wallet often uses window.trustwallet or appears inside ethereum.providers.
 */
export function getBrowserEthereumProvider() {
  if (typeof window === 'undefined') return null;

  const w = window;

  if (w.trustwallet && typeof w.trustwallet.request === 'function') {
    return w.trustwallet;
  }
  if (w.trustWallet && typeof w.trustWallet.request === 'function') {
    return w.trustWallet;
  }

  const eth = w.ethereum;
  if (!eth) return null;

  const providers = eth.providers;
  if (Array.isArray(providers) && providers.length > 0) {
    const trust = providers.find(
      (p) =>
        p &&
        (p.isTrust === true ||
          p.isTrustWallet === true ||
          p._isTrust === true ||
          String(p.constructor?.name || '').toLowerCase().includes('trust'))
    );
    if (trust) return trust;
    return providers[0];
  }

  return eth;
}

export function hasBrowserEthereumProvider() {
  return !!getBrowserEthereumProvider();
}
