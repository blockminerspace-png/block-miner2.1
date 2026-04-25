/**
 * Sidebar nav registry validation and resolved tree (no DB).
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  validateSidebarEntriesPayload,
  buildDefaultSidebarEntries,
  coerceInternalOfferwallEarnRoot,
  coerceParentLockedSidebarEntries,
  mergeMissingSidebarRegistryEntries
} from "../server/services/sidebarNavRegistry.js";
import { buildResolvedCategories } from "../server/services/sidebarNavService.js";

test("default entries pass validation", () => {
  const d = buildDefaultSidebarEntries();
  const v = validateSidebarEntriesPayload(d);
  assert.equal(v.ok, true);
});

test("mergeMissingSidebarRegistryEntries adds read_earn when snapshot omits it", () => {
  const full = buildDefaultSidebarEntries();
  const withoutReadEarn = full.filter((e) => e.itemId !== "read_earn");
  const { entries, changed } = mergeMissingSidebarRegistryEntries(withoutReadEarn);
  assert.equal(changed, true);
  assert.ok(entries.some((e) => e.itemId === "read_earn"));
  const v = validateSidebarEntriesPayload(entries);
  assert.equal(v.ok, true);
});

test("rejects unknown itemId", () => {
  const d = buildDefaultSidebarEntries();
  d[0] = { ...d[0], itemId: "invalid_item" };
  const v = validateSidebarEntriesPayload(d);
  assert.equal(v.ok, false);
});

test("rejects parent_locked violation for check-in", () => {
  const d = buildDefaultSidebarEntries();
  const i = d.findIndex((x) => x.itemId === "checkin");
  assert.ok(i >= 0);
  d[i] = { ...d[i], parentItemId: "rewards_group" };
  const v = validateSidebarEntriesPayload(d);
  assert.equal(v.ok, false);
  assert.equal(v.code, "parent_locked");
});

test("rejects parent_locked violation for daily_tasks nested under rewards_group", () => {
  const d = buildDefaultSidebarEntries();
  const i = d.findIndex((x) => x.itemId === "daily_tasks");
  assert.ok(i >= 0);
  d[i] = { ...d[i], parentItemId: "rewards_group" };
  const v = validateSidebarEntriesPayload(d);
  assert.equal(v.ok, false);
  assert.equal(v.code, "parent_locked");
});

test("hiding rewards group removes nested earn items from resolved nav", () => {
  const d = buildDefaultSidebarEntries().map((e) => {
    if (e.itemId === "rewards_group" || e.parentItemId === "rewards_group") {
      return { ...e, visible: false };
    }
    return e;
  });
  const cats = buildResolvedCategories(d);
  const earn = cats.find((c) => c.section === "earn");
  const flatPaths = earn.items.flatMap((x) =>
    x.children ? x.children.map((c) => c.path) : [x.path]
  );
  assert.ok(!flatPaths.includes("/faucet"));
});

test("coerceParentLockedSidebarEntries moves mini_pass out of rewards_group in stored rows", () => {
  const d = buildDefaultSidebarEntries();
  const i = d.findIndex((x) => x.itemId === "mini_pass");
  assert.ok(i >= 0);
  d[i] = { ...d[i], parentItemId: "rewards_group" };
  const { entries, changed } = coerceParentLockedSidebarEntries(d);
  assert.equal(changed, true);
  const mini = entries.find((x) => x.itemId === "mini_pass");
  assert.equal(mini.parentItemId, null);
  const v = validateSidebarEntriesPayload(entries);
  assert.equal(v.ok, true);
});

test("coerceParentLockedSidebarEntries moves daily_tasks out of rewards_group in stored rows", () => {
  const d = buildDefaultSidebarEntries();
  const i = d.findIndex((x) => x.itemId === "daily_tasks");
  assert.ok(i >= 0);
  d[i] = { ...d[i], parentItemId: "rewards_group" };
  const { entries, changed } = coerceParentLockedSidebarEntries(d);
  assert.equal(changed, true);
  const row = entries.find((x) => x.itemId === "daily_tasks");
  assert.equal(row.parentItemId, null);
  const v = validateSidebarEntriesPayload(entries);
  assert.equal(v.ok, true);
});

test("default daily_tasks is top-level earn (not under rewards_group)", () => {
  const d = buildDefaultSidebarEntries();
  const row = d.find((x) => x.itemId === "daily_tasks");
  assert.equal(row.parentItemId, null);
  const rewards = d.find((x) => x.itemId === "rewards_group");
  assert.ok(rewards);
  const nestedDaily = d.some((x) => x.itemId === "daily_tasks" && x.parentItemId === "rewards_group");
  assert.equal(nestedDaily, false);
});

test("mini_pass is a top-level earn link in default resolved nav", () => {
  const d = buildDefaultSidebarEntries();
  const cats = buildResolvedCategories(d);
  const earn = cats.find((c) => c.section === "earn");
  const mini = earn.items.find((x) => x.itemId === "mini_pass");
  assert.ok(mini);
  assert.equal(mini.path, "/mini-pass");
});

test("read_earn is nested under rewards_group in default resolved nav", () => {
  const d = buildDefaultSidebarEntries();
  const cats = buildResolvedCategories(d);
  const earn = cats.find((c) => c.section === "earn");
  const group = earn.items.find((x) => x.itemId === "rewards_group");
  assert.ok(group?.children?.some((c) => c.itemId === "read_earn" && c.path === "/read-earn"));
});

test("internal_offerwall is nested under rewards_group in default entries and resolved nav", () => {
  const d = buildDefaultSidebarEntries();
  const row = d.find((x) => x.itemId === "internal_offerwall");
  assert.equal(row.parentItemId, "rewards_group");
  const cats = buildResolvedCategories(d);
  const earn = cats.find((c) => c.section === "earn");
  const group = earn.items.find((x) => x.itemId === "rewards_group");
  assert.ok(group?.children?.some((c) => c.itemId === "internal_offerwall" && c.path === "/internal-offerwall"));
  assert.ok(!earn.items.some((x) => x.itemId === "internal_offerwall"));
});

test("coerceInternalOfferwallEarnRoot moves internal_offerwall from earn root into rewards_group", () => {
  const d = buildDefaultSidebarEntries();
  const i = d.findIndex((x) => x.itemId === "internal_offerwall");
  assert.ok(i >= 0);
  d[i] = { ...d[i], parentItemId: null };
  const { entries, changed } = coerceInternalOfferwallEarnRoot(d);
  assert.equal(changed, true);
  const row = entries.find((x) => x.itemId === "internal_offerwall");
  assert.equal(row.parentItemId, "rewards_group");
  const v = validateSidebarEntriesPayload(entries);
  assert.equal(v.ok, true);
});
