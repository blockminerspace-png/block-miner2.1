/**
 * Lazy WalletConnect v2 (EIP-1193) for Polygon — requires VITE_WALLETCONNECT_PROJECT_ID.
 */

let _instance = null;

export function isWalletConnectConfigured() {
  return Boolean(String(import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "").trim());
}

/**
 * @returns {Promise<import('@walletconnect/ethereum-provider').default | null>}
 */
export async function getWalletConnectEthereumProvider() {
  const projectId = String(import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "").trim();
  if (!projectId) return null;

  const { default: EthereumProvider } = await import("@walletconnect/ethereum-provider");
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const rpcUrl =
    String(import.meta.env.VITE_POLYGON_RPC_URL || "").trim() || "https://polygon-rpc.com";

  if (!_instance) {
    _instance = await EthereumProvider.init({
      projectId,
      chains: [137],
      optionalChains: [137],
      showQrModal: true,
      rpcMap: { 137: rpcUrl },
      metadata: {
        name: "BlockMiner",
        description: "POL deposits on Polygon",
        url: origin || "https://blockminer.space",
        icons: origin ? [`${origin}/favicon.ico`] : []
      }
    });
    _instance.on("disconnect", () => {
      _instance = null;
    });
  }
  return _instance;
}

export function resetWalletConnectSingletonForTests() {
  _instance = null;
}
