import { Suspense, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { handleChunkLoadFailure, isChunkLoadError } from '../utils/chunkLoadError';
import Web3ProvidersLight from './Web3ProvidersLight';

type Web3ProvidersComponent = ComponentType<{ children: ReactNode }>;

type Web3BoundaryProps = {
  children: ReactNode;
  fallback: ReactNode;
};

function Web3WalletChunkBanner({ onReload }: { onReload: () => void }) {
  return (
    <div
      className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-100"
      role="status"
    >
      <p className="font-medium">
        Módulo de carteira não carregou. Recarregue a página para obter a versão mais recente.
      </p>
      <button
        type="button"
        onClick={onReload}
        className="mt-2 rounded-lg border border-amber-400/40 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-50 hover:border-amber-300"
      >
        Recarregar plataforma
      </button>
    </div>
  );
}

export default function Web3Boundary({ children, fallback }: Web3BoundaryProps) {
  const [Web3Providers, setWeb3Providers] = useState<Web3ProvidersComponent | null>(null);
  const [useLightProviders, setUseLightProviders] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void import('../components/Web3Providers')
      .then((mod) => {
        if (!cancelled) {
          setWeb3Providers(() => mod.default);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (handleChunkLoadFailure(error)) {
          return;
        }
        if (isChunkLoadError(error)) {
          setUseLightProviders(true);
          return;
        }
        setUseLightProviders(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (useLightProviders) {
    return (
      <>
        <Web3WalletChunkBanner onReload={() => window.location.reload()} />
        <Web3ProvidersLight>{children}</Web3ProvidersLight>
      </>
    );
  }

  if (!Web3Providers) {
    return <>{fallback}</>;
  }

  return (
    <Suspense fallback={fallback}>
      <Web3Providers>{children}</Web3Providers>
    </Suspense>
  );
}
