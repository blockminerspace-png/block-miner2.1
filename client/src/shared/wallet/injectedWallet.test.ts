import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  rankInjectedProvider,
  getInjectedWalletProviders,
  connectInjectedWallet,
  isBenignInjectedWalletRpcError,
  isNoInjectedAccountsError,
  safeEthAccounts,
  type InjectedWalletProviderInfo,
} from './injectedWallet';

function mockProvider(flags: {
  isRabby?: boolean;
  isMetaMask?: boolean;
  isBraveWallet?: boolean;
  chainId?: string;
  accounts?: string[];
  rejectAccounts?: boolean;
}): InjectedWalletProviderInfo['provider'] {
  return {
    isRabby: flags.isRabby,
    isMetaMask: flags.isMetaMask,
    isBraveWallet: flags.isBraveWallet,
    request: vi.fn(async (args: { method: string }) => {
      if (args.method === 'eth_chainId') {
        return flags.chainId ?? '0x89';
      }
      if (args.method === 'eth_accounts') {
        return flags.accounts ?? [];
      }
      if (args.method === 'eth_requestAccounts') {
        if (flags.rejectAccounts) throw { code: 4001, message: 'User rejected' };
        return flags.accounts ?? ['0x1111111111111111111111111111111111111111'];
      }
      throw new Error(`unknown method ${args.method}`);
    }),
  };
}

describe('rankInjectedProvider', () => {
  it('prioritizes Rabby over MetaMask', () => {
    const rabby: InjectedWalletProviderInfo = {
      id: 'r',
      name: 'Rabby',
      rdns: 'io.rabby',
      provider: mockProvider({ isRabby: true }),
      source: 'eip6963',
    };
    const mm: InjectedWalletProviderInfo = {
      id: 'm',
      name: 'MetaMask',
      provider: mockProvider({ isMetaMask: true }),
      source: 'window.ethereum.providers',
    };
    expect(rankInjectedProvider(rabby)).toBeGreaterThan(rankInjectedProvider(mm));
  });

  it('does not require isMetaMask for Rabby', () => {
    const rabby: InjectedWalletProviderInfo = {
      id: 'r',
      name: 'Rabby Wallet',
      provider: mockProvider({ isRabby: true }),
      source: 'window.ethereum.providers',
    };
    expect(rankInjectedProvider(rabby)).toBe(100);
  });
});

describe('getInjectedWalletProviders', () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    vi.stubGlobal('window', {
      ...originalWindow,
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      setTimeout: (fn: () => void) => {
        fn();
        return 0;
      },
      ethereum: {
        providers: [
          mockProvider({ isMetaMask: true }),
          mockProvider({ isRabby: true }),
        ],
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('detects Rabby via window.ethereum.providers', async () => {
    const list = await getInjectedWalletProviders();
    const rabby = list.find((p) => p.provider.isRabby);
    expect(rabby).toBeTruthy();
    expect(list[0]?.provider.isRabby).toBe(true);
  });
});

describe('connectInjectedWallet', () => {
  it('calls eth_requestAccounts on the first ranked provider', async () => {
    const rabbyProvider = mockProvider({
      isRabby: true,
      accounts: ['0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
    });

    const list: InjectedWalletProviderInfo[] = [
      {
        id: 'rabby',
        name: 'Rabby',
        provider: rabbyProvider,
        source: 'eip6963',
      },
    ];

    const providersMod = await import('./injectedWallet');
    const spy = vi.spyOn(providersMod, 'getInjectedWalletProviders').mockResolvedValue(list);

    const conn = await connectInjectedWallet();
    expect(conn.address).toBe('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(rabbyProvider.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'eth_requestAccounts' }),
    );
    spy.mockRestore();
  });

  it('surfaces user rejection cleanly', async () => {
    const rejecting = mockProvider({ isRabby: true, rejectAccounts: true });
    const providersMod = await import('./injectedWallet');
    const spy = vi.spyOn(providersMod, 'getInjectedWalletProviders').mockResolvedValue([
      {
        id: 'rabby',
        name: 'Rabby',
        provider: rejecting,
        source: 'eip6963',
      },
    ]);

    await expect(connectInjectedWallet()).rejects.toMatchObject({ code: 'USER_REJECTED' });
    spy.mockRestore();
  });
});

describe('benign wallet RPC errors', () => {
  it('detects Rabby no-account message', () => {
    expect(
      isNoInjectedAccountsError({ code: 4001, message: 'wallet must has at least one account' }),
    ).toBe(true);
    expect(isBenignInjectedWalletRpcError({ code: 4001, message: 'wallet must has at least one account' })).toBe(
      true,
    );
  });

  it('safeEthAccounts returns [] on no-account error', async () => {
    const provider = mockProvider({ isRabby: true });
    (provider.request as ReturnType<typeof vi.fn>).mockImplementation(async (args: { method: string }) => {
      if (args.method === 'eth_accounts') {
        throw { code: 4001, message: 'wallet must has at least one account' };
      }
      return [];
    });
    await expect(safeEthAccounts(provider)).resolves.toEqual([]);
  });
});
