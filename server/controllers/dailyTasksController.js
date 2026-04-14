import { getDailyTasksDashboard } from "../services/dailyTasks/dailyTaskDashboardService.js";
import { claimDailyTaskReward } from "../services/dailyTasks/dailyTaskClaimService.js";

export async function getDailyTasks(req, res) {
  try {
    const userId = req.user.id;
    const data = await getDailyTasksDashboard(userId);
    res.json({ ok: true, ...data });
  } catch (e) {
    console.error("getDailyTasks", e);
    res.status(500).json({ ok: false, code: "error" });
  }
}

export async function postClaimDailyTask(req, res) {
  try {
    const userId = req.user.id;
    const taskDefinitionId = parseInt(req.params.taskId, 10);
    if (!taskDefinitionId) {
      return res.status(400).json({ ok: false, code: "invalid_task" });
    }

    const r = await claimDailyTaskReward(userId, taskDefinitionId);
    if (!r.ok) {
      return res.status(r.status || 500).json({ ok: false, code: r.code });
    }
    res.json({ ok: true, summary: r.summary });
  } catch (e) {
    console.error("postClaimDailyTask", e);
    res.status(500).json({ ok: false, code: "error" });
  }
}
