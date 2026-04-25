import { spawn } from "child_process";
import loggerLib from "../../utils/logger.js";

const logger = loggerLib.child("LiveRtmpPipeline");

/**
 * @param {import('playwright').Page} page
 */
async function tryCdpWindowFullscreen(page) {
  const session = await page.context().newCDPSession(page);
  const { targetInfo } = await session.send("Target.getTargetInfo");
  const targetId = targetInfo.targetId;
  const { windowId } = await session.send("Browser.getWindowForTarget", { targetId });
  await session.send("Browser.setWindowBounds", {
    windowId,
    bounds: { windowState: "fullscreen" }
  });
}

/**
 * @param {import('playwright').Page} page
 */
async function tryOsFullscreenKeys(page) {
  await page.bringToFront().catch(() => {});
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press("F11").catch(() => {});
    await new Promise((r) => setTimeout(r, 700));
  }
}

/**
 * @param {object} opts
 * @param {string} opts.captureUrl
 * @param {string} opts.rtmpOutUrl
 * @param {string} opts.display
 * @param {number} opts.width
 * @param {number} opts.height
 * @param {number} opts.videoBitrateK
 * @param {number} opts.audioBitrateK
 * @param {(line: string) => void} [opts.onFfmpegLog]
 * @returns {Promise<{ stop: () => Promise<void>, ffmpegProcess: import('child_process').ChildProcessWithoutNullStreams, xvfbProcess: import('child_process').ChildProcessWithoutNullStreams }>}
 */
export async function startLiveRtmpPipeline(opts) {
  const { captureUrl, rtmpOutUrl, display, width, height, videoBitrateK, audioBitrateK, onFfmpegLog } = opts;

  if (process.platform === "win32") {
    throw new Error("STREAM_UNSUPPORTED_OS");
  }

  const streamDisabled = String(process.env.STREAM_CAPTURE_DISABLED || "")
    .trim()
    .toLowerCase();
  if (streamDisabled === "1" || streamDisabled === "true") {
    throw new Error("STREAM_CAPTURE_DISABLED");
  }

  const xvfb = spawn("Xvfb", [display, "-screen", "0", `${width}x${height}x24`, "-ac", "+extension", "RANDR"], {
    stdio: "ignore",
    detached: false
  });

  await new Promise((r) => setTimeout(r, 900));

  if (xvfb.exitCode !== null && xvfb.exitCode !== 0) {
    throw new Error("Xvfb failed to start.");
  }

  const browserEnv = { ...process.env, DISPLAY: display };

  let browser;
  let ffmpeg;
  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({
      headless: false,
      env: browserEnv,
      ignoreDefaultArgs: ["--enable-automation"],
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-infobars",
        "--disable-session-crashed-bubble",
        "--disable-features=TranslateUI",
        "--disable-blink-features=AutomationControlled",
        `--window-size=${width},${height}`,
        "--window-position=0,0",
        "--start-fullscreen",
        // Prefer kiosk; CDP + F11 below cover Playwright builds that still show browser chrome.
        "--kiosk"
      ]
    });
    const context = await browser.newContext({
      viewport: null,
      ignoreHTTPSErrors: true
    });
    const page = await context.newPage();
    await page.goto(captureUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page
      .evaluate(async () => {
        /* global document */
        try {
          const el = document.documentElement;
          if (el.requestFullscreen) await el.requestFullscreen();
        } catch {
          /* ignore — may require user gesture in some browsers */
        }
      })
      .catch(() => {});

    try {
      await tryCdpWindowFullscreen(page);
    } catch (e) {
      logger.warn("cdp window fullscreen failed", { error: String(e?.message || e) });
    }
    try {
      await tryOsFullscreenKeys(page);
    } catch (e) {
      logger.warn("keyboard fullscreen failed", { error: String(e?.message || e) });
    }

    const ffmpegInput = `${display}.0+0,0`;
    const buf = Math.max(1000, Math.floor(videoBitrateK * 2));
    ffmpeg = spawn(
      "ffmpeg",
      [
        "-y",
        "-f",
        "x11grab",
        "-video_size",
        `${width}x${height}`,
        "-framerate",
        "30",
        "-i",
        ffmpegInput,
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=44100:cl=stereo",
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-tune",
        "zerolatency",
        "-pix_fmt",
        "yuv420p",
        "-b:v",
        `${videoBitrateK}k`,
        "-maxrate",
        `${videoBitrateK}k`,
        "-bufsize",
        `${buf}k`,
        "-g",
        "60",
        "-c:a",
        "aac",
        "-b:a",
        `${audioBitrateK}k`,
        "-f",
        "flv",
        rtmpOutUrl
      ],
      { stdio: ["ignore", "ignore", "pipe"], env: browserEnv }
    );

    ffmpeg.stderr?.on("data", (chunk) => {
      const line = String(chunk);
      if (onFfmpegLog) onFfmpegLog(line.slice(0, 500));
    });

    await new Promise((r) => setTimeout(r, 3500));
    if (ffmpeg.exitCode !== null) {
      throw new Error(`ffmpeg exited with code ${ffmpeg.exitCode}`);
    }
  } catch (e) {
    try {
      if (ffmpeg && !ffmpeg.killed) ffmpeg.kill("SIGINT");
    } catch {
      /* ignore */
    }
    try {
      if (browser) await browser.close();
    } catch {
      /* ignore */
    }
    try {
      if (xvfb && !xvfb.killed) xvfb.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    throw e instanceof Error ? e : new Error(String(e));
  }

  const stop = async () => {
    try {
      if (ffmpeg && !ffmpeg.killed) ffmpeg.kill("SIGINT");
    } catch {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, 400));
    try {
      if (browser) await browser.close();
    } catch {
      /* ignore */
    }
    try {
      if (xvfb && !xvfb.killed) xvfb.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, 200));
  };

  return { stop, ffmpegProcess: ffmpeg, xvfbProcess: xvfb };
}
