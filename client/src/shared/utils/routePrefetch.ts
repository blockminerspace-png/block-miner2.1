/**
 * Warms Vite `import()` chunks so navigation does not wait on the network while the
 * previous screen stays visible (React concurrent updates + `React.lazy` routes).
 */

type RouteLoader = () => Promise<unknown>;

function normalizePathname(pathname: unknown): string {
  if (!pathname || typeof pathname !== 'string') return '';
  let p = pathname.split('?')[0].split('#')[0];
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

const inflight = new Map<string, Promise<void>>();

function runOnce(key: string, factory: RouteLoader): Promise<void> {
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = factory()
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}

const exactLoaders: Record<string, RouteLoader> = {
  '/dashboard': () => import('../../pages/dashboard'),
  '/inventory': () => import('../../pages/machines'),
  '/shop': () => import('../../pages/shop'),
  '/vault': () => import('../../pages/Vault'),
  '/wallet': () => import('../../pages/wallet'),
  '/faucet': () => import('../../pages/Faucet'),
  '/shortlinks': () => import('../../pages/Shortlinks'),
  '/checkin': () => import('../../pages/checkin'),
  '/read-earn': () => import('../../pages/ReadEarn'),
  '/internal-offerwall': () => import('../../pages/InternalOfferwall'),
  '/tasks': () => import('../../pages/tasks'),
  '/youtube': () => import('../../pages/YouTubeWatch'),
  '/auto-mining': () => import('../../pages/AutoMining'),
  '/ranking': () => import('../../pages/Ranking'),
  '/settings': () => import('../../pages/Settings'),
  '/support': () => import('../../pages/support'),
  '/games': () => import('../../pages/Games'),
  '/roadmap': () => import('../../pages/Roadmap'),
  '/manual': () => import('../../pages/Manual'),
  '/calculator': () => import('../../pages/Calculator'),
  '/transparency': () => import('../../pages/Transparency'),
  '/power-stats': () => import('../../pages/stats'),
  '/offers': () => import('../../pages/offers'),
};

function prefixLoader(path: string): RouteLoader | null {
  if (path.startsWith('/mini-pass')) return () => import('../../pages/MiniPass');
  if (path.startsWith('/room/')) return () => import('../../pages/PublicRoom');
  if (path.startsWith('/games/')) return () => import('../../pages/Game2048Page');
  if (path.startsWith('/shortlink/internal-shortlink/')) return () => import('../../pages/ShortlinkStep');
  return null;
}

/**
 * @returns Promise when a matching lazy chunk is warmed, otherwise undefined.
 */
export function prefetchRoute(pathname: unknown): Promise<void> | undefined {
  const p = normalizePathname(pathname);
  if (!p) return undefined;
  const direct = exactLoaders[p];
  if (direct) return runOnce(`e:${p}`, direct);
  const pf = prefixLoader(p);
  if (pf) {
    const key = p.startsWith('/mini-pass')
      ? 'p:/mini-pass'
      : p.startsWith('/room/')
        ? 'p:/room/'
        : p.startsWith('/games/')
          ? 'p:/games/'
          : 'p:/shortlink/internal-shortlink/';
    return runOnce(key, pf);
  }
  return undefined;
}

/** Warm common post-login chunks during idle time (best-effort). Staggered so one slow chunk (e.g. Shop + catalog) does not starve navigation clicks. */
export function prefetchProtectedBootstrap(): void {
  const tasks: RouteLoader[] = [
    () => import('../../pages/dashboard'),
    () => import('../../pages/machines'),
    () => import('../../pages/shop'),
    () => import('../../pages/wallet'),
  ];
  const gapMs = 700;
  tasks.forEach((task, i) => {
    window.setTimeout(() => void task().catch(() => {}), i * gapMs);
  });
}
