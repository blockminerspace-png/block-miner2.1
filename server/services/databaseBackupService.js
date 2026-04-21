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

export function bundlePathForSqlFile(backupsDir, sqlFileName) {
  const stem = sqlFileName.replace(/\.sql$/i, "");
  return path.join(backupsDir, `${stem}.bundle.tar.gz`);
}

export function safeBackupBundleName(name) {
  if (!name || typeof name !== "string") return null;
  if (name.includes("..") || name.includes("/") || name.includes("\\")) return null;
  if (!/^backup-.+\.bundle\.tar\.gz$/i.test(name)) return null;
  return name;
}

function getAdditionalBackupTargets() {
  const candidates = [
    ".env",
    ".env.production",
    "uploads",
    "server/storage",
    "server/prisma",
    "client/public",
    "config",
    "scripts",
    "docs",
    ".env.example",
    ".env.production.example",
    "deploy.secrets.example",
    "docker-compose.yml",
    "docker-compose.local.yml",
    "Dockerfile",
    "nginx",
    "k8s",
  ];
  return candidates;
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

/** pg_tables names in public for this project are snake_case; reject anything else before raw SQL. */
export function isSafePublicTableNameForRowCount(name) {
  return typeof name === "string" && /^[a-z][a-z0-9_]*$/.test(name);
}

/**
 * Exact row counts per table (sequential COUNT(*)). Reassures admins the dump matches live data volume.
 * Set BACKUP_SKIP_ROW_COUNT_AUDIT=1 to skip on very large databases.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string[]} tableNames
 */
export async function collectPublicTableExactRowCounts(prisma, tableNames) {
  const rowCountByTable = {};
  let totalDataRows = 0;
  for (const name of tableNames) {
    if (!isSafePublicTableNameForRowCount(name)) {
      throw new Error(`Refusing row count on invalid table name: ${name}`);
    }
    const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::bigint AS c FROM public.${name}`);
    const c = Number(rows[0]?.c ?? 0);
    rowCountByTable[name] = c;
    totalDataRows += c;
  }
  const publicTablesWithRows = Object.values(rowCountByTable).filter((n) => n > 0).length;
  const publicTablesEmpty = tableNames.length - publicTablesWithRows;
  const criticalRowCounts = {};
  for (const t of CRITICAL_PUBLIC_TABLES) {
    if (Object.prototype.hasOwnProperty.call(rowCountByTable, t)) {
      criticalRowCounts[t] = rowCountByTable[t];
    }
  }
  return { rowCountByTable, totalDataRows, publicTablesWithRows, publicTablesEmpty, criticalRowCounts };
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

function runTarBundleToFile({ outFile, relativeTargets }) {
  return new Promise((resolve, reject) => {
    const args = ["-czf", outFile, ...relativeTargets];
    const child = spawn("tar", args, {
      cwd: path.resolve(__dirname, "../.."),
      stdio: ["ignore", "ignore", "pipe"],
      env: { ...process.env },
    });
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk || "");
      if (stderr.length > 400_000) stderr = stderr.slice(-200_000);
    });
    child.on("error", (err) => reject(new Error(`Failed to start tar: ${err.message}`)));
    child.on("close", (code) => {
      if (code === 0) resolve({ stderr });
      else reject(new Error(`tar exited with code ${code}: ${stderr.slice(-8000) || "no stderr"}`));
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
  const bundleFile = bundlePathForSqlFile(backupsDir, filename);

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

  let rowCountAudit = null;
  const skipRowAudit = String(process.env.BACKUP_SKIP_ROW_COUNT_AUDIT || "").trim() === "1";
  if (!skipRowAudit) {
    const rowStarted = Date.now();
    try {
      rowCountAudit = await collectPublicTableExactRowCounts(prisma, publicTables);
      rowCountAudit.durationMs = Date.now() - rowStarted;
      rowCountAudit.mode = "exact_count";
    } catch (err) {
      logger?.warn?.("admin_backup_row_count_audit_failed", { message: err?.message || String(err) });
      rowCountAudit = { error: err?.message || String(err), mode: "failed" };
    }
  } else {
    rowCountAudit = { mode: "skipped", reason: "BACKUP_SKIP_ROW_COUNT_AUDIT=1" };
  }

  const durationMs = Date.now() - started;
  let bundle = null;
  try {
    const rootDir = path.resolve(__dirname, "../..");
    const relativeTargets = [];
    for (const rel of getAdditionalBackupTargets()) {
      try {
        await fs.access(path.join(rootDir, rel));
        relativeTargets.push(rel);
      } catch {
        // ignore missing target
      }
    }
    if (relativeTargets.length) {
      await runTarBundleToFile({ outFile: bundleFile, relativeTargets });
      const bundleStat = await fs.stat(bundleFile);
      bundle = {
        name: path.basename(bundleFile),
        size: bundleStat.size,
        includedPaths: relativeTargets,
      };
    }
  } catch (err) {
    logger?.warn?.("admin_backup_bundle_failed", { message: err?.message || String(err) });
  }

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
    rowCountAudit,
    bundle,
  };

  await fs.writeFile(metaPathForSqlFile(backupsDir, filename), JSON.stringify(manifest, null, 2), "utf8");

  logger?.info?.("admin_backup_success", {
    filename,
    sizeBytes,
    durationMs,
    publicTableCount,
    copyPublicLineCount: scan.copyPublicLineCount,
    totalDataRows: rowCountAudit?.totalDataRows,
    bundleName: bundle?.name || null,
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
    totalDataRows: rowCountAudit?.totalDataRows,
    publicTablesWithRows: rowCountAudit?.publicTablesWithRows,
    publicTablesEmpty: rowCountAudit?.publicTablesEmpty,
    criticalRowCounts: rowCountAudit?.criticalRowCounts,
    rowCountAuditMode: rowCountAudit?.mode,
    bundleName: bundle?.name || null,
    bundleSize: bundle?.size || null,
    bundleIncludedPaths: bundle?.includedPaths || [],
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
    let totalDataRows = null;
    let publicTablesWithRows = null;
    let publicTablesEmpty = null;
    let criticalRowCounts = null;
    let rowCountAuditMode = null;
    let bundleName = null;
    let bundleSize = null;
    let bundleIncludedPaths = [];

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
        const audit = meta.rowCountAudit;
        if (meta.bundle && typeof meta.bundle === "object") {
          if (typeof meta.bundle.name === "string") bundleName = meta.bundle.name;
          if (Number.isFinite(meta.bundle.size)) bundleSize = meta.bundle.size;
          if (Array.isArray(meta.bundle.includedPaths)) bundleIncludedPaths = meta.bundle.includedPaths;
        }
        if (audit && typeof audit === "object" && audit.mode === "exact_count") {
          if (Number.isFinite(audit.totalDataRows)) totalDataRows = audit.totalDataRows;
          if (Number.isFinite(audit.publicTablesWithRows)) publicTablesWithRows = audit.publicTablesWithRows;
          if (Number.isFinite(audit.publicTablesEmpty)) publicTablesEmpty = audit.publicTablesEmpty;
          if (audit.criticalRowCounts && typeof audit.criticalRowCounts === "object") {
            criticalRowCounts = audit.criticalRowCounts;
          }
          rowCountAuditMode = audit.mode;
        } else if (audit && typeof audit === "object" && typeof audit.mode === "string") {
          rowCountAuditMode = audit.mode;
        }
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
      totalDataRows,
      publicTablesWithRows,
      publicTablesEmpty,
      criticalRowCounts,
      rowCountAuditMode,
      bundleName,
      bundleSize,
      bundleIncludedPaths,
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
  try {
    await fs.unlink(bundlePathForSqlFile(backupsDir, safe));
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
  const backupsDir = path.resolve(getAdminBackupsDirectory());
  const full = path.resolve(path.join(backupsDir, safe));
  const rel = path.relative(backupsDir, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    const err = new Error("Invalid backup filename");
    err.code = "EINVAL";
    throw err;
  }
  try {
    await fs.access(full);
  } catch {
    const err = new Error("Backup file not found");
    err.code = "ENOENT";
    throw err;
  }
  const realDir = await fs.realpath(backupsDir);
  const realFile = await fs.realpath(full);
  const relReal = path.relative(realDir, realFile);
  if (relReal.startsWith("..") || path.isAbsolute(relReal)) {
    const err = new Error("Invalid backup filename");
    err.code = "EINVAL";
    throw err;
  }
  return full;
}

export async function resolveBackupBundleDownloadPath(filename) {
  const safe = safeBackupBundleName(filename);
  if (!safe) {
    const err = new Error("Invalid backup bundle filename");
    err.code = "EINVAL";
    throw err;
  }
  const backupsDir = path.resolve(getAdminBackupsDirectory());
  const full = path.resolve(path.join(backupsDir, safe));
  const rel = path.relative(backupsDir, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    const err = new Error("Invalid backup bundle filename");
    err.code = "EINVAL";
    throw err;
  }
  try {
    await fs.access(full);
  } catch {
    const err = new Error("Backup bundle not found");
    err.code = "ENOENT";
    throw err;
  }
  const realDir = await fs.realpath(backupsDir);
  const realFile = await fs.realpath(full);
  const relReal = path.relative(realDir, realFile);
  if (relReal.startsWith("..") || path.isAbsolute(relReal)) {
    const err = new Error("Invalid backup bundle filename");
    err.code = "EINVAL";
    throw err;
  }
  return full;
}
