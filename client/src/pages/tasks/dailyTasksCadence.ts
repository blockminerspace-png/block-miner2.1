import type { DailyTaskRow } from './dailyTasksTypes';

/** Cadence order for grouped sections and jump navigation (nothing is hidden). */
export const CADENCE_SECTIONS = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;
export type CadenceKey = (typeof CADENCE_SECTIONS)[number];

export function groupTasksByCadence(tasks: DailyTaskRow[]): Record<CadenceKey, DailyTaskRow[]> {
  const buckets: Record<CadenceKey, DailyTaskRow[]> = { DAILY: [], WEEKLY: [], MONTHLY: [] };
  for (const task of tasks) {
    const c = String(task.resetCadence || 'DAILY').toUpperCase();
    const key: CadenceKey = c === 'WEEKLY' || c === 'MONTHLY' ? c : 'DAILY';
    buckets[key].push(task);
  }
  return buckets;
}
