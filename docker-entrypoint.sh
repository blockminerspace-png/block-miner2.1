#!/bin/sh
set -e

echo "Starting block-miner container..."

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

# Deploy schema changes safely
echo "Running prisma db push..."
npx prisma db push --schema=server/prisma/schema.prisma --accept-data-loss || {
  echo "Warning: prisma db push failed. Continuing startup to keep service available."
}

echo "Database schema sync step finished."

echo "Starting application..."
exec "$@"
