import { spawnSync } from "child_process";

/**
 * @param {string} cmd
 * @returns {boolean}
 */
function commandExists(cmd) {
  const which = process.platform === "win32" ? "where" : "which";
  const r = spawnSync(which, [cmd], { encoding: "utf8" });
  return r.status === 0;
}

/**
 * @returns {{ ok: boolean, issues: string[] }}
 */
export function checkStreamCaptureEnvironment() {
  const issues: string[] = [];
  if (process.platform === "win32") {
    issues.push("Windows is not supported for X11 capture; use Linux (VPS) with Xvfb.");
  }
  if (!commandExists("ffmpeg")) {
    issues.push("ffmpeg is not installed or not on PATH.");
  }
  if (process.platform !== "win32" && !commandExists("Xvfb")) {
    issues.push("Xvfb is not installed or not on PATH (required for browser capture).");
  }
  return { ok: issues.length === 0, issues };
}
