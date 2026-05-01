/**
 * Warms Vite `import()` chunks so navigation does not wait on the network while the
 * previous screen stays visible (React concurrent updates + `React.lazy` routes).
 */

function normalizePathname(pathname) {
  if (!pathname || typeof pathname !== 'string') return '';
  let p = pathname.split('?')[0].split('#')[0];
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

const inflight = new Map();

function runOnce(key, factory) {
  if (inflight.has(key)) return inflight.get(key);
  const p = factory()
    .catch(() => {})
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}

const exactLoaders = {
  '/dashboard': () => import('../pages/Dashboard.jsx'),
  '/inventory': () => import('../pages/Inventory.jsx'),
  '/shop': () => import('../pages/Shop.jsx'),
  '/vault': () => import('../pages/Vault.jsx'),
  '/wallet': () => import('../pages/Wallet.jsx'),
  '/faucet': () => import('../pages/Faucet.jsx'),
  '/shortlinks': () => import('../pages/Shortlinks.jsx'),
  '/checkin': () => import('../pages/Checkin.jsx'),
  '/read-earn': () => import('../pages/ReadEarn.jsx'),
  '/internal-offerwall': () => import('../pages/InternalOfferwall.jsx'),
  '/tasks': () => import('../pages/DailyTasks.jsx'),
  '/youtube': () => import('../pages/YouTubeWatch.jsx'),
  '/auto-mining': () => import('../pages/AutoMining.jsx'),
  '/ranking': () => import('../pages/Ranking.jsx'),
  '/settings': () => import('../pages/Settings.jsx'),
  '/support': () => import('../pages/Support.jsx'),
  '/games': () => import('../pages/Games.jsx'),
  '/roadmap': () => import('../pages/Roadmap.jsx'),
  '/manual': () => import('../pages/Manual.jsx'),
  '/calculator': () => import('../pages/Calculator.jsx'),
  '/transparency': () => import('../pages/Transparency.jsx'),
  '/power-stats': () => import('../pages/PowerStatistics.jsx'),
  '/offers': () => import('../pages/PopularOffers.jsx'),
};

function prefixLoader(path) {
  if (path.startsWith('/mini-pass')) return () => import('../pages/MiniPass.jsx');
  if (path.startsWith('/room/')) return () => import('../pages/PublicRoom.jsx');
  if (path.startsWith('/games/')) return () => import('../pages/Game2048Page.jsx');
  if (path.startsWith('/shortlink/internal-shortlink/')) return () => import('../pages/ShortlinkStep.jsx');
  return null;
}

/**
 * @param {string} pathname
 * @returns {Promise<void> | undefined}
 */
export function prefetchRoute(pathname) {
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

/** Warm common post-login chunks during idle time (best-effort). */
export function prefetchProtectedBootstrap() {
  const tasks = [
    () => import('../pages/Dashboard.jsx'),
    () => import('../pages/Inventory.jsx'),
    () => import('../pages/Shop.jsx'),
    () => import('../pages/Wallet.jsx'),
  ];
  for (const t of tasks) void t().catch(() => {});
}
