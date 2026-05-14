import type { ChildProcessWithoutNullStreams } from "node:child_process";
import loggerLib from "../../utils/logger.js";

const logger = loggerLib.child("LiveRtmpPipeline");

export type LiveRtmpPipelineOpts = {
  captureUrl?: string;
  rtmpOutUrl?: string;
  display?: string;
  width?: number | null;
  height?: number | null;
  videoBitrateK?: number | null;
  audioBitrateK?: number | null;
  onFfmpegLog?: (line: string) => void;
};

export type LivePipelineHandle = {
  stop: () => Promise<void>;
  ffmpegProcess: ChildProcessWithoutNullStreams | null;
};

/**
 * The old RTMP capture path launched Chromium through Playwright and captured
 * it with Xvfb/ffmpeg. That made the production image too heavy, so the route
 * now fails explicitly instead of pulling a browser into the app container.
 */
export async function startLiveRtmpPipeline(opts: LiveRtmpPipelineOpts = {}): Promise<LivePipelineHandle> {
  logger.warn("live RTMP capture unavailable: Chromium/Playwright dependency was removed", {
    captureUrl: opts.captureUrl,
  });

  if (process.platform === "win32") {
    throw new Error("STREAM_UNSUPPORTED_OS");
  }

  throw new Error("STREAM_CAPTURE_BROWSER_REMOVED");
}
