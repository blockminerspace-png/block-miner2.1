# UPLOADS static + machine images fix

## 1. Root cause of `/uploads` 500

`express.static` was mounted with `fallthrough: false`. When a file was **missing**, Express forwarded a **404 error** to `apiErrorHandler`, which treated it as an unhandled error and responded with **500 Internal Server Error** for non-API paths.

**Production check (VM):**

- Existing file: `GET /uploads/miners/miner-....png` → **200**
- Missing file: `GET /uploads/arquivo-que-nao-existe.png` → **500** (before fix)

## 2. Files on container / host

| Path | State |
|------|--------|
| `/app/uploads/miners/` | Has current admin miner uploads |
| `/app/uploads/machines/` | **Empty** on VM |
| `/app/uploads/<root>.png` | Legacy URLs in DB often **missing** |

Examples from user report (`1774375603121_NovaHashCore.png`, etc.) are **not on disk** — lost in earlier deploys or never synced to volume. After this fix they return **404**, not 500; UI shows placeholder.

## 3. Physical folder

- Production volume: `./uploads` → `/app/uploads` (unchanged, has live files)
- Future standard: `./data/uploads` → `/app/data/uploads` (mounted, ready for new deploys)
- `UPLOADS_DIR=/app/uploads` set in `docker-compose.yml`
- `resolveUploadsRoot()` prefers `UPLOADS_DIR`, then legacy `./uploads`, else creates `./data/uploads`

## 4. Public URLs

| Type | URL |
|------|-----|
| Admin miners (new) | `/uploads/miners/<file>` |
| Legacy admin | `/uploads/<file>` |
| Legacy machines | `/uploads/machines/<file>` |

## 5. How `/uploads` is served now

`server/utils/uploadsStatic.ts` → `mountUploadsStatic()`:

1. `express.static(uploadRoot, { index: false, fallthrough: false })`
2. Error handler on `/uploads`: **404 JSON** (`UPLOAD_NOT_FOUND`) or **500 JSON** only for real read errors

Mounted in `server/server.ts` **before** client dist and SPA fallback.

## 6. Missing file response

```json
{ "ok": false, "code": "UPLOAD_NOT_FOUND", "message": "Arquivo não encontrado." }
```

Status **404** — not SPA HTML, not 500.

## 7. Docker persistence

```yaml
volumes:
  - ./uploads:/app/uploads
  - ./data/uploads:/app/data/uploads
environment:
  UPLOADS_DIR: /app/uploads
```

Same for `app` and `worker`.

## 8. Admin Miners

Uploads save to `data/uploads/miners/` (via `resolveUploadsSubdir(..., "miners")` under upload root) and public URL `/uploads/miners/...`.

## 9. Legacy images

- URLs `/uploads/<file>` and `/uploads/machines/<file>` still resolve under the same upload root.
- Missing files → 404 + frontend placeholder (no DB change).
- Re-upload or backfill required for files lost from volume.

## 10. Frontend

`MachineImage` / `resolveOwnedMachineImageUrl` — placeholder only when URL null or load fails; does not write placeholder to state/DB.

## 11. Tests

- `tests/uploads/uploadsStatic.test.mjs`
- Existing admin miner upload tests unchanged

## 12. Audit script (read-only)

`scripts/audit-upload-image-files.mjs` — lists miners in DB whose `imageUrl` has no file on disk.

## 13. Pending

- Re-upload machine catalog images for rows pointing to missing `/uploads/machines/*` files.
- Optional: migrate legacy root `/uploads/<file>` into subfolders (manual/ops).
