/** True when `pathname` is the child route or nested under it. */
export function pathMatchesNavChild(pathname: unknown, childPath: unknown): boolean {
  if (!childPath || typeof childPath !== 'string') return false;
  if (typeof pathname !== 'string') return false;
  if (pathname === childPath) return true;
  const base = childPath.endsWith('/') ? childPath.slice(0, -1) : childPath;
  if (!base || base === '/') return pathname === '/';
  return pathname.startsWith(`${base}/`);
}
