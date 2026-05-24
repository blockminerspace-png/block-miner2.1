/**
 * Chain registry — one file per network.
 * Import this to get the full CHAINS array used by multiChainWalletService.
 *
 * To add a new chain: create <chain>.ts, import it here, add to CHAINS.
 * A failure in one chain's file never affects other chains at runtime.
 */
import ethereum  from "./ethereum.js";
import polygon   from "./polygon.js";
import arbitrum  from "./arbitrum.js";
import base      from "./base.js";
import optimism  from "./optimism.js";
import bsc       from "./bsc.js";
import avalanche from "./avalanche.js";

export type { ChainConfig, KnownToken, PriceKey } from "./_types.js";

import type { ChainConfig } from "./_types.js";

export const CHAINS: ChainConfig[] = [
  ethereum,
  polygon,
  arbitrum,
  base,
  optimism,
  bsc,
  avalanche,
];
