import test from "node:test";
import assert from "node:assert/strict";
import {
  collectVisiblePathsFromCategories,
  normalizeSidebarPath
} from "../server/services/sidebarNavService.js";
import { filterDailyTaskDefsForSidebar } from "../server/services/dailyTasks/dailyTaskDashboardService.js";
import { TASK_LOGIN_DAY } from "../server/services/dailyTasks/dailyTaskConstants.js";

test("normalizeSidebarPath trims trailing slash and query", () => {
  assert.equal(normalizeSidebarPath("/checkin/"), "/checkin");
  assert.equal(normalizeSidebarPath("/tasks?x=1"), "/tasks");
});

test("collectVisiblePathsFromCategories gathers root and nested paths", () => {
  const paths = collectVisiblePathsFromCategories([
    {
      section: "earn",
      items: [
        { itemId: "checkin", labelKey: "k", icon: "Cal", path: "/checkin" },
        {
          itemId: "rewards_group",
          labelKey: "r",
          icon: "F",
          children: [
            { itemId: "faucet", labelKey: "f", icon: "G", path: "/faucet" }
          ]
        }
      ]
    }
  ]);
  assert.equal(paths.has("/checkin"), true);
  assert.equal(paths.has("/faucet"), true);
});

test("filterDailyTaskDefsForSidebar removes LOGIN_DAY when check-in path hidden", () => {
  const defs = [
    { taskType: TASK_LOGIN_DAY, slug: "daily-login" },
    { taskType: "MINE_BLK", slug: "daily-mine-blk" }
  ];
  const without = filterDailyTaskDefsForSidebar(defs, new Set(["/dashboard"]));
  assert.equal(without.length, 1);
  assert.equal(without[0].slug, "daily-mine-blk");

  const withCheckin = filterDailyTaskDefsForSidebar(defs, new Set(["/checkin", "/dashboard"]));
  assert.equal(withCheckin.length, 2);
});
