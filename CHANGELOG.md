# Changelog

All notable changes to this project are documented in this file. The format is inspired by Keep a Changelog; entries are grouped by release date.

## [2026-04-13]

### Added

- `CHANGELOG.md` for developer-facing change history.
- `faucet.permanent_equipment_note` (en / pt-BR / es) and UI copy on the Faucet page clarifying permanent equipment.
- `scripts/clear-faucet-inventory-expiry.mjs` optional one-off script to clear `expires_at` on existing faucet-reward inventory rows after deploy.

### Fixed

- Faucet miner no longer receives a 24-hour `expiresAt` on `user_inventory`, so periodic cleanup no longer deletes it silently; behavior matches permanent machines (shop/shortlink pattern).

### Changed

- Manual (PT): faucet section notes that faucet equipment is permanent inventory.
- `gamePowerCleanup` comment: expired inventory cleanup described as time-limited rows only, not faucet-specific.
