import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";
import os from "os";
import {
  scanPlainPgDumpForCopyLines,
  metaPathForSqlFile,
  CRITICAL_PUBLIC_TABLES,
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
});
