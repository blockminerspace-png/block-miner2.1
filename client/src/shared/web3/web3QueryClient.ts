import { QueryClient } from '@tanstack/react-query';

/** Shared TanStack Query client for wallet UI (light + full Web3 stacks). */
export const web3QueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 45_000,
      gcTime: 15 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});
