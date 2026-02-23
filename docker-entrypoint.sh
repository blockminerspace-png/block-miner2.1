#!/bin/sh

# BlockMiner Docker Entrypoint
# Initializes database and seeds rewards, then starts the server

set -e

echo "=========================================="
echo "BlockMiner Server - Docker Entrypoint"
echo "=========================================="
echo ""

# Ensure data directory exists
mkdir -p /app/data /app/backups /app/logs

echo "Initializing database schema..."
node -e "require('./src/db/sqlite').initializeDatabase().then(() => process.exit(0)).catch((err) => { console.error('DB init failed:', err); process.exit(1); })"

echo "Checking database and rewards..."
node scripts/seed-rewards-data.js

echo ""
echo "Starting BlockMiner server on port 3000..."
echo "=========================================="
echo ""

exec node server.js
