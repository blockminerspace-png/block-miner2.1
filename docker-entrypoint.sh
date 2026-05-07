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

# Optional: run Polygon HD microservice in the same container (3-service stack: nginx + app + db).
if is_true "${START_PHD_IN_APP_CONTAINER:-false}"; then
  phd_port="$(printf '%s' "${PHD_PORT:-3847}")"
  echo "Starting embedded PHD on port ${phd_port}..."
  node server/phdServer.js &
  for i in $(seq 1 50); do
    if nc -z 127.0.0.1 "${phd_port}" 2>/dev/null; then
      echo "PHD is accepting connections."
      break
    fi
    sleep 0.1
  done
  if ! nc -z 127.0.0.1 "${phd_port}" 2>/dev/null; then
    echo "Warning: embedded PHD did not open port ${phd_port}; main app will still start."
  fi
  export PHD_SERVICE_URL="${PHD_SERVICE_URL:-http://127.0.0.1:${phd_port}}"
fi

echo "Starting application..."
exec "$@"
