import { ethers } from "ethers";

let _provider = null;

export function getSharedPolygonProvider() {
  if (!_provider) {
    const rpcUrl = process.env.POLYGON_RPC_URL || "https://polygon-bor-rpc.publicnode.com";
    _provider = new ethers.JsonRpcProvider(rpcUrl, undefined, {
      staticNetwork: ethers.Network.from(137)
    });
  }
  return _provider;
}

/** Test helper — reset singleton between tests. */
export function resetSharedPolygonProviderForTests() {
  _provider = null;
}
