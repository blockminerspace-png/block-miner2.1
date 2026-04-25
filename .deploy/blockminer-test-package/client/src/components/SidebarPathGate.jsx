import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api } from '../store/auth';

function collectPathsFromCategories(categories) {
  const paths = new Set();
  if (!Array.isArray(categories)) return paths;
  for (const cat of categories) {
    for (const item of cat.items || []) {
      if (typeof item.path === 'string' && item.path.startsWith('/')) {
        let p = item.path.split('?')[0];
        if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
        paths.add(p);
      }
      for (const c of item.children || []) {
        if (typeof c.path === 'string' && c.path.startsWith('/')) {
          let p = c.path.split('?')[0];
          if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
          paths.add(p);
        }
      }
    }
  }
  return paths;
}

function normalizePath(path) {
  if (typeof path !== 'string' || !path.startsWith('/')) return '';
  const base = path.split('?')[0];
  if (base.length > 1 && base.endsWith('/')) return base.slice(0, -1);
  return base;
}

/**
 * Renders children only when `requiredPath` is present in the public sidebar nav.
 * If the sidebar API fails, the gate allows access (fail-open) so a nav outage does not lock users out.
 */
export default function SidebarPathGate({ requiredPath, redirectTo = '/dashboard', children }) {
  const { t } = useTranslation();
  const [state, setState] = useState(/** @type {'loading' | 'allow' | 'deny'} */ ('loading'));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/sidebar/nav');
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
