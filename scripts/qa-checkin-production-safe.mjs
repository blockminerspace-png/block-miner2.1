#!/usr/bin/env node
/**
 * Safe production check-in QA harness (does not create users).
 * Never logs passwords, cookies, tokens, or DATABASE_URL.
 *
 * Env:
 *   BLOCKMINER_QA_BASE_URL          (default https://blockminer.space)
 *   BLOCKMINER_QA_IDENTIFIER        login identifier (username/email)
 *   BLOCKMINER_QA_PASSWORD          login password
 *   BLOCKMINER_QA_ALLOW_MUTATION=1  required for POST /claim
 *   BLOCKMINER_QA_USER_ID           optional, for DB evidence via docker exec
 *   BLOCKMINER_QA_DB_VIA_DOCKER=1   run duplicate SQL on VM (BLOCKMINER_VM_APP_ROOT)
 *   BLOCKMINER_QA_SKIP_CLAIM=1      status/onchain tests only
 */
import { spawnSync } from "node:child_process";
import { isProductionQaBaseUrl } from "./qa-test-user-patterns.mjs";

const BASE = (process.env.BLOCKMINER_QA_BASE_URL || "https://blockminer.space").replace(/\/$/, "");
const IDENT = String(process.env.BLOCKMINER_QA_IDENTIFIER || "").trim();
const PASS = String(process.env.BLOCKMINER_QA_PASSWORD || "");
const ALLOW_MUTATION = process.env.BLOCKMINER_QA_ALLOW_MUTATION === "1";
const QA_USER_ID = process.env.BLOCKMINER_QA_USER_ID
  ? Number(process.env.BLOCKMINER_QA_USER_ID)
  : null;
const SKIP_CLAIM = process.env.BLOCKMINER_QA_SKIP_CLAIM === "1";

const summary = {
  baseUrl: BASE,
  qaUserIdPartial: QA_USER_ID ? `…${String(QA_USER_ID).slice(-3)}` : null,
  hasIdentifier: Boolean(IDENT),
  allowMutation: ALLOW_MUTATION,
  steps: [],
  pass: true,
};

function step(name, ok, detail = {}) {
  summary.steps.push({ name, ok, ...detail });
  if (!ok) summary.pass = false;
}

function maskId(id) {
  if (id == null) return null;
  const s = String(id);
  return s.length <= 4 ? "…" + s : "…" + s.slice(-4);
}

async function fetchJson(path, opts = {}) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
    redirect: "manual",
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { _rawPreview: text.slice(0, 120) };
  }
  return { status: res.status, body, headers: res.headers };
}

function mergeSetCookie(jar, res) {
  const list =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [];
  if (list.length === 0) {
    const single = res.headers.get("set-cookie");
    if (single) list.push(single);
  }
  for (const line of list) {
    const part = String(line).split(";")[0];
    const i = part.indexOf("=");
    if (i > 0) {
      const key = part.slice(0, i).trim();
      let val = part.slice(i + 1).trim();
      try {
        val = decodeURIComponent(val);
      } catch {
        /* keep raw */
      }
      jar[key] = val;
    }
  }
  return jar;
}

function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("; ");
}

function authHeaders(jar, withJson = true) {
  const h = { Cookie: cookieHeader(jar) };
  const csrf = jar.blockminer_csrf;
  if (csrf) h["x-csrf-token"] = csrf;
  if (withJson) h["Content-Type"] = "application/json";
  return h;
}

async function primeCsrf(jar) {
  const res = await fetch(`${BASE}/api/auth/session`, {
    headers: { Accept: "application/json", Cookie: cookieHeader(jar) },
    redirect: "manual",
  });
  mergeSetCookie(jar, res);
  return jar.blockminer_csrf ? true : false;
}

async function login(jar) {
  await primeCsrf(jar);
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { ...authHeaders(jar), Accept: "application/json" },
    body: JSON.stringify({ identifier: IDENT, password: PASS }),
    redirect: "manual",
  });
  mergeSetCookie(jar, res);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { _rawPreview: text.slice(0, 120) };
  }
  const ok = res.status === 200 && body?.user?.id;
  return {
    ok,
    status: res.status,
    userId: body?.user?.id ?? null,
    code: body?.code ?? body?.error,
    jar,
  };
}

async function main() {
  if (!IDENT || !PASS) {
    console.log(JSON.stringify({ ...summary, error: "BLOCKMINER_QA_IDENTIFIER and BLOCKMINER_QA_PASSWORD required" }, null, 2));
    process.exit(1);
  }

  const jar = {};
  const loginResult = await login(jar);
  step("login", loginResult.ok, {
    status: loginResult.status,
    qaUserIdPartial: maskId(loginResult.userId),
    code: loginResult.code || undefined,
    hasCsrf: Boolean(jar.blockminer_csrf),
    hasAccess: Boolean(jar.blockminer_access),
  });
  if (!loginResult.ok) {
    console.log(JSON.stringify(summary, null, 2));
    process.exit(1);
  }

  const authH = authHeaders(jar);

  const session = await fetchJson("/api/auth/session", { headers: authH });
  step("session", session.status === 200 && session.body?.user, { status: session.status });

  const status = await fetchJson("/api/checkin/status", { headers: { ...authH, Accept: "application/json" } });
  const st = status.body || {};
  step("checkin_status", status.status === 200 && st.ok !== false, {
    status: status.status,
    checkinMode: st.checkinMode,
    todayCheckedIn: st.todayCheckedIn,
    allowsOffchainCheckin: st.allowsOffchainCheckin,
    allowsWalletCheckin: st.allowsWalletCheckin,
    requiresWalletForOffchain: st.requiresWalletForOffchainCheckin,
    canCheckin: st.canCheckin,
    streak: st.streak,
    graceEndsAt: st.graceEndsAt ?? null,
  });

  const invalidOnchain = await fetchJson("/api/checkin/claim/onchain", {
    method: "POST",
    headers: authH,
    body: JSON.stringify({ cadence: "daily", txHash: "0x" + "d".repeat(64) }),
  });
  const rejectCodes = new Set([
    "INVALID_TX_HASH",
    "INVALID_BODY",
    "WALLET_REQUIRED",
    "TRANSACTION_NOT_CONFIRMED",
    "TX_ALREADY_USED",
    "INVALID_CHAIN",
    "CHECKIN_RECEIVER_NOT_CONFIGURED",
    "PAYMENT_INSUFFICIENT",
    "BLOCKCHAIN_UNAVAILABLE",
  ]);
  const onchainRejected =
    (invalidOnchain.status >= 400 && invalidOnchain.status < 500) ||
    rejectCodes.has(invalidOnchain.body?.code);
  step("onchain_invalid_tx_rejected", onchainRejected, {
    status: invalidOnchain.status,
    code: invalidOnchain.body?.code,
  });

  const walletProbe = await fetchJson("/api/checkin/claim/onchain", {
    method: "POST",
    headers: authH,
    body: JSON.stringify({
      cadence: "daily",
      txHash: "0x" + "a".repeat(64),
    }),
  });
  const onchainCode = walletProbe.body?.code;
  const onchainControlled =
    (walletProbe.status >= 400 && walletProbe.status < 503) ||
    rejectCodes.has(onchainCode);
  step("onchain_controlled_response", onchainControlled, {
    status: walletProbe.status,
    code: onchainCode,
  });

  if (!SKIP_CLAIM && ALLOW_MUTATION) {
    const claim1 = await fetchJson("/api/checkin/claim", {
      method: "POST",
      headers: authH,
      body: JSON.stringify({ cadence: "daily" }),
    });
    const c1ok =
      (claim1.status === 200 && claim1.body?.ok) ||
      (claim1.status === 200 && claim1.body?.alreadyCheckedIn);
    step("claim_balance_first", c1ok, {
      status: claim1.status,
      code: claim1.body?.code,
      alreadyCheckedIn: claim1.body?.alreadyCheckedIn,
      paymentMethod: claim1.body?.paymentMethod,
    });

    const [claim2a, claim2b] = await Promise.all([
      fetchJson("/api/checkin/claim", {
        method: "POST",
        headers: authH,
        body: JSON.stringify({ cadence: "daily" }),
      }),
      fetchJson("/api/checkin/claim", {
        method: "POST",
        headers: authH,
        body: JSON.stringify({ cadence: "daily" }),
      }),
    ]);
    const okClaim = (r) =>
      r.status === 200 && (r.body?.alreadyCheckedIn || r.body?.ok);
    const idempotentOk = (r) =>
      okClaim(r) ||
      r.status === 409 ||
      r.body?.code === "CHECKIN_CONFLICT" ||
      r.body?.code === "CHECKIN_BUSY" ||
      r.body?.alreadyCheckedIn;
    const idempotent = okClaim(claim2a) && idempotentOk(claim2b);
    step("claim_double_concurrent", idempotent, {
      statusA: claim2a.status,
      statusB: claim2b.status,
      codeB: claim2b.body?.code,
      alreadyA: claim2a.body?.alreadyCheckedIn,
      alreadyB: claim2b.body?.alreadyCheckedIn,
    });

    const statusAfter = await fetchJson("/api/checkin/status", { headers: authH });
    step("today_checked_in_after_claim", statusAfter.body?.todayCheckedIn === true, {
      todayCheckedIn: statusAfter.body?.todayCheckedIn,
    });

    const rewards = await fetchJson("/api/checkin/rewards", { headers: authH });
    const milestones = rewards.body?.milestones || [];
    step("rewards_loaded", rewards.status === 200 && Array.isArray(milestones), {
      streak: rewards.body?.streak,
      milestoneCount: milestones.length,
      claimedCount: milestones.filter((m) => m.claimed).length,
    });
  } else if (!ALLOW_MUTATION) {
    step("claim_skipped", true, { reason: "BLOCKMINER_QA_ALLOW_MUTATION not set" });
  }

  const uid = QA_USER_ID || loginResult.userId;
  if (process.env.BLOCKMINER_QA_DB_VIA_DOCKER === "1" && uid) {
    const root = process.env.BLOCKMINER_VM_APP_ROOT || "/root/block-miner-v3";
    const sql = `
SELECT count(*)::text AS dup_checkins FROM (
  SELECT user_id, checkin_date FROM daily_checkins
  GROUP BY user_id, checkin_date HAVING count(*) > 1
) t;
SELECT count(*)::text AS dup_grants FROM (
  SELECT user_id, milestone_id FROM user_checkin_streak_rewards
  GROUP BY user_id, milestone_id HAVING count(*) > 1
) t;
SELECT count(*)::text AS user_dup FROM (
  SELECT user_id, checkin_date FROM daily_checkins WHERE user_id = ${Number(uid)}
  GROUP BY user_id, checkin_date HAVING count(*) > 1
) t;
`;
    const r = spawnSync(
      "docker",
      ["compose", "-f", `${root}/docker-compose.yml`, "exec", "-T", "db", "psql", "-U", "blockminer", "-d", "blockminer_db", "-tAc", sql],
      { encoding: "utf8", cwd: root },
    );
    const lines = (r.stdout || "").trim().split("\n").filter(Boolean);
    const dupGlobal = lines[0] === "0";
    const dupGrants = lines[1] === "0";
    const dupUser = lines[2] === "0";
    step("db_no_duplicate_checkins_global", dupGlobal, { count: lines[0] });
    step("db_no_duplicate_grants_global", dupGrants, { count: lines[1] });
    step("db_no_duplicate_checkins_qa_user", dupUser, { count: lines[2] });
  }

  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.pass ? 0 : 1);
}

main().catch((e) => {
  console.log(JSON.stringify({ ...summary, fatal: e?.message || String(e) }, null, 2));
  process.exit(1);
});
