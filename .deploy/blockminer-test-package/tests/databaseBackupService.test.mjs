import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";
import os from "os";
import {
  scanPlainPgDumpForCopyLines,
  metaPathForSqlFile,
  sanitizeDatabaseUrlForPgDump,
  CRITICAL_PUBLIC_TABLES,
  resolveBackupDownloadPath,
  isSafePublicTableNameForRowCount,
  collectPublicTableExactRowCounts,
} from "../server/services/databaseBackupService.js";

describe("databaseBackupService", () => {
  it("scanPlainPgDumpForCopyLines detects pg_dump header and COPY public.* lines", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bm-dump-"));
    const file = path.join(dir, "t.sql");
    const lines = [
      "--",
      "-- PostgreSQL database dump",
      "--",
      "SET statement_timeout = 0;",
      "COPY public.users (id) FROM stdin;",
      "\\.",
      "COPY public.transactions (id) FROM stdin;",
      "\\.",
      "COPY public.user_vault (id) FROM stdin;",
      "\\.",
      "COPY public.user_owned_machines (id) FROM stdin;",
      "\\.",
      "COPY public.miners (id) FROM stdin;",
      "\\.",
      "COPY public.internal_offerwall_offers (id) FROM stdin;",
      "\\.",
    ];
    await fs.writeFile(file, `${lines.join("\n")}\n`, "utf8");
    const r = await scanPlainPgDumpForCopyLines(file, CRITICAL_PUBLIC_TABLES);
    assert.equal(r.headerOk, true);
    assert.equal(r.found.size, CRITICAL_PUBLIC_TABLES.length);
    assert.ok(r.copyPublicLineCount >= CRITICAL_PUBLIC_TABLES.length);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("metaPathForSqlFile uses stem next to .sql file", () => {
    const p = metaPathForSqlFile("/data/backups", "backup-2026-04-13T12-00-00-000Z.sql");
    assert.equal(p, path.join("/data/backups", "backup-2026-04-13T12-00-00-000Z.meta.json"));
  });

  it("sanitizeDatabaseUrlForPgDump removes Prisma schema query param", () => {
    const raw =
      "postgresql://user:secret@db:5432/blockminer_db?schema=public";
    assert.equal(
      sanitizeDatabaseUrlForPgDump(raw),
      "postgresql://user:secret@db:5432/blockminer_db",
    );
  });

  it("sanitizeDatabaseUrlForPgDump keeps other query params", () => {
    const raw =
      "postgresql://user:secret@db:5432/blockminer_db?schema=public&sslmode=require";
    assert.equal(
      sanitizeDatabaseUrlForPgDump(raw),
      "postgresql://user:secret@db:5432/blockminer_db?sslmode=require",
    );
  });

  it("isSafePublicTableNameForRowCount accepts snake_case and rejects injection-like names", () => {
    assert.equal(isSafePublicTableNameForRowCount("users"), true);
    assert.equal(isSafePublicTableNameForRowCount("user_owned_machines"), true);
    assert.equal(isSafePublicTableNameForRowCount("Users"), false);
    assert.equal(isSafePublicTableNameForRowCount("user;select"), false);
    assert.equal(isSafePublicTableNameForRowCount(""), false);
  });

  it("collectPublicTableExactRowCounts aggregates totals", async () => {
    const prisma = {
      $queryRawUnsafe: async (sql) => {
        if (sql === "SELECT COUNT(*)::bigint AS c FROM public.alpha") return [{ c: 2n }];
        if (sql === "SELECT COUNT(*)::bigint AS c FROM public.beta") return [{ c: 0n }];
        throw new Error(`unexpected sql: ${sql}`);
      },
    };
    const r = await collectPublicTableExactRowCounts(prisma, ["alpha", "beta"]);
    assert.equal(r.totalDataRows, 2);
    assert.equal(r.publicTablesWithRows, 1);
    assert.equal(r.publicTablesEmpty, 1);
    assert.equal(r.rowCountByTable.alpha, 2);
    assert.equal(r.rowCountByTable.beta, 0);
  });

  it("resolveBackupDownloadPath rejects traversal-looking names", async () => {
    const prev = process.env.BACKUP_DIR;
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bm-bk-"));
    process.env.BACKUP_DIR = dir;
    const okName = "backup-testcase-20260101-120000.sql";
    await fs.writeFile(path.join(dir, okName), "-- dump\n", "utf8");

    const resolved = await resolveBackupDownloadPath(okName);
    assert.ok(resolved.includes(okName));

    await assert.rejects(() => resolveBackupDownloadPath("../outside.sql"), (e) => e.message === "Invalid backup filename");
    await assert.rejects(() => resolveBackupDownloadPath("not-backup.sql"), (e) => e.message === "Invalid backup filename");

    process.env.BACKUP_DIR = prev;
    await fs.rm(dir, { recursive: true, force: true });
  });
});
