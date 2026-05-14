/**
 * Utilities for reading, parsing and summarising structured log files
 * from the storage/logs directory hierarchy.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { Dirent } from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type LogCategoryKey = "audit" | "critical" | "general" | "security" | "transactions";

export const LOG_CATEGORY_DIRS: Readonly<Record<LogCategoryKey, string>> = Object.freeze({
  audit: path.join(__dirname, "..", "storage", "logs", "audit"),
  critical: path.join(__dirname, "..", "storage", "logs", "critical"),
  general: path.join(__dirname, "..", "storage", "logs", "general"),
  security: path.join(__dirname, "..", "storage", "logs", "security"),
  transactions: path.join(__dirname, "..", "storage", "logs", "transactions"),
});

export const LOG_LEVEL_SET = new Set(["ERROR", "WARN", "INFO", "DEBUG"] as const);

const LOG_LINE_REGEX = /^\[([^\]]+)]\s+\[([^\]]+)]\s+\[([^\]]+)]\s+([\s\S]*)$/;

export function parseCsvList(value: unknown): string[] {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function parseDateQuery(value: unknown): number | null {
  if (!value) return null;
  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    return asNumber;
  }

  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export type ParsedLogLine = {
  timestamp: number | null;
  level: string;
  module: string;
  message: string;
  details: string | Record<string, unknown> | null;
  category: string;
  file: string;
};

export function parseLogLine(rawLine: unknown, category: string, fileName: string): ParsedLogLine | null {
  const line = String(rawLine || "").trim();
  if (!line) return null;

  const match = line.match(LOG_LINE_REGEX);
  if (!match) {
    return {
      timestamp: null,
      level: "INFO",
      module: "Unknown",
      message: line,
      details: null,
      category,
      file: fileName,
    };
  }

  const timestampRaw = match[1] || "";
  const levelRaw = String(match[2] || "INFO").toUpperCase();
  const moduleName = match[3] || "Unknown";
  const payload = match[4] || "";
  const separatorIndex = payload.indexOf(" | ");
  const message = separatorIndex >= 0 ? payload.slice(0, separatorIndex).trim() : payload.trim();
  const detailsRaw = separatorIndex >= 0 ? payload.slice(separatorIndex + 3).trim() : "";

  let details: string | Record<string, unknown> | null = null;
  if (detailsRaw) {
    try {
      const parsed: unknown = JSON.parse(detailsRaw);
      details = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : String(parsed);
    } catch {
      details = detailsRaw;
    }
  }

  const timestampMs = Date.parse(timestampRaw);

  return {
    timestamp: Number.isFinite(timestampMs) ? timestampMs : null,
    level: LOG_LEVEL_SET.has(levelRaw as "ERROR" | "WARN" | "INFO" | "DEBUG") ? levelRaw : "INFO",
    module: moduleName,
    message,
    details,
    category,
    file: fileName,
  };
}

export type LogFileListItem = {
  name: string;
  filePath: string;
  modifiedAt: number;
};

export async function listCategoryLogFiles(category: string): Promise<LogFileListItem[]> {
  const categoryDir = LOG_CATEGORY_DIRS[category as LogCategoryKey];
  if (!categoryDir) return [];

  const entries = await fs.readdir(categoryDir, { withFileTypes: true }).catch(() => [] as Dirent[]);
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => /\.log(\.\d+)?$/i.test(name));

  const filesWithStats = await Promise.all(
    files.map(async (name) => {
      const filePath = path.join(categoryDir, name);
      const stat = await fs.stat(filePath).catch(() => null);
      return {
        name,
        filePath,
        modifiedAt: Number(stat?.mtimeMs || 0),
      };
    }),
  );

  return filesWithStats.filter((item) => item.modifiedAt > 0).sort((a, b) => b.modifiedAt - a.modifiedAt);
}

export async function readTailLines(
  filePath: string,
  maxLines = 400,
  maxBytes = 256 * 1024,
): Promise<string[]> {
  const handle = await fs.open(filePath, "r");
  try {
    const stat = await handle.stat();
    const fileSize = Number(stat?.size || 0);
    if (fileSize <= 0) return [];

    const readSize = Math.min(fileSize, maxBytes);
    const start = Math.max(0, fileSize - readSize);
    const buffer = Buffer.alloc(readSize);
    await handle.read(buffer, 0, readSize, start);

    const text = buffer.toString("utf8");
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length <= maxLines) {
      return lines;
    }

    return lines.slice(lines.length - maxLines);
  } finally {
    await handle.close();
  }
}

export type LogSummaryBucket = {
  timestamp: number;
  total: number;
  errors: number;
  warnings: number;
  byCategory: Record<string, number>;
};

export type LogSummaryResult = {
  total: number;
  byLevel: Record<"ERROR" | "WARN" | "INFO" | "DEBUG", number>;
  byCategory: Record<string, number>;
  peakErrorBucket: LogSummaryBucket | null;
  bucketMinutes: number;
  series: LogSummaryBucket[];
};

export function buildLogSummary(
  events: Array<ParsedLogLine | null | undefined>,
  categories: string[],
  bucketMinutes: number,
): LogSummaryResult {
  const byLevel: Record<"ERROR" | "WARN" | "INFO" | "DEBUG", number> = { ERROR: 0, WARN: 0, INFO: 0, DEBUG: 0 };
  const byCategory: Record<string, number> = Object.fromEntries(categories.map((c) => [c, 0]));
  const bucketSizeMs = Math.max(1, bucketMinutes) * 60 * 1000;
  const buckets = new Map<number, LogSummaryBucket>();

  for (const event of events) {
    if (!event) continue;

    if (byLevel[event.level as keyof typeof byLevel] !== undefined) {
      byLevel[event.level as keyof typeof byLevel] += 1;
    }

    if (byCategory[event.category] !== undefined) {
      byCategory[event.category] += 1;
    }

    if (!event.timestamp) continue;
    const bucketTs = Math.floor(event.timestamp / bucketSizeMs) * bucketSizeMs;
    const bucket =
      buckets.get(bucketTs) ||
      ({
        timestamp: bucketTs,
        total: 0,
        errors: 0,
        warnings: 0,
        byCategory: Object.fromEntries(categories.map((c) => [c, 0])),
      } satisfies LogSummaryBucket);

    bucket.total += 1;
    if (event.level === "ERROR") bucket.errors += 1;
    if (event.level === "WARN") bucket.warnings += 1;
    bucket.byCategory[event.category] = Number(bucket.byCategory[event.category] || 0) + 1;
    buckets.set(bucketTs, bucket);
  }

  const series = Array.from(buckets.values()).sort((a, b) => a.timestamp - b.timestamp);
  const peakErrorBucket = series.reduce<LogSummaryBucket | null>(
    (best, current) => (current.errors > (best?.errors ?? 0) ? current : best),
    null,
  );

  return {
    total: events.length,
    byLevel,
    byCategory,
    peakErrorBucket,
    bucketMinutes,
    series,
  };
}
