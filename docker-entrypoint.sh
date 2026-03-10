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

# Run wait function
wait_for_db

# Sync database schema with Prisma db push
echo "Syncing database schema with Prisma db push..."
# Ensure DATABASE_URL is available for the command
npx prisma db push --accept-data-loss --schema=server/prisma/schema.prisma || echo "Database push failed, skipping..."

# Start the application
echo "Seeding store data..."
node server/prisma/seed.js || echo "Seeding failed, skipping..."

echo "Starting application..."
exec "$@"
