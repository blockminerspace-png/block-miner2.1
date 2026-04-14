import prisma from "../../src/db/prisma.js";
import loggerLib from "../../utils/logger.js";
import { checkStreamCaptureEnvironment } from "./streamEnvCheck.js";
import { startLiveRtmpPipeline } from "./liveRtmpPipeline.js";
import { getDecryptedStreamCredentials } from "./youtubeStreamService.js";
import {
  isPermanentStreamStartFailure,
  MAX_AUTO_RESTART_ATTEMPTS,
  restartDelayMsForAttempt
} from "./streamRestartPolicy.js";

const logger = loggerLib.child("StreamRunner");

/** @type {Map<number, { stop: () => Promise<void>, hb: ReturnType<typeof setInterval> | null, ffmpeg: import('child_process').ChildProcessWithoutNullStreams | null }>} */
const active = new Map();

/** In-flight start to avoid duplicate pipelines (watchdog + admin + retry). */
const starting = new Set();

/** @type {Map<number, ReturnType<typeof setTimeout>>} */
const pendingRestartTimers = new Map();

const WATCHDOG_MS = 60_000;
/** @type {ReturnType<typeof setInterval> | null} */
let watchdogTimer = null;

/**
 * @param {number} id
 */
async function updateRow(id, data) {
  try {
    await prisma.streamDestination.update({ where: { id }, data });
  } catch (e) {
    logger.error("streamDestination update failed", { id, error: String(e?.message || e) });
  }
}

/**
 * @param {number} id
 */
export function clearPendingStreamRestart(id) {
  const t = pendingRestartTimers.get(id);
  if (t !== undefined) {
    clearTimeout(t);
    pendingRestartTimers.delete(id);
  }
}

/** True when a backoff timer will call `startStreamForDestination` soon (avoid duplicate watchdog starts). */
export function hasPendingStreamRestart(id) {
  return pendingRestartTimers.has(id);
}

/**
 * @param {number} id
 * @param {number} attempt
 */
/**
 * @param {number} id
 * @param {number} completedAttempt last finished attempt index (-1 = none yet)
 */
function afterStreamStartFailure(id, completedAttempt) {
  void prisma.streamDestination.findUnique({ where: { id } }).then((row) => {
    if (!row?.desiredRunning || !row.enabled) return;
    scheduleDesiredStreamRestart(id, completedAttempt + 1);
  });
}

export function scheduleDesiredStreamRestart(id, attempt = 0) {
  if (attempt >= MAX_AUTO_RESTART_ATTEMPTS) {
    void updateRow(id, {
      desiredRunning: false,
      lastWorkerStatus: "ERROR",
      lastStoppedAt: new Date(),
      lastError:
        "Automatic retry limit reached. Check RTMP credentials and capture URL, then press Start again."
    });
    logger.warn("stream auto-retry limit reached", { id });
    return;
  }
  clearPendingStreamRestart(id);
  const delay = restartDelayMsForAttempt(attempt);
  const timer = setTimeout(() => {
    pendingRestartTimers.delete(id);
    void startStreamForDestination(id, { fromRetryAttempt: attempt });
  }, delay);
  pendingRestartTimers.set(id, timer);
  logger.info("scheduled stream restart", { id, delayMs: delay, attempt });
}

export async function resumeDesiredStreamsAfterBoot() {
  try {
    await reconcileAllStaleStreamDestinations();
  } catch (e) {
    logger.error("reconcile before resume failed", { error: String(e?.message || e) });
  }
  const rows = await prisma.streamDestination.findMany({
    where: { enabled: true, desiredRunning: true },
    orderBy: { id: "asc" }
  });
  for (const row of rows) {
    if (active.has(row.id) || starting.has(row.id)) continue;
    await new Promise((r) => setTimeout(r, 4000));
    await startStreamForDestination(row.id).catch((err) =>
      logger.error("boot resume stream failed", { id: row.id, error: String(err?.message || err) })
    );
  }
  if (rows.length) {
    logger.info("resume desired streams after boot", { count: rows.length });
  }
}

async function runDesiredStreamWatchdogOnce() {
  try {
    await reconcileAllStaleStreamDestinations();
  } catch (e) {
    logger.error("watchdog reconcile failed", { error: String(e?.message || e) });
  }

  let rows;
  try {
    rows = await prisma.streamDestination.findMany({
      where: { enabled: true, desiredRunning: true },
      orderBy: { id: "asc" }
    });
  } catch (e) {
    logger.error("watchdog list failed", { error: String(e?.message || e) });
    return;
  }
  for (const row of rows) {
    if (active.has(row.id) || starting.has(row.id)) continue;
    if (hasPendingStreamRestart(row.id)) continue;
    const st = String(row.lastWorkerStatus || "").toUpperCase();
    if (st === "OFFLINE" || st === "ERROR" || st === "ONLINE" || st === "STARTING") {
      logger.info("watchdog starting desired stream", { id: row.id, lastWorkerStatus: st });
      await startStreamForDestination(row.id).catch((err) =>
        logger.error("watchdog start failed", { id: row.id, error: String(err?.message || err) })
      );
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

export function startStreamDesiredWatchdog() {
  if (watchdogTimer) return;
  watchdogTimer = setInterval(() => {
    void runDesiredStreamWatchdogOnce();
  }, WATCHDOG_MS);
}

/**
 * @param {number} id
 * @param {{ fromRetryAttempt?: number }} [opts]
 */
export async function startStreamForDestination(id, opts = {}) {
  if (active.has(id)) {
    logger.info("stream already active", { id });
    return { ok: true };
  }
  if (starting.has(id)) {
    return { ok: true, message: "Start already in progress." };
  }

  starting.add(id);
  const retryParentAttempt =
    typeof opts.fromRetryAttempt === "number" ? opts.fromRetryAttempt : -1;
  try {
    const env = checkStreamCaptureEnvironment();
    if (!env.ok) {
      const msg = env.issues.join(" ");
      const row0 = await prisma.streamDestination.findUnique({ where: { id } });
      if (row0?.desiredRunning && row0.enabled) {
        await updateRow(id, {
          lastWorkerStatus: "ERROR",
          lastError: msg,
          lastStoppedAt: new Date()
        });
        afterStreamStartFailure(id, retryParentAttempt);
      } else {
        await updateRow(id, {
          desiredRunning: false,
          lastWorkerStatus: "ERROR",
          lastError: msg,
          lastStoppedAt: new Date()
        });
      }
      return { ok: false, message: msg };
    }

    const row = await prisma.streamDestination.findUnique({ where: { id } });
    if (!row || !row.enabled) {
      return { ok: false, message: "Destination disabled or not found." };
    }
    if (!row.desiredRunning) {
      return { ok: false, message: "Start not requested." };
    }

    const creds = getDecryptedStreamCredentials(row);
    if (!creds) {
      await updateRow(id, {
        desiredRunning: false,
        lastWorkerStatus: "ERROR",
        lastError: "Missing stream key or STREAM_ENCRYPTION_KEY mismatch.",
        lastStoppedAt: new Date()
      });
      return { ok: false, message: "Invalid stream key configuration." };
    }

    clearPendingStreamRestart(id);

    await updateRow(id, {
      lastWorkerStatus: "STARTING",
      lastError: null,
      lastStartedAt: new Date()
    });

    const displayNum = 90 + (id % 400);
    const display = `:${displayNum}`;

    let handle;
    try {
      let lastLog = "";
      handle = await startLiveRtmpPipeline({
        captureUrl: row.captureUrl,
        rtmpOutUrl: creds.rtmpUrl,
        display,
        width: row.videoWidth,
        height: row.videoHeight,
        videoBitrateK: row.videoBitrateK,
        audioBitrateK: row.audioBitrateK,
        onFfmpegLog: (line) => {
          lastLog = line;
        }
      });

      const ffmpeg = handle.ffmpegProcess;
      const hb = setInterval(() => {
        void updateRow(id, { lastHeartbeatAt: new Date(), lastError: null });
      }, 15000);

      ffmpeg?.once("exit", async (code) => {
        const cur = active.get(id);
        if (!cur) return;
        if (cur.hb) clearInterval(cur.hb);
        active.delete(id);
        const still = await prisma.streamDestination.findUnique({ where: { id } });
        if (!still) return;
        if (!still.desiredRunning) {
          await updateRow(id, {
            lastWorkerStatus: "OFFLINE",
            lastStoppedAt: new Date(),
            lastError: code === 0 ? null : `ffmpeg exited (${code}). ${lastLog.slice(0, 400)}`
          });
          return;
        }
        await updateRow(id, {
          lastWorkerStatus: "ERROR",
          lastStoppedAt: new Date(),
          lastError: `ffmpeg exited (${code}). Auto-retry scheduled. ${lastLog.slice(0, 350)}`
        });
        afterStreamStartFailure(id, retryParentAttempt);
      });

      active.set(id, { stop: handle.stop, hb, ffmpeg });
      await updateRow(id, {
        lastWorkerStatus: "ONLINE",
        lastHeartbeatAt: new Date(),
        lastError: null
      });
      logger.info("stream online", { id });
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error("stream start failed", { id, error: msg });
      if (handle?.stop) await handle.stop();

      const fresh = await prisma.streamDestination.findUnique({ where: { id } });
      if (isPermanentStreamStartFailure(msg) || !fresh?.desiredRunning) {
        await updateRow(id, {
          desiredRunning: false,
          lastWorkerStatus: "ERROR",
          lastError: msg.slice(0, 2000),
          lastStoppedAt: new Date()
        });
        return { ok: false, message: msg };
      }
      await updateRow(id, {
        lastWorkerStatus: "ERROR",
        lastError: msg.slice(0, 2000),
        lastStoppedAt: new Date()
      });
      afterStreamStartFailure(id, retryParentAttempt);
      return { ok: false, message: msg };
    }
  } finally {
    starting.delete(id);
  }
}

/**
 * @param {number} id
 */
export async function stopStreamForDestination(id) {
  clearPendingStreamRestart(id);
  const cur = active.get(id);
  if (cur?.hb) clearInterval(cur.hb);
  active.delete(id);
  if (cur?.stop) await cur.stop();
  await updateRow(id, {
    lastWorkerStatus: "OFFLINE",
    lastStoppedAt: new Date(),
    lastError: null
  });
  logger.info("stream stopped", { id });
}

export async function shutdownAllStreams() {
  const ids = [...active.keys()];
  for (const id of ids) {
    await stopStreamForDestination(id);
  }
}

/**
 * @param {number} id
 */
export function isStreamActive(id) {
  return active.has(id);
}

/** If DB says ONLINE/STARTING but this process has no worker (crash/restart), align DB; keep desiredRunning when admin left the stream on. */
const STALE_STARTING_MS = 120_000;

export async function reconcileStaleStreamDbState(row) {
  if (active.has(row.id)) return;
  const st = String(row.lastWorkerStatus || "").toUpperCase();
  if (st === "ONLINE") {
    if (row.desiredRunning) {
      await updateRow(row.id, {
        lastWorkerStatus: "OFFLINE",
        lastStoppedAt: new Date(),
        lastError:
          "Stream worker was lost (process or server restart). The system will try to reconnect automatically if this destination is still set to run."
      });
    } else {
      await updateRow(row.id, {
        desiredRunning: false,
        lastWorkerStatus: "OFFLINE",
        lastStoppedAt: new Date(),
        lastError:
          "Stream process is not running (server restarted or the capture worker exited). Use Start again after fixing the issue."
      });
    }
    return;
  }
  if (st === "STARTING" && row.desiredRunning) {
    const started = row.lastStartedAt instanceof Date ? row.lastStartedAt.getTime() : 0;
    if (started && Date.now() - started > STALE_STARTING_MS) {
      await updateRow(row.id, {
        lastWorkerStatus: "ERROR",
        lastStoppedAt: new Date(),
        lastError:
          "Start did not complete in time (possible hang or crash). Automatic retry will run while this destination remains enabled to run."
      });
    }
  }
}

export async function reconcileAllStaleStreamDestinations() {
  const rows = await prisma.streamDestination.findMany({ orderBy: { id: "asc" } });
  for (const row of rows) {
    await reconcileStaleStreamDbState(row);
  }
}
