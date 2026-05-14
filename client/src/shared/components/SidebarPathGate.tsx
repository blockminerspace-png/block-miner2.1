import { useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api } from '../../store/auth';

type NavChild = { path?: unknown };
type NavItem = { path?: unknown; children?: readonly NavChild[] | null };
type NavCategory = { items?: readonly NavItem[] | null };

function collectPathsFromCategories(categories: unknown): Set<string> {
  const paths = new Set<string>();
  if (!Array.isArray(categories)) return paths;
  for (const cat of categories) {
    if (!cat || typeof cat !== 'object') continue;
    const c = cat as NavCategory;
    for (const item of c.items ?? []) {
      if (typeof item.path === 'string' && item.path.startsWith('/')) {
        let p = item.path.split('?')[0];
        if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
        paths.add(p);
      }
      for (const ch of item.children ?? []) {
        if (typeof ch.path === 'string' && ch.path.startsWith('/')) {
          let p = ch.path.split('?')[0];
          if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
          paths.add(p);
        }
      }
    }
  }
  return paths;
}

function normalizePath(path: unknown): string {
  if (typeof path !== 'string' || !path.startsWith('/')) return '';
  const base = path.split('?')[0];
  if (base.length > 1 && base.endsWith('/')) return base.slice(0, -1);
  return base;
}

type GateState = 'loading' | 'allow' | 'deny';

/**
 * Renders children only when `requiredPath` is present in the public sidebar nav.
 * If the sidebar API fails, the gate allows access (fail-open) so a nav outage does not lock users out.
 */
export default function SidebarPathGate({
  requiredPath,
  redirectTo = '/dashboard',
  children,
}: {
  requiredPath: string;
  redirectTo?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<GateState>('loading');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api.get<{ categories?: unknown }>('/sidebar/nav');
        const paths = collectPathsFromCategories(res.data?.categories);
        const key = normalizePath(requiredPath);
        if (cancelled) return;
        setState(key && paths.has(key) ? 'allow' : 'deny');
      } catch {
        if (!cancelled) setState('allow');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requiredPath]);

  useEffect(() => {
    if (state === 'deny') {
      toast.message(t('feature_gate.unavailable'));
    }
  }, [state, t]);

  if (state === 'loading') {
    return (
      <div className="flex justify-center py-24" role="status" aria-live="polite">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (state === 'deny') {
    return <Navigate to={redirectTo} replace />;
  }
  return children;
}
