-- One on-chain tx hash must not back multiple deposit rows (race + fraud). Partial index allows multiple NULL tx_hash rows.
CREATE UNIQUE INDEX IF NOT EXISTS "transactions_deposit_txhash_uq"
ON "transactions" ("tx_hash")
WHERE "type" = 'deposit' AND "tx_hash" IS NOT NULL;
