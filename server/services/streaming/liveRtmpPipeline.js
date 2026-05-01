import loggerLib from "../../utils/logger.js";

const logger = loggerLib.child("LiveRtmpPipeline");

/**
 * The old RTMP capture path launched Chromium through Playwright and captured
 * it with Xvfb/ffmpeg. That made the production image too heavy, so the route
 * now fails explicitly instead of pulling a browser into the app container.
 *
 * @param {object} opts
 * @param {string} opts.captureUrl
 */
export async function startLiveRtmpPipeline(opts = {}) {
  logger.warn("live RTMP capture unavailable: Chromium/Playwright dependency was removed", {
    captureUrl: opts.captureUrl,
  });

  if (process.platform === "win32") {
    throw new Error("STREAM_UNSUPPORTED_OS");
  }

  throw new Error("STREAM_CAPTURE_BROWSER_REMOVED");
}
