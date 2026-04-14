/**
 * PostgreSQL full logical backups via pg_dump (plain SQL).
 * Replaces legacy mock writes that produced unusable tiny .sql files.
 */
import path from "path";
import fs from "fs/promises";
import { createReadStream } from "fs";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import readline from "readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Tables we assert appear as COPY targets in a successful plain dump (public schema). */
export const CRITICAL_PUBLIC_TABLES = [
  "users",
  "transactions",
  "user_vault",
  "user_owned_machines",
  "miners",
  "internal_offerwall_offers",
];

export function getAdminBackupsDirectory() {
  const fromEnv = String(process.env.BACKUP_DIR || "").trim();
  if (fromEnv) {
    return path.resolve(fromEnv);
  }
  return path.resolve(__dirname, "../../backups");
}

export function metaPathForSqlFile(backupsDir, sqlFileName) {
  const stem = sqlFileName.replace(/\.sql$/i, "");
  return path.join(backupsDir, `${stem}.meta.json`);
}

/**
 * Prisma appends `?schema=public` (and similar) to `DATABASE_URL`. libpq used by `pg_dump` rejects
 * unknown URI query parameters such as `schema` with: invalid uri query parameter "schema".
 * @param {string} raw
 * @returns {string}
 */
export function sanitizeDatabaseUrlForPgDump(raw) {
  const s = String(raw || "").trim();
  if (!s) return s;
  try {
    const u = new URL(s);
    u.searchParams.delete("schema");
    return u.toString();
  } catch {
    return s
      .replace(/[?&]schema=[^&]*/gi, "")
      .replace(/\?&/, "?")
      .replace(/&&/g, "&")
      .replace(/\?$/, "");
  }
}

function safeBackupSqlName(name) {
  if (!name || typeof name !== "string") return null;
  if (name.includes("..") || name.includes("/") || name.includes("\\")) return null;
  if (!/^backup-.+\.sql$/i.test(name)) return null;
  return name;
}

/**
 * @param {string} filePath
 * @param {string[]} criticalTables
 * @returns {Promise<{ found: Set<string>, copyPublicLineCount: number, headerOk: boolean }>}
 */
export async function scanPlainPgDumpForCopyLines(filePath, criticalTables) {
  const found = new Set();
  let copyPublicLineCount = 0;
  let headerOk = false;

  const stream = createReadStream(filePath, { encoding: "utf8", highWaterMark: 1024 * 1024 });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  try {
    for await (const line of rl) {
      if (!headerOk && line.includes("PostgreSQL database dump")) {
        headerOk = true;
      }
      if (line.startsWith("COPY public.")) {
        copyPublicLineCount += 1;
        for (const t of criticalTables) {
          if (line.startsWith(`COPY public.${t} `) || line.startsWith(`COPY public.${t}\t`)) {
            found.add(t);
          }
        }
        if (found.size === criticalTables.length) {
          break;
        }
      }
    }
  } finally {
    rl.close();
    stream.destroy();
  }

  return { found, copyPublicLineCount, headerOk };
}

async function countPublicTables(prisma) {
  const rows = await prisma.$queryRaw`
    SELECT tablename
    FROM pg_catalog.pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `;
  return rows.map((r) => r.tablename);
}

function runPgDumpToFile({ pgDumpPath, databaseUrl, outFile }) {
  return new Promise((resolve, reject) => {
    const args = [
      "--format=p",
      "--encoding=UTF8",
      "--no-owner",
      "--no-acl",
      "--file",
      outFile,
      "--dbname",
      databaseUrl,
    ];

    const child = spawn(pgDumpPath, args, {
      stdio: ["ignore", "ignore", "pipe"],
      env: { ...process.env },
    });

    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk || "");
      if (stderr.length > 400_000) {
        stderr = stderr.slice(-200_000);
      }
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to start pg_dump: ${err.message}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stderr });
      } else {
        reject(new Error(`pg_dump exited with code ${code}: ${stderr.slice(-8000) || "no stderr"}`));
      }
    });
  });
}

/**
 * @param {{ prisma: import('@prisma/client').PrismaClient, logger?: { info?: Function, warn?: Function, error?: Function } }} opts
 */
export async function createPostgresSqlBackup(opts) {
  const { prisma, logger } = opts;
  const started = Date.now();
  const databaseUrl = sanitizeDatabaseUrlForPgDump(String(process.env.DATABASE_URL || "").trim());
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const pgDumpPath = String(process.env.PG_DUMP_PATH || "pg_dump").trim() || "pg_dump";
  const backupsDir = getAdminBackupsDirectory();
  await fs.mkdir(backupsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `backup-${timestamp}.sql`;
  const outFile = path.join(backupsDir, filename);

  const publicTables = await countPublicTables(prisma);
  const publicTableCount = publicTables.length;

  logger?.info?.("admin_backup_start", { filename, backupsDir, pgDumpPath, publicTableCount });

  try {
    await runPgDumpToFile({ pgDumpPath, databaseUrl, outFile });
  } catch (err) {
    logger?.error?.("admin_backup_pg_dump_failed", { message: err?.message || String(err) });
    try {
      await fs.unlink(outFile);
    } catch {
      // ignore
    }
    throw err;
  }

  const stat = await fs.stat(outFile);
  const sizeBytes = stat.size;
  if (sizeBytes < 256) {
    try {
      await fs.unlink(outFile);
    } catch {
      // ignore
    }
    const msg = "Backup file is too small; pg_dump likely failed silently";
    logger?.error?.("admin_backup_too_small", { sizeBytes });
    throw new Error(msg);
  }

  const scan = await scanPlainPgDumpForCopyLines(outFile, CRITICAL_PUBLIC_TABLES);
  const missingCritical = CRITICAL_PUBLIC_TABLES.filter((t) => !scan.found.has(t));

  if (!scan.headerOk) {
    try {
      await fs.unlink(outFile);
    } catch {
      // ignore
    }
    throw new Error("Backup file does not look like a PostgreSQL plain-format dump");
  }

  if (missingCritical.length > 0) {
    try {
      await fs.unlink(outFile);
    } catch {
      // ignore
    }
    throw new Error(`Backup validation failed: missing COPY sections for: ${missingCritical.join(", ")}`);
  }

  const durationMs = Date.now() - started;
  const manifest = {
    version: 1,
    filename,
    createdAt: new Date().toISOString(),
    status: "success",
    sizeBytes,
    durationMs,
    publicTableCount,
    copyPublicLineCount: scan.copyPublicLineCount,
    criticalTablesPresent: [...scan.found],
    pgDumpPath,
  };

  await fs.writeFile(metaPathForSqlFile(backupsDir, filename), JSON.stringify(manifest, null, 2), "utf8");

  logger?.info?.("admin_backup_success", {
    filename,
    sizeBytes,
    durationMs,
    publicTableCount,
    copyPublicLineCount: scan.copyPublicLineCount,
  });

  return {
    name: filename,
    size: sizeBytes,
    created: stat.mtime.toISOString(),
    status: "success",
    durationMs,
    publicTableCount,
    copyPublicLineCount: scan.copyPublicLineCount,
    criticalTablesPresent: manifest.criticalTablesPresent,
  };
}

export async function listSqlBackups() {
  const backupsDir = getAdminBackupsDirectory();
  await fs.mkdir(backupsDir, { recursive: true });
  const names = await fs.readdir(backupsDir);
  const backups = [];

  for (const name of names) {
    if (!name.endsWith(".sql")) continue;
    if (!/^backup-.+\.sql$/i.test(name)) continue;

    const full = path.join(backupsDir, name);
    const stat = await fs.stat(full);
    let status = "unknown";
    let publicTableCount = null;
    let durationMs = null;
    let copyPublicLineCount = null;
    let criticalTablesPresent = null;

    try {
      const raw = await fs.readFile(metaPathForSqlFile(backupsDir, name), "utf8");
      const meta = JSON.parse(raw);
      if (meta && typeof meta === "object") {
        if (meta.status === "success" || meta.status === "failed") {
          status = meta.status;
        }
        if (Number.isFinite(meta.publicTableCount)) publicTableCount = meta.publicTableCount;
        if (Number.isFinite(meta.durationMs)) durationMs = meta.durationMs;
        if (Number.isFinite(meta.copyPublicLineCount)) copyPublicLineCount = meta.copyPublicLineCount;
        if (Array.isArray(meta.criticalTablesPresent)) criticalTablesPresent = meta.criticalTablesPresent;
      }
    } catch {
      // no meta: legacy / manual file
      if (stat.size < 512 && name.endsWith(".sql")) {
        try {
          const head = await fs.readFile(full, "utf8");
          if (head.includes("Mock DB Backup")) {
            status = "legacy_mock";
          } else {
            status = "legacy";
          }
        } catch {
          status = "legacy";
        }
      } else {
        status = "legacy";
      }
    }

    backups.push({
      name,
      size: stat.size,
      created: stat.mtime.toISOString(),
      status,
      publicTableCount,
      durationMs,
      copyPublicLineCount,
      criticalTablesPresent,
    });
  }

  backups.sort((a, b) => new Date(b.created) - new Date(a.created));
  return { backupsDir, backups };
}

export async function deleteSqlBackup(filename) {
  const safe = safeBackupSqlName(filename);
  if (!safe) {
    throw new Error("Invalid backup filename");
  }
  const backupsDir = getAdminBackupsDirectory();
  const full = path.join(backupsDir, safe);
  await fs.unlink(full);
  try {
    await fs.unlink(metaPathForSqlFile(backupsDir, safe));
  } catch {
    // ignore
  }
}

export async function resolveBackupDownloadPath(filename) {
  const safe = safeBackupSqlName(filename);
  if (!safe) {
    const err = new Error("Invalid backup filename");
    err.code = "EINVAL";
    throw err;
  }
  const backupsDir = getAdminBackupsDirectory();
  const full = path.join(backupsDir, safe);
  try {
    await fs.access(full);
  } catch {
    const err = new Error("Backup file not found");
    err.code = "ENOENT";
    throw err;
  }
  return full;
}
