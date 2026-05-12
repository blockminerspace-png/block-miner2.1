import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import axios from 'axios';
import { api } from '../../store/auth';
import { groupTasksByCadence } from './dailyTasksCadence';
import { formatDashboardNextResetLabel } from './dailyTasksHelpers';
import type { DailyTasksDashboardData, DailyTaskRow } from './dailyTasksTypes';

export function useDailyTasksDashboard() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DailyTasksDashboardData | null>(null);
  /** When set, the list request failed — do not show the “no tasks configured” empty copy. */
  const [loadFailed, setLoadFailed] = useState(false);
  const [claimingId, setClaimingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const res = await api.get<DailyTasksDashboardData>('/daily-tasks');
      if (res.data?.ok) {
        setData(res.data);
        setLoadFailed(false);
      } else {
        setData(null);
        setLoadFailed(true);
        toast.error(t('dailyTasks.errors.load_failed'));
      }
    } catch (e: unknown) {
      setData(null);
      setLoadFailed(true);
      if (axios.isAxiosError(e)) {
        const status = e.response?.status;
        if (status === 401) {
          toast.error(t('dailyTasks.errors.unauthorized'));
        } else if (status != null && status >= 500) {
          toast.error(t('dailyTasks.errors.server'));
        } else if (e.response) {
          toast.error(t('dailyTasks.errors.load_failed'));
        } else {
          toast.error(t('dailyTasks.errors.network'));
        }
      } else {
        toast.error(t('dailyTasks.errors.network'));
      }
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const tasks: DailyTaskRow[] = data?.tasks ?? [];
  const tasksByCadence = useMemo(() => groupTasksByCadence(tasks), [tasks]);

  const nextResetLabel = useMemo(() => formatDashboardNextResetLabel(data?.nextResetAt), [data?.nextResetAt]);

  const claim = useCallback(
    async (taskId: number) => {
      try {
        setClaimingId(taskId);
        const res = await api.post(`/daily-tasks/${taskId}/claim`);
        if (res.data?.ok) {
          toast.success(t('dailyTasks.claim_ok'));
          await load();
        }
      } catch (e: unknown) {
        const code =
          axios.isAxiosError(e) && e.response?.data && typeof e.response.data === 'object' && 'code' in e.response.data
            ? String((e.response.data as { code?: string }).code)
            : undefined;
        if (code === 'not_completed') toast.error(t('dailyTasks.errors.not_completed'));
        else if (code === 'already_claimed') toast.error(t('dailyTasks.errors.already_claimed'));
        else toast.error(t('dailyTasks.errors.claim_failed'));
      } finally {
        setClaimingId(null);
      }
    },
    [load, t]
  );

  return {
    t,
    loading,
    loadFailed,
    tasks,
    tasksByCadence,
    nextResetLabel,
    claimingId,
    load,
    claim
  };
}
