#!/bin/sh
set -e

echo "Starting block-miner container..."

is_true() {
  v="$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')"
  [ "$v" = "1" ] || [ "$v" = "true" ] || [ "$v" = "yes" ] || [ "$v" = "on" ]
}

# Function to wait for database
wait_for_db() {
  echo "Waiting for database at db:5432..."
  # Try to connect to postgres port using nc (netcat) which is available in bookworm-slim
  while ! nc -z db 5432; do
    sleep 1
  done
  echo "Database is up and reachable!"
}

# Wait function
wait_for_db

echo "Database is ready. Syncing Prisma schema..."
# Generate Prisma client if it's missing (failsafe)
npx prisma generate --schema=server/prisma/schema.prisma || true

# Safety first:
# By default, boot MUST NOT change schema/data.
# Explicitly enable with DB_BOOTSTRAP_ON_STARTUP=true when you really want it.
if is_true "${DB_BOOTSTRAP_ON_STARTUP:-false}"; then
  # Deploy schema changes safely (no --accept-data-loss).
  echo "DB_BOOTSTRAP_ON_STARTUP enabled: running prisma db push..."
  npx prisma db push --schema=server/prisma/schema.prisma || {
    echo "Warning: prisma db push failed. Continuing startup to keep service available."
  }
  echo "Database schema sync step finished."

  echo "Running database seed (upserts, safe to re-run)..."
  node server/prisma/seed.js || {
    echo "Warning: seed.js failed. Continuing startup."
  }
else
  echo "DB bootstrap skipped (DB_BOOTSTRAP_ON_STARTUP is false)."
fi

echo "Starting application..."
exec "$@"
