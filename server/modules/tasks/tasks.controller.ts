import type { Request, Response } from "express";
import { getDailyTasksDashboard } from "../../services/dailyTasks/dailyTaskDashboardService.js";
import { claimDailyTaskReward } from "../../services/dailyTasks/dailyTaskClaimService.js";

import loggerLib from "../../utils/logger.js";
const logger = loggerLib.child("tasks.controller");

type TaskParams = { taskId: string };

export async function getDailyTasks(req: Request, res: Response): Promise<void> {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, code: "unauthorized" });
      return;
    }
    const userId = req.user.id;
    const data = await getDailyTasksDashboard(userId);
    res.json({ ok: true, ...data });
  } catch (e: unknown) {
    logger.error("getDailyTasks", { error: String(e) });
    res.status(500).json({ ok: false, code: "error" });
  }
}

export async function postClaimDailyTask(req: Request<TaskParams>, res: Response): Promise<void> {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, code: "unauthorized" });
      return;
    }
    const userId = req.user.id;
    const taskDefinitionId = parseInt(req.params.taskId, 10);
    if (!taskDefinitionId) {
      res.status(400).json({ ok: false, code: "invalid_task" });
      return;
    }

    const r = await claimDailyTaskReward(userId, taskDefinitionId);
    if (!r.ok) {
      res.status(r.status || 500).json({ ok: false, code: r.code });
      return;
    }
    res.json({ ok: true, summary: r.summary });
  } catch (e: unknown) {
    logger.error("postClaimDailyTask", { error: String(e) });
    res.status(500).json({ ok: false, code: "error" });
  }
}
