import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAdminMiners } from './adminMiners.api';
import type { AdminMinerApiRow, AdminMinersQuery } from './adminMiners.types';
import { adminMinersListErrorMessage, isAdminMinersSchemaOutOfDate } from './adminMiners.validation';

type UseAdminMinersListOptions = {
  page: number;
  limit: number;
  filter: string;
  sort: string;
  q: string;
  debounceMs?: number;
};

export function useAdminMinersList({ page, limit, filter, sort, q, debounceMs = 250 }: UseAdminMinersListOptions) {
  const [miners, setMiners] = useState<AdminMinerApiRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [schemaOutOfDate, setSchemaOutOfDate] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setListError(null);
    setSchemaOutOfDate(false);

    const params: AdminMinersQuery = {
      page,
      limit,
      filter,
      sort,
      q: q.trim() || undefined,
    };

    try {
      const data = await fetchAdminMiners(params, controller.signal);
      if (data.ok === false) {
        const message = data.message || data.error || 'Erro ao carregar mineradoras';
        setListError(message);
        setMiners([]);
        setTotal(0);
        setSchemaOutOfDate(data.code === 'ADMIN_MINERS_SCHEMA_OUT_OF_DATE');
        return;
      }
      setMiners(data.miners || []);
      setTotal(Number(data.total || 0));
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'name' in err && (err as { name?: unknown }).name === 'CanceledError') {
        return;
      }
      setSchemaOutOfDate(isAdminMinersSchemaOutOfDate(err));
      setListError(adminMinersListErrorMessage(err) || 'Erro ao carregar mineradoras');
      setMiners([]);
      setTotal(0);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setLoading(false);
      }
    }
  }, [page, limit, filter, sort, q]);

  useEffect(() => {
    const timer = setTimeout(() => void reload(), debounceMs);
    return () => clearTimeout(timer);
  }, [reload, debounceMs]);

  return {
    miners,
    total,
    loading,
    listError,
    schemaOutOfDate,
    reload,
  };
}
