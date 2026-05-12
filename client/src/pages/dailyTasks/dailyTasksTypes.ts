export type TaskStatus = 'available' | 'in_progress' | 'completed' | 'claimed';

export type DailyTaskReward = {
  kind?: string | null;
  amount?: string | number | null;
  hashRate?: number | null;
  days?: number | null;
};

export type DailyTaskRow = {
  id: number;
  resetCadence?: string | null;
  translationKey?: string | null;
  targetValue?: number | string | null;
  currentValue?: number | string | null;
  periodKey?: string | null;
  nextResetAt?: string | null;
  status: TaskStatus | string;
  reward?: DailyTaskReward | null;
};

export type DailyTasksDashboardData = {
  ok?: boolean;
  nextResetAt?: string | null;
  tasks?: DailyTaskRow[];
};

export type DailyTasksTranslate = (key: string, options?: Record<string, unknown>) => string;
