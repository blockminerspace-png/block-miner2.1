# MONOLITH — Machines / Inventory image identity fix

## 1. Root cause

Owned machines on `/inventory` (Minhas Máquinas / Sala de Mineração) showed **wrong or duplicated images** because:

1. **`getMachineDescriptor`** (`client/src/shared/utils/machine.ts`) assigned **stock PNGs by hash rate** (`/machines/reward1.png`, `/machines/2.png`, …) whenever `imageUrl` was missing. Different miners with similar power shared the same artwork.
2. **Backend** persisted **`/machines/reward1.png`** as `imageUrl` on purchase/install (shop, inventory install, faucet, events), treating the UI placeholder as snapshot data.
3. **API list endpoints** returned raw DB `imageUrl` without resolving `UserOwnedMachine` snapshot vs catalog.
4. **`onError` on `<img>`** swapped failed loads to `DEFAULT_MINER_IMAGE_URL`, hiding broken URLs and making distinct machines look identical.

React list keys on racks already used `rack.id` (not array index).

## 2. Where image was resolved before

| Layer | Behavior |
|--------|----------|
| Frontend inventory/rack | `getMachineDescriptor` → hashrate stock image → `sanitizeMachineImageSrc` → `onError` → reward1 |
| `GET /api/inventory` | Raw `user_inventory.image_url` |
| `GET /api/rooms` | Raw `user_miner.image_url` |
| Shop purchase | `currentMiner.imageUrl \|\| /machines/reward1.png` saved to owned machine |

## 3. Where image is resolved now

| Layer | Behavior |
|--------|----------|
| `server/utils/ownedMachineImage.ts` | `resolveOwnedMachineImageUrl`: **catalog** → owned snapshot → `null`; never stock placeholders as truth |
| `GET /api/inventory` | DTO with `imageUrl` + `imageSource` |
| `GET /api/rooms` (rack miner) | Same DTO fields + `ownedMachineId` |
| `GET /api/vault` | Same DTO fields |
| Frontend | `getMachineDisplayImageUrl` + `MachineImage` (placeholder only in UI) |

## 4. Database fields

| Model | Role |
|--------|------|
| `Miner` | Catalog `imageUrl` |
| `UserOwnedMachine` | Canonical snapshot `imageUrl` |
| `UserInventory` / `UserMiner` / `UserVault` | Row copy of snapshot `imageUrl` |

## 5. DTO changes

Response shape (inventory, rack miner, vault row):

```ts
{
  imageUrl: string | null;
  imageSource: "owned_snapshot" | "catalog_current" | "none";
  ownedMachineId?: number | null;
}
```

## 6. Snapshot on acquisition

Purchase/faucet/event/shop now call `normalizePersistableMinerImageUrl` — **null** instead of stock paths when catalog has no custom image.

Install from inventory resolves snapshot before writing `UserMiner` + `syncOwnedMachineSnapshotTx`.

## 7. Legacy rows without snapshot

- Rows with only `/machines/reward*.png` in DB are treated as **no snapshot**; API falls back to **current catalog** `Miner.imageUrl`.
- Optional idempotent backfill: `scripts/backfill-owned-machine-image-snapshots.mjs` (run manually after backup; does not overwrite real snapshots).

## 8. React keys

No change required on rack slots (`key={rack.id}`). Stacked backpack groups still use `inventoryStackKey` (by miner stats); image is per-group from API, not by index.

## 9. Rack / slot

Rack miner image comes from resolved DTO on `GET /rooms`, keyed by `userMiner.id` / `ownedMachineId`, not slot position.

## 10. MachineImage / placeholder

`client/src/pages/machines/components/MachineImage.tsx` — real URL or visual “GPU” placeholder; `onError` only toggles local failed state.

## 11. Tests

| File | Coverage |
|------|----------|
| `tests/machines/ownedMachineImage.test.mjs` | Resolver + persist normalization |
| `tests/inventory/inventoryMachineImages.test.mjs` | Controller wiring + no hashrate images |
| `client/src/pages/machines/components/MachineImage.test.tsx` | Placeholder / real URL / onError |

## 12. Validation commands

Run locally:

```bash
npm run typecheck:server
npm run build:server
cd client && npm run typecheck && npm run build
npm test
cd client && npm test -- src/pages/machines/components/MachineImage.test.tsx
```

## 13. Manual QA

See spec checklist (two miners A/B, rack, warehouse, admin catalog change, reload).

## 14–15. No stray compiled sources

- `server/` source remains `.ts` only (build output in `dist/`).
- `client/src/` remains `.ts`/`.tsx` only.

## 16. Admin catalog image updates

When `Miner.imageUrl` changes in admin, `clearCatalogLinkedMachineImageSnapshots` nulls stale `image_url` on all `user_owned_machines` / inventory / rack / vault rows for that `miner_id`, and the resolver always prefers the current catalog URL.

## 17. Pending

- Run full `docker compose build` in deploy environment if required for release.
- Re-upload admin images for miners whose files were missing on volume (pre-upload path fix).
- Run backfill script in production only after DB backup if legacy rows should freeze catalog image into snapshot.
