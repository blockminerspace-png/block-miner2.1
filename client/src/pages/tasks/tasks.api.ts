import { api } from '../../store/auth';
import type { DailyTasksDashboardData } from './dailyTasksTypes';

export function getDailyTasksDashboard() {
  return api.get<DailyTasksDashboardData>('/daily-tasks');
}

export function postDailyTaskClaim(taskId: number) {
  return api.post(`/daily-tasks/${taskId}/claim`);
}
